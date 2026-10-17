import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  // Phase 15: `tv` (token version) lets the server revoke every outstanding token for
  // an account at once — see AuthGuard.
  private sign(user: { id: number; username: string; tokenVersion?: number }) {
    return this.jwtService.signAsync({ sub: user.id, username: user.username, tv: user.tokenVersion ?? 0 });
  }

  async signIn(username: string, pass: string, req?: any): Promise<{ access_token: string }> {
    const user = await this.usersService.findOneByUsername(username);
    const isMatch = user ? await bcrypt.compare(pass, user.passwordHash) : false;
    if (!user || !isMatch) {
      // Security logging: failed sign-ins (never the password itself).
      await this.audit?.record({
        action: 'auth.login_failed', actorType: 'USER', targetType: 'user', targetId: user?.id ?? null,
        details: { username: String(username).slice(0, 64) }, req,
      });
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
      await this.audit?.record({ action: 'auth.login_blocked_banned', actorUserId: user.id, targetType: 'user', targetId: user.id, req });
      throw new UnauthorizedException(message);
    }
    return { access_token: await this.sign(user) };
  }

  async signUp(username: string, pass: string, req?: any): Promise<{ access_token: string }> {
    const existingUser = await this.usersService.findOneByUsername(username);
    if (existingUser) {
        throw new UnauthorizedException('Username already exists');
    }
    const saltOrRounds = 10;
    const hash = await bcrypt.hash(pass, saltOrRounds);

    const user = await this.usersService.create(username, hash);
    await this.audit?.record({ action: 'auth.registered', actorUserId: user.id, targetType: 'user', targetId: user.id, req });
    return { access_token: await this.sign(user) };
  }
}