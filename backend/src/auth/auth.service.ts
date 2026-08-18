import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async signIn(username: string, pass: string): Promise<{ access_token: string }> {
    const user = await this.usersService.findOneByUsername(username);
    if (!user) {
      throw new UnauthorizedException();
    }
    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException();
    }
    // Phase 12: the one piece of real enforcement behind the graduated-response
    // scaffolding — a PERMA_BANNED or currently-TEMP_BANNED user can't obtain a new
    // session. moderationStatus itself is only ever set through a moderator's
    // deliberate review action (see AnticheatService.applyModeratorAction) — this
    // check never bans anyone itself, it just respects an existing ban.
    if (this.usersService.isCurrentlyBanned(user)) {
      const message = user.moderationStatus === 'PERMA_BANNED'
        ? 'This account has been permanently banned.'
        : `This account is temporarily banned until ${user.tempBanUntil?.toISOString()}.`;
      throw new UnauthorizedException(message);
    }
    const payload = { sub: user.id, username: user.username };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async signUp(username: string, pass: string): Promise<{ access_token: string }> {
    const existingUser = await this.usersService.findOneByUsername(username);
    if (existingUser) {
        throw new UnauthorizedException('Username already exists');
    }
    const saltOrRounds = 10;
    const hash = await bcrypt.hash(pass, saltOrRounds);

    const user = await this.usersService.create(username, hash);
    const payload = { sub: user.id, username: user.username };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}