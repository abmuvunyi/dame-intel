import { Body, Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthGuard } from './auth.guard';
import { Throttle } from '@nestjs/throttler';
import { LoginDto, RegisterDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
      private authService: AuthService,
      private usersService: UsersService
    ) {}

  // Phase 14: brute-force protection — 10 attempts per minute per client IP.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  signIn(@Request() req: any, @Body() signInDto: LoginDto) {
    return this.authService.signIn(signInDto.username, signInDto.password, req);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  signUp(@Request() req: any, @Body() signUpDto: RegisterDto) {
    return this.authService.signUp(signUpDto.username, signUpDto.password, req);
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    const user = req.authUser; // loaded and checked by AuthGuard
    const access = this.usersService.accessFor(user);
    // Return only what the client needs — not Stripe identifiers or moderation notes.
    return {
      id: user.id,
      username: user.username,
      roles: this.usersService.getRoles(user),
      permissions: this.usersService.getPermissions(user),
      plan: access.plan,
      planSource: access.source,
      entitlements: access.entitlements,
      trial: access.trial,
      rating: user.rating,
      gamesPlayed: user.gamesPlayed,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      membershipTier: user.membershipTier,
      membershipStatus: user.membershipStatus,
      membershipRenewsAt: user.membershipRenewsAt,
      moderationStatus: user.moderationStatus,
      email: user.email,
      currentStreak: user.currentStreak,
      lastPlayedDate: user.lastPlayedDate,
    };
  }

  // Phase 15: "log out everywhere" — invalidates every token issued so far.
  @UseGuards(AuthGuard)
  @Post('logout-all')
  async logoutAll(@Request() req: any) {
    await this.usersService.revokeSessions(req.user.sub);
    return { ok: true };
  }
}
