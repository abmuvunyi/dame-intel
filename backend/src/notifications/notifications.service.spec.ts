import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { UsersService } from '../users/users.service';
import { Notification } from './notification.entity';

// Real in-memory sqlite for Notification, so persistence/ordering/scoping are
// genuinely exercised — UsersService and EmailService are mocked (no real email
// provider was available; see subscriptions.service.spec.ts and STATUS.md's Phase 13
// section for the same trade-off applied there).
describe('NotificationsService', () => {
  let service: NotificationsService;
  let usersServiceMock: { findOneById: jest.Mock };
  let emailServiceMock: { send: jest.Mock };

  beforeEach(async () => {
    usersServiceMock = { findOneById: jest.fn() };
    emailServiceMock = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [Notification], synchronize: true }),
        TypeOrmModule.forFeature([Notification]),
      ],
      providers: [
        NotificationsService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('notify', () => {
    it('always persists the in-app notification, regardless of email', async () => {
      usersServiceMock.findOneById.mockResolvedValue({ id: 1, email: null });
      const saved = await service.notify(1, 'FRIEND_REQUEST', 'Alice sent you a friend request', { friendshipId: 42 });

      expect(saved.id).toBeDefined();
      expect(saved.userId).toBe(1);
      expect(saved.type).toBe('FRIEND_REQUEST');
      expect(saved.message).toBe('Alice sent you a friend request');
      expect(saved.data).toEqual({ friendshipId: 42 });
      expect(saved.read).toBe(false);
    });

    it('sends an email using the type-specific subject when the user has an email on file', async () => {
      usersServiceMock.findOneById.mockResolvedValue({ id: 2, email: 'bob@example.com' });
      await service.notify(2, 'CHALLENGE_RECEIVED', 'Carol has challenged you to a game');

      expect(emailServiceMock.send).toHaveBeenCalledWith({
        to: 'bob@example.com',
        subject: 'You have been challenged to a game',
        text: 'Carol has challenged you to a game',
      });
    });

    it('skips the email but still saves the notification when the user has no email on file', async () => {
      usersServiceMock.findOneById.mockResolvedValue({ id: 3, email: null });
      const saved = await service.notify(3, 'TOURNAMENT_STARTING', 'Your tournament has started');

      expect(saved.id).toBeDefined();
      expect(emailServiceMock.send).not.toHaveBeenCalled();
    });

    it('falls back to a generic subject for a notification type with no dedicated subject line', async () => {
      usersServiceMock.findOneById.mockResolvedValue({ id: 4, email: 'dana@example.com' });
      await service.notify(4, 'SOME_UNMAPPED_TYPE', 'Something happened');

      expect(emailServiceMock.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'New notification' }));
    });
  });

  describe('getForUser', () => {
    it('returns only this user\'s notifications, newest first', async () => {
      usersServiceMock.findOneById.mockResolvedValue({ id: 5, email: null });
      await service.notify(5, 'FRIEND_REQUEST', 'first');
      await service.notify(5, 'FRIEND_REQUEST', 'second');
      await service.notify(6, 'FRIEND_REQUEST', 'someone else entirely');

      const results = await service.getForUser(5);
      expect(results).toHaveLength(2);
      expect(results.map((n) => n.message)).toEqual(['second', 'first']);
    });

    it('respects the limit parameter', async () => {
      usersServiceMock.findOneById.mockResolvedValue({ id: 7, email: null });
      for (let i = 0; i < 5; i++) await service.notify(7, 'FRIEND_REQUEST', `msg${i}`);

      const results = await service.getForUser(7, 2);
      expect(results).toHaveLength(2);
    });
  });

  describe('getUnreadCount', () => {
    it('counts only unread notifications for that user', async () => {
      usersServiceMock.findOneById.mockResolvedValue({ id: 8, email: null });
      const n1 = await service.notify(8, 'FRIEND_REQUEST', 'a');
      await service.notify(8, 'FRIEND_REQUEST', 'b');
      await service.markRead(n1.id, 8);

      expect(await service.getUnreadCount(8)).toBe(1);
    });
  });

  describe('markRead', () => {
    it('is scoped to (id, userId) — cannot mark another user\'s notification read', async () => {
      usersServiceMock.findOneById.mockResolvedValue({ id: 9, email: null });
      const notification = await service.notify(9, 'FRIEND_REQUEST', 'for user 9');

      await service.markRead(notification.id, 999); // wrong user id
      const [stillUnread] = await service.getForUser(9);
      expect(stillUnread.read).toBe(false);

      await service.markRead(notification.id, 9); // correct user id
      const [nowRead] = await service.getForUser(9);
      expect(nowRead.read).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('marks every unread notification for that user as read, and leaves other users untouched', async () => {
      usersServiceMock.findOneById.mockResolvedValue({ id: 10, email: null });
      await service.notify(10, 'FRIEND_REQUEST', 'x');
      await service.notify(10, 'FRIEND_REQUEST', 'y');
      await service.notify(11, 'FRIEND_REQUEST', 'other user');

      await service.markAllRead(10);

      const user10 = await service.getForUser(10);
      expect(user10.every((n) => n.read)).toBe(true);

      const user11 = await service.getForUser(11);
      expect(user11.every((n) => !n.read)).toBe(true);
    });
  });
});
