import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { jwtConstants } from './constants';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

export interface JwtPayload {
  sub: number;
  username: string;
  /** User.tokenVersion at the time the token was issued (absent on pre-Phase-15 tokens = 0). */
  tv?: number;
}

/** Throws unless the token is valid AND its account can still act. Shared with OptionalAuthGuard and the WebSocket gateway. */
export async function authenticateToken(
  token: string,
  jwtService: JwtService,
  usersService: UsersService,
): Promise<{ payload: JwtPayload; user: User }> {
  const payload = await jwtService.verifyAsync<JwtPayload>(token, { secret: jwtConstants.secret });
  const user = await usersService.findOneById(payload.sub);
  // Phase 15: tokens are now revocable. A token stops working immediately when the
  // account is deleted, banned, or has its sessions revoked (role change, ban,
  // "log out everywhere") — previously a banned user's token kept working on HTTP
  // routes for up to 7 days.
  if (!user) throw new UnauthorizedException();
  if (usersService.isCurrentlyBanned(user)) throw new UnauthorizedException('This account is banned.');
  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) throw new UnauthorizedException('Session expired. Please sign in again.');
  return { payload, user };
}

export function extractBearerToken(request: Request): string | undefined {
  const [type, token] = request.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' ? token : undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request);
    if (!token) throw new UnauthorizedException();
    try {
      const { payload, user } = await authenticateToken(token, this.jwtService, this.usersService);
      request['user'] = payload; // unchanged shape for existing handlers (req.user.sub)
      request['authUser'] = user; // the fresh DB row, used by PermissionsGuard/entitlements
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException();
    }
    return true;
  }
}

/**
 * Never rejects: attaches req.user / req.authUser when a valid token is present and
 * leaves the request anonymous otherwise. For routes open to guests that behave
 * differently for signed-in players (plan entitlements, puzzle ratings).
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request);
    if (token) {
      try {
        const { payload, user } = await authenticateToken(token, this.jwtService, this.usersService);
        request['user'] = payload;
        request['authUser'] = user;
      } catch {
        /* anonymous */
      }
    }
    return true;
  }
}
