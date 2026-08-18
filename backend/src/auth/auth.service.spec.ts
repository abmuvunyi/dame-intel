import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: {} },
        { provide: JwtService, useValue: {} }
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

// Phase 12: login must respect an existing ban (isCurrentlyBanned), but must never
// be the thing that BANS anyone — that's exclusively AnticheatService's moderator
// action, elsewhere. Real bcrypt hashing (not mocked) so this exercises the actual
// password check `signIn` performs, not a stand-in for it.
describe('AuthService: ban enforcement at login (Phase 12)', () => {
  let service: AuthService;
  let usersService: { findOneByUsername: jest.Mock, isCurrentlyBanned: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  const PASSWORD = 'correct-horse-battery-staple';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  beforeEach(async () => {
    usersService = {
      findOneByUsername: jest.fn(),
      isCurrentlyBanned: jest.fn(),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('a-real-looking-jwt') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('logs in normally when the password is correct and the account is not banned', async () => {
    usersService.findOneByUsername.mockResolvedValue({ id: 1, username: 'alice', passwordHash, moderationStatus: 'NONE' });
    usersService.isCurrentlyBanned.mockReturnValue(false);

    const result = await service.signIn('alice', PASSWORD);
    expect(result.access_token).toBe('a-real-looking-jwt');
  });

  it('rejects a correct password for a PERMA_BANNED account, with a message naming the ban', async () => {
    usersService.findOneByUsername.mockResolvedValue({ id: 2, username: 'bob', passwordHash, moderationStatus: 'PERMA_BANNED' });
    usersService.isCurrentlyBanned.mockReturnValue(true);

    await expect(service.signIn('bob', PASSWORD)).rejects.toThrow(UnauthorizedException);
    await expect(service.signIn('bob', PASSWORD)).rejects.toThrow(/permanently banned/i);
  });

  it('rejects a correct password for a currently-TEMP_BANNED account', async () => {
    const tempBanUntil = new Date(Date.now() + 60_000);
    usersService.findOneByUsername.mockResolvedValue({ id: 3, username: 'carol', passwordHash, moderationStatus: 'TEMP_BANNED', tempBanUntil });
    usersService.isCurrentlyBanned.mockReturnValue(true);

    await expect(service.signIn('carol', PASSWORD)).rejects.toThrow(UnauthorizedException);
    await expect(service.signIn('carol', PASSWORD)).rejects.toThrow(/temporarily banned/i);
  });

  it('still rejects an outright wrong password before ever checking ban status', async () => {
    usersService.findOneByUsername.mockResolvedValue({ id: 4, username: 'dave', passwordHash, moderationStatus: 'NONE' });
    usersService.isCurrentlyBanned.mockReturnValue(false);

    await expect(service.signIn('dave', 'totally-wrong-password')).rejects.toThrow(UnauthorizedException);
    expect(usersService.isCurrentlyBanned).not.toHaveBeenCalled();
  });

  it('logs in a WARNED account normally — a warning is not a ban', async () => {
    usersService.findOneByUsername.mockResolvedValue({ id: 5, username: 'erin', passwordHash, moderationStatus: 'WARNED' });
    usersService.isCurrentlyBanned.mockReturnValue(false); // WARNED alone never bans, per UsersService.isCurrentlyBanned

    const result = await service.signIn('erin', PASSWORD);
    expect(result.access_token).toBe('a-real-looking-jwt');
  });
});
