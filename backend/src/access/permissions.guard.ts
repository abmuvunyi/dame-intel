import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, hasPermission } from './roles';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Requires ALL listed permissions. Use after AuthGuard:
 *   @UseGuards(AuthGuard, PermissionsGuard) @RequirePermissions(PERMISSIONS.PUZZLES_MANAGE)
 */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

// Roles are read from the database row AuthGuard just loaded (req.authUser), never
// from the token, so granting or revoking a role takes effect on the next request.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest().authUser;
    if (!user) throw new UnauthorizedException();
    const missing = required.filter((p) => !hasPermission(user.roles, p));
    if (missing.length > 0) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    return true;
  }
}
