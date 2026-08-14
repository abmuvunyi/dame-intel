import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Club } from './club.entity';
import { ClubMembership } from './club-membership.entity';
import { ClubPost } from './club-post.entity';
import { UsersService } from '../users/users.service';
// Reusing the same wordlist filter built for in-game chat (Phase 10) — a club's
// discussion feed deserves the same basic moderation as game chat did. No spam rate
// limit here though: that's a real-time-chat concern (many rapid-fire messages in a
// live game); a REST-posted club feed doesn't have the same failure mode.
import { filterMessage } from '../game/chat-filter';

@Injectable()
export class ClubsService {
  constructor(
    @InjectRepository(Club) private clubRepository: Repository<Club>,
    @InjectRepository(ClubMembership) private membershipRepository: Repository<ClubMembership>,
    @InjectRepository(ClubPost) private postRepository: Repository<ClubPost>,
    private usersService: UsersService,
  ) {}

  async createClub(userId: number, name: string, description?: string): Promise<Club> {
    if (!name || !name.trim()) throw new BadRequestException('Club name is required');
    const creator = await this.usersService.findOneById(userId);
    if (!creator) throw new BadRequestException('Invalid user');

    const club = await this.clubRepository.save(
      this.clubRepository.create({ name: name.trim(), description: description?.trim() ?? '', createdBy: creator }),
    );
    // The creator is automatically a member — there's no "club with zero members"
    // state to worry about, and no separate "confirm your own club" step.
    await this.membershipRepository.save(this.membershipRepository.create({ clubId: club.id, userId }));
    return club;
  }

  async getAllClubs(): Promise<(Club & { memberCount: number })[]> {
    const clubs = await this.clubRepository.find({ relations: ['createdBy'], order: { createdAt: 'DESC' } });
    const withCounts = await Promise.all(
      clubs.map(async (club) => {
        const memberCount = await this.membershipRepository.count({ where: { clubId: club.id } });
        return Object.assign(club, { memberCount });
      }),
    );
    return withCounts;
  }

  async getClub(clubId: number): Promise<(Club & { memberCount: number }) | null> {
    const club = await this.clubRepository.findOne({ where: { id: clubId }, relations: ['createdBy'] });
    if (!club) return null;
    const memberCount = await this.membershipRepository.count({ where: { clubId } });
    return Object.assign(club, { memberCount });
  }

  async getClubMembers(clubId: number) {
    const memberships = await this.membershipRepository.find({ where: { clubId }, relations: ['user'], order: { joinedAt: 'ASC' } });
    return memberships.map(m => ({ id: m.user.id, username: m.user.username, joinedAt: m.joinedAt }));
  }

  async getMyClubs(userId: number): Promise<(Club & { memberCount: number })[]> {
    const memberships = await this.membershipRepository.find({ where: { userId }, relations: ['club'] });
    return Promise.all(
      memberships.map(async (m) => {
        const memberCount = await this.membershipRepository.count({ where: { clubId: m.clubId } });
        return Object.assign(m.club, { memberCount });
      }),
    );
  }

  async isMember(clubId: number, userId: number): Promise<boolean> {
    const membership = await this.membershipRepository.findOne({ where: { clubId, userId } });
    return !!membership;
  }

  async joinClub(clubId: number, userId: number): Promise<ClubMembership> {
    const club = await this.clubRepository.findOneBy({ id: clubId });
    if (!club) throw new NotFoundException('Club not found');

    const existing = await this.membershipRepository.findOne({ where: { clubId, userId } });
    if (existing) return existing; // idempotent, same convention as joinTournament

    return this.membershipRepository.save(this.membershipRepository.create({ clubId, userId }));
  }

  async leaveClub(clubId: number, userId: number): Promise<{ success: boolean }> {
    const membership = await this.membershipRepository.findOne({ where: { clubId, userId } });
    if (membership) await this.membershipRepository.remove(membership);
    return { success: true };
  }

  async postToClub(clubId: number, userId: number, content: string): Promise<ClubPost> {
    if (!content || !content.trim()) throw new BadRequestException('Post content is required');
    if (!(await this.isMember(clubId, userId))) {
      throw new BadRequestException('Only club members can post to the discussion feed');
    }
    const author = await this.usersService.findOneById(userId);
    if (!author) throw new BadRequestException('Invalid user');

    const { filtered } = filterMessage(content.trim());
    return this.postRepository.save(this.postRepository.create({ clubId, author, content: filtered }));
  }

  async getClubFeed(clubId: number, userId: number): Promise<ClubPost[]> {
    if (!(await this.isMember(clubId, userId))) {
      throw new BadRequestException('Only club members can view the discussion feed');
    }
    // Ordered by id, not createdAt: sqlite's datetime column only has second-level
    // precision, so two posts created within the same second would tie on createdAt
    // and the DB is free to return them in either order. id is strictly monotonic
    // with insertion order regardless of timestamp resolution.
    return this.postRepository.find({ where: { clubId }, relations: ['author'], order: { id: 'DESC' } });
  }
}
