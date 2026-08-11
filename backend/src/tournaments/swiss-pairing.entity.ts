import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { SwissRound } from './swiss-round.entity';

@Entity()
export class SwissPairingRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SwissRound)
  round: SwissRound;

  @Column()
  roundId: number;

  @Column()
  player1Id: number;

  @Column({ nullable: true, type: 'int' })
  player2Id: number | null; // null = a bye for player1

  @Column({ nullable: true })
  result: string; // 'P1_WIN' | 'P2_WIN' | 'DRAW' | 'BYE' — unset until the game (or bye) resolves

  @Column({ nullable: true, type: 'int' })
  gameHistoryId: number | null;
}
