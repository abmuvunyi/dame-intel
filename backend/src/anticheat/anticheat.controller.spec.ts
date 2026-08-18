import { Test, TestingModule } from '@nestjs/testing';
import { AnticheatController } from './anticheat.controller';
import { AnticheatService } from './anticheat.service';
import { JwtService } from '@nestjs/jwt';

describe('AnticheatController', () => {
  let controller: AnticheatController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      getFlags: jest.fn().mockResolvedValue([]),
      getFlag: jest.fn().mockResolvedValue({ id: 1 }),
      getFlagsForUser: jest.fn().mockResolvedValue([]),
      applyModeratorAction: jest.fn().mockResolvedValue({ id: 1, reviewed: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnticheatController],
      providers: [
        { provide: AnticheatService, useValue: service },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AnticheatController>(AnticheatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET flags with no query param passes undefined (no filter — everything)', async () => {
    await controller.getFlags(undefined);
    expect(service.getFlags).toHaveBeenCalledWith(undefined);
  });

  it('GET flags?reviewed=false parses to the boolean false', async () => {
    await controller.getFlags('false');
    expect(service.getFlags).toHaveBeenCalledWith(false);
  });

  it('GET flags?reviewed=true parses to the boolean true', async () => {
    await controller.getFlags('true');
    expect(service.getFlags).toHaveBeenCalledWith(true);
  });

  it('GET flags/:id routes to getFlag with a parsed numeric id', async () => {
    await controller.getFlag(7);
    expect(service.getFlag).toHaveBeenCalledWith(7);
  });

  it('GET users/:userId/flags routes to getFlagsForUser', async () => {
    await controller.getFlagsForUser(42);
    expect(service.getFlagsForUser).toHaveBeenCalledWith(42);
  });

  it('POST flags/:id/review passes the authenticated moderator\'s id and the full action body', async () => {
    await controller.reviewFlag({ user: { sub: 99 } }, 7, { action: 'TEMP_BAN', note: 'suspicious', tempBanDays: 3 });
    expect(service.applyModeratorAction).toHaveBeenCalledWith(7, 99, 'TEMP_BAN', 'suspicious', 3);
  });
});
