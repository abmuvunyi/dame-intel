import { Test, TestingModule } from '@nestjs/testing';
import { PresenceService } from './presence.service';

describe('PresenceService', () => {
  let service: PresenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PresenceService],
    }).compile();
    service = module.get<PresenceService>(PresenceService);
  });

  it('reports a user offline before they\'ve ever been marked online', () => {
    expect(service.isOnline(1)).toBe(false);
  });

  it('reports a user online once marked, and offline again once marked offline', () => {
    service.markOnline(1);
    expect(service.isOnline(1)).toBe(true);
    service.markOffline(1);
    expect(service.isOnline(1)).toBe(false);
  });

  it('tracks multiple users independently', () => {
    service.markOnline(1);
    service.markOnline(2);
    expect(service.getOnlineUserIds().sort()).toEqual([1, 2]);
    service.markOffline(1);
    expect(service.getOnlineUserIds()).toEqual([2]);
  });

  it('is idempotent — marking the same user online twice does not duplicate them', () => {
    service.markOnline(1);
    service.markOnline(1);
    expect(service.getOnlineUserIds()).toEqual([1]);
  });
});
