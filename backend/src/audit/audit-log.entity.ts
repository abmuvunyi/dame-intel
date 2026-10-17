import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Append-only security/audit trail: who changed what, when, from where. No code path
// updates or deletes rows (there is no update/delete API); retention/archiving is a
// database-level operation. Never store secrets, card data or full tokens here.
@Entity()
@Index(['action', 'createdAt'])
@Index(['targetType', 'targetId'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  // 'USER' (a signed-in person), 'SYSTEM' (scheduled job / boot), 'STRIPE' (webhook), 'CLI'
  @Column({ default: 'USER' })
  actorType: string;

  @Index()
  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  // Dotted verb, e.g. 'roles.changed', 'moderation.action', 'trial.started'
  @Column()
  action: string;

  @Column({ type: 'text', nullable: true })
  targetType: string | null; // e.g. 'user', 'tournament', 'puzzle', 'cheat_flag'

  @Column({ type: 'text', nullable: true })
  targetId: string | null;

  @Column('simple-json', { nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  ip: string | null;

  @Column({ type: 'text', nullable: true })
  requestId: string | null;
}
