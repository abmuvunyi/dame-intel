import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

// One row per in-app notification. Deliberately flat (userId, not a full User
// relation) for the same reason SwissPairingRecord uses plain player ids over full
// User relations — this is a high-volume, read-heavy table where every query is "for
// this user id", not something that needs to join out to the user's other data.
@Entity()
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  type: string; // 'FRIEND_REQUEST' | 'CHALLENGE_RECEIVED' | 'TOURNAMENT_STARTING' | 'CORRESPONDENCE_TURN_REMINDER'

  @Column()
  message: string; // precomputed, human-readable at creation time — no client-side templating needed

  // Structured payload for the frontend to link out from (e.g. { friendshipId },
  // { challengeId }, { tournamentId }, { gameId }) — shape depends on `type`.
  @Column('simple-json', { nullable: true })
  data: any;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
