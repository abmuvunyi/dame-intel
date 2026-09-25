import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY, PermissionsGuard } from './permissions.guard';
import { PERMISSIONS } from './roles';
import { AuthGuard } from '../auth/auth.guard';
import { AnticheatController } from '../anticheat/anticheat.controller';
import { PuzzlesController } from '../puzzles/puzzles.controller';
import { AdminController } from '../admin/admin.controller';

function ctx(authUser: any, required: string[] | undefined): ExecutionContext {
  const handler = () => undefined;
  if (required) Reflect.defineMetadata(PERMISSIONS_KEY, required, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ authUser }) }),
  } as any;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('lets a route with no permission requirement through', () => {
    expect(guard.canActivate(ctx({ roles: [] }, undefined))).toBe(true);
  });

  it('allows a user whose roles grant the permission', () => {
    expect(guard.canActivate(ctx({ roles: ['MODERATOR'] }, [PERMISSIONS.MODERATION_REVIEW]))).toBe(true);
    expect(guard.canActivate(ctx({ roles: ['ADMIN'] }, [PERMISSIONS.ROLES_MANAGE]))).toBe(true);
  });

  it('403s a player, and a staff member with the wrong role', () => {
    expect(() => guard.canActivate(ctx({ roles: [] }, [PERMISSIONS.MODERATION_REVIEW]))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx({ roles: ['ORGANIZER'] }, [PERMISSIONS.MODERATION_REVIEW]))).toThrow(ForbiddenException);
  });

  it('401s when AuthGuard did not run / no user', () => {
    expect(() => guard.canActivate(ctx(undefined, [PERMISSIONS.AUDIT_READ]))).toThrow(UnauthorizedException);
  });
});

// Regression net: every staff route must declare its permission, so a route added to
// one of these sections without it fails here instead of shipping.
describe('staff route wiring', () => {
  const guardsOf = (target: any) => (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as any[];
  const permsOf = (...targets: any[]) => targets.map((t) => Reflect.getMetadata(PERMISSIONS_KEY, t)).find(Boolean);

  it('anti-cheat queue: MODERATOR permission on the whole controller', () => {
    expect(guardsOf(AnticheatController)).toEqual([AuthGuard, PermissionsGuard]);
    expect(permsOf(AnticheatController)).toEqual([PERMISSIONS.MODERATION_REVIEW]);
  });

  it.each([
    'listPending', 'approvePuzzle', 'setPuzzlePremium', 'rejectPuzzle', 'generateFromGame', 'generateFromRecentGames',
  ])('puzzle management: PuzzlesController.%s needs puzzles.manage', (method) => {
    const handler = (PuzzlesController.prototype as any)[method];
    expect(guardsOf(handler)).toEqual([AuthGuard, PermissionsGuard]);
    expect(permsOf(handler)).toEqual([PERMISSIONS.PUZZLES_MANAGE]);
  });

  it.each([
    ['listRoles', PERMISSIONS.USERS_READ],
    ['searchUsers', PERMISSIONS.USERS_READ],
    ['listStaff', PERMISSIONS.USERS_READ],
    ['setRoles', PERMISSIONS.ROLES_MANAGE],
    ['listAudit', PERMISSIONS.AUDIT_READ],
  ])('admin API: AdminController.%s needs %s', (method, permission) => {
    expect(guardsOf(AdminController)).toEqual([AuthGuard, PermissionsGuard]);
    expect(permsOf((AdminController.prototype as any)[method])).toEqual([permission]);
  });
});
