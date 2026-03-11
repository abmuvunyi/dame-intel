import { Test, TestingModule } from '@nestjs/testing';
import { AnticheatService } from './anticheat.service';

describe('AnticheatService', () => {
  let service: AnticheatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnticheatService],
    }).compile();

    service = module.get<AnticheatService>(AnticheatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
