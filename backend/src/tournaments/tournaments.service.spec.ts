import { Test, TestingModule } from '@nestjs/testing';
import { TournamentsService } from './tournaments.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tournament } from './tournament.entity';
import { TournamentPlayer } from './tournament-player.entity';
import { UsersService } from '../users/users.service';

describe('TournamentsService', () => {
  let service: TournamentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsService,
        { provide: getRepositoryToken(Tournament), useValue: {} },
        { provide: getRepositoryToken(TournamentPlayer), useValue: {} },
        { provide: UsersService, useValue: {} }
      ],
    }).compile();

    service = module.get<TournamentsService>(TournamentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
