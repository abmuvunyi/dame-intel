import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';

const EMAIL_SUBJECTS: Record<string, string> = {
  FRIEND_REQUEST: 'New friend request',
  CHALLENGE_RECEIVED: 'You have been challenged to a game',
  TOURNAMENT_STARTING: 'Your tournament is starting',
  CORRESPONDENCE_TURN_REMINDER: "It's your move",
};

// The single entry point every trigger point (friend requests, challenges,
// tournament starts, correspondence-turn reminders) calls — creates the persisted
// in-app notification AND fires the matching email in one call, so no caller can
// forget to do one or the other.
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}

  async notify(userId: number, type: string, message: string, data?: any): Promise<Notification> {
    const notification = this.notificationRepository.create({ userId, type, message, data: data ?? null });
    const saved = await this.notificationRepository.save(notification);

    // Best-effort — a failed or skipped email must never affect the in-app
    // notification, which is already saved above regardless of what happens here.
    const user = await this.usersService.findOneById(userId);
    if (user?.email) {
      await this.emailService.send({
        to: user.email,
        subject: EMAIL_SUBJECTS[type] ?? 'New notification',
        text: message,
      });
    }

    return saved;
  }

  async getForUser(userId: number, limit = 30): Promise<Notification[]> {
    // id DESC as a tiebreaker, not just cosmetic: CreateDateColumn's sqlite column is
    // second-resolution, so two notifications created within the same second (a real
    // scenario — e.g. a tournament-starting fan-out to many players) tie on createdAt
    // alone and would otherwise come back in an unspecified order. id is a reliable
    // insertion-order proxy.
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
  }

  async getUnreadCount(userId: number): Promise<number> {
    return this.notificationRepository.count({ where: { userId, read: false } });
  }

  // Scoped to (id, userId) together — never lets a user mark someone else's
  // notification read just by guessing an id.
  async markRead(id: number, userId: number): Promise<void> {
    await this.notificationRepository.update({ id, userId }, { read: true });
  }

  async markAllRead(userId: number): Promise<void> {
    await this.notificationRepository.update({ userId, read: false }, { read: true });
  }
}
