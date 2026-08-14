import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friendship } from './friendship.entity';
import { UsersService } from '../users/users.service';
import { PresenceService } from '../presence/presence.service';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friendship)
    private friendshipRepository: Repository<Friendship>,
    private usersService: UsersService,
    private presenceService: PresenceService,
  ) {}

  async sendFriendRequest(senderId: number, targetUsername: string) {
    const targetUser = await this.usersService.findOneByUsername(targetUsername);
    if (!targetUser) throw new BadRequestException('User not found');
    if (targetUser.id === senderId) throw new BadRequestException('Cannot add yourself');

    const existing = await this.friendshipRepository.findOne({
      where: [
        { user1: { id: senderId }, user2: { id: targetUser.id } },
        { user1: { id: targetUser.id }, user2: { id: senderId } }
      ]
    });

    if (existing) throw new BadRequestException('Friendship or request already exists');

    const user1 = await this.usersService.findOneById(senderId);

    if(!user1) throw new BadRequestException('Invalid sender');

    const friendship = this.friendshipRepository.create({
      user1,
      user2: targetUser,
      status: 'PENDING'
    });

    return this.friendshipRepository.save(friendship);
  }

  async acceptFriendRequest(userId: number, friendshipId: number) {
    const friendship = await this.friendshipRepository.findOne({
      where: { id: friendshipId },
      relations: ['user1', 'user2']
    });

    if (!friendship || friendship.user2.id !== userId) {
      throw new BadRequestException('Invalid request');
    }

    friendship.status = 'ACCEPTED';
    return this.friendshipRepository.save(friendship);
  }

  // Declining (unlike accepting) deletes the request outright rather than marking it
  // some 'DECLINED' status — sendFriendRequest's duplicate check above doesn't filter
  // by status, so a permanently-kept 'DECLINED' row would silently block either side
  // from ever sending a fresh request again. Deleting it means "no" isn't forever.
  async declineFriendRequest(userId: number, friendshipId: number) {
    const friendship = await this.friendshipRepository.findOne({
      where: { id: friendshipId },
      relations: ['user1', 'user2']
    });

    if (!friendship || friendship.user2.id !== userId || friendship.status !== 'PENDING') {
      throw new BadRequestException('Invalid request');
    }

    await this.friendshipRepository.remove(friendship);
    return { success: true };
  }

  async getFriendsList(userId: number) {
    const friendships = await this.friendshipRepository.find({
      where: [
        { user1: { id: userId }, status: 'ACCEPTED' },
        { user2: { id: userId }, status: 'ACCEPTED' },
        { user2: { id: userId }, status: 'PENDING' } // Show pending requests we received
      ],
      relations: ['user1', 'user2']
    });

    return friendships.map(f => {
      const isPending = f.status === 'PENDING';
      const friend = f.user1.id === userId ? f.user2 : f.user1;
      return {
        id: f.id,
        friendId: friend.id,
        username: friend.username,
        status: f.status,
        isIncomingRequest: isPending && f.user2.id === userId,
        // Phase 10: "has a live socket right now", from the same in-memory registry
        // GameGateway updates on every connect/disconnect — not persisted, so this is
        // always a snapshot of the current moment, same as a real presence indicator.
        online: this.presenceService.isOnline(friend.id),
      };
    });
  }
}
