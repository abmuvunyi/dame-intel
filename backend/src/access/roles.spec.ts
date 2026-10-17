import { PERMISSIONS, ROLES, hasPermission, normalizeRoles, permissionsFor } from './roles';

describe('roles & permissions', () => {
  it('players (no roles) have no staff permissions', () => {
    expect(permissionsFor([])).toEqual([]);
    expect(permissionsFor(undefined)).toEqual([]);
  });

  it('ADMIN has every permission', () => {
    expect(permissionsFor(['ADMIN']).sort()).toEqual(Object.values(PERMISSIONS).sort());
  });

  it.each([
    ['MODERATOR', PERMISSIONS.MODERATION_REVIEW, true],
    ['MODERATOR', PERMISSIONS.TOURNAMENTS_MANAGE, false],
    ['MODERATOR', PERMISSIONS.ROLES_MANAGE, false],
    ['ORGANIZER', PERMISSIONS.TOURNAMENTS_MANAGE, true],
    ['ORGANIZER', PERMISSIONS.MODERATION_REVIEW, false],
    ['CONTENT_EDITOR', PERMISSIONS.PUZZLES_MANAGE, true],
    ['CONTENT_EDITOR', PERMISSIONS.AUDIT_READ, false],
  ])('%s → %s = %s (least privilege)', (role, permission, expected) => {
    expect(hasPermission([role], permission)).toBe(expected);
  });

  it('combines permissions of several roles', () => {
    const p = permissionsFor(['MODERATOR', 'ORGANIZER']);
    expect(p).toContain(PERMISSIONS.MODERATION_REVIEW);
    expect(p).toContain(PERMISSIONS.TOURNAMENTS_MANAGE);
    expect(p).not.toContain(PERMISSIONS.ROLES_MANAGE);
  });

  it('normalizeRoles drops unknown values, de-duplicates and orders consistently', () => {
    expect(normalizeRoles(['organizer', 'ADMIN', 'ADMIN', 'SUPERUSER', 42, ''])).toEqual(['ADMIN', 'ORGANIZER']);
    expect(ROLES).toContain('CONTENT_EDITOR');
  });
});
