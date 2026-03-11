import { Test, TestingModule } from '@nestjs/testing';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { JwtService } from '@nestjs/jwt';

describe('TournamentsController', () => {
  let controller: TournamentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TournamentsController],
      providers: [
        { provide: TournamentsService, useValue: {} },
        { provide: JwtService, useValue: {} }
      ]
    }).compile();

    controller = module.get<TournamentsController>(TournamentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
