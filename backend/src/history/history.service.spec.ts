import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistoryService } from './history.service';
import { UsersService } from '../users/users.service';
import { GameHistory } from './history.entity';
import { User } from '../users/user.entity';

describe('HistoryService', () => {
  let service: HistoryService;
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [GameHistory, User], synchronize: true }),
        TypeOrmModule.forFeature([GameHistory, User]),
      ],
      providers: [HistoryService, UsersService],
    }).compile();

    service = module.get<HistoryService>(HistoryService);
    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Real behavioral coverage for the home-dashboard streak wiring — saveGame is the
  // single choke point every completed game (PvP or vs-AI) passes through, so this is
  // the one place that needs to prove the streak actually updates, not just that
  // UsersService.recordDailyPlay itself works in isolation (already covered by
  // users.service.spec.ts).
  describe('daily-play streak wiring', () => {
    it('updates the streak for both players in a real PvP game', async () => {
      const alice = await usersService.create('alice', 'hash');
      const bob = await usersService.create('bob', 'hash');

      await service.saveGame(alice, bob, 'L', [], {});

      const freshAlice = await usersService.findOneById(alice.id);
      const freshBob = await usersService.findOneById(bob.id);
      expect(freshAlice!.currentStreak).toBe(1);
      expect(freshBob!.currentStreak).toBe(1);
    });

    it('updates the streak only for the real human side of a vs-AI game', async () => {
      const alice = await usersService.create('alice', 'hash');

      await service.saveGame(alice, null, 'L', [], {}); // darkPlayer null == AI opponent

      const freshAlice = await usersService.findOneById(alice.id);
      expect(freshAlice!.currentStreak).toBe(1);
    });

    it('does not throw when both sides are anonymous (no accounts at all)', async () => {
      await expect(service.saveGame(null, null, 'DRAW', [], {})).resolves.toBeDefined();
    });

    it('still saves the game even if updating the streak throws', async () => {
      const alice = await usersService.create('alice', 'hash');
      jest.spyOn(usersService, 'recordDailyPlay').mockRejectedValueOnce(new Error('DB unavailable'));

      const saved = await service.saveGame(alice, null, 'L', [], {});
      expect(saved.id).toBeDefined();
    });
  });
});
