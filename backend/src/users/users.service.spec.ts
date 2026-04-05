import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Repository } from 'typeorm';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
           provide: getRepositoryToken(User),
           useClass: Repository
        }
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate ELO correctly', () => {
    // Standard win
    let delta = service.calculateEloChange(1200, 1200, 'win', 50);
    expect(delta).toBe(10); // K=20 * (1 - 0.5)

    // Standard loss
    delta = service.calculateEloChange(1200, 1200, 'loss', 50);
    expect(delta).toBe(-10); // K=20 * (0 - 0.5)

    // Provisional player win (high K factor)
    delta = service.calculateEloChange(1200, 1200, 'win', 5);
    expect(delta).toBe(20); // K=40 * 0.5

    // GM win (low K factor)
    delta = service.calculateEloChange(2500, 2500, 'win', 500);
    expect(delta).toBe(5); // K=10 * 0.5
  });
});
