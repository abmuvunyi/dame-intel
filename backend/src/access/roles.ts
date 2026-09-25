// Staff roles and what each one is allowed to do. Pure module: no framework imports,
// so it's shared by the backend guards, the admin API, the CLI and unit tests.
//
// Players have NO role. A staff member can hold several roles at once (e.g. a
// moderator who also organises tournaments). Paid plans are separate: a plan
// unlocks player features (see billing/plans.ts), a role unlocks staff tools.
//
// Least privilege: each role gets only the permissions its job needs. ADMIN gets
// all of them, including managing other people's roles.

export const ROLES = ['ADMIN', 'MODERATOR', 'ORGANIZER', 'CONTENT_EDITOR'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  /** Read the anti-cheat queue and apply warnings / rating resets / bans. */
  MODERATION_REVIEW: 'moderation.review',
  /** Create, open and start any tournament. */
  TOURNAMENTS_MANAGE: 'tournaments.manage',
  /** Review, approve, reject, generate and mark puzzles premium. */
  PUZZLES_MANAGE: 'puzzles.manage',
  /** Search users and see their roles, plan and moderation state. */
  USERS_READ: 'users.read',
  /** Grant and revoke staff roles. */
  ROLES_MANAGE: 'roles.manage',
  /** Read the audit trail. */
  AUDIT_READ: 'audit.read',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MODERATOR: [PERMISSIONS.MODERATION_REVIEW, PERMISSIONS.USERS_READ],
  ORGANIZER: [PERMISSIONS.TOURNAMENTS_MANAGE],
  CONTENT_EDITOR: [PERMISSIONS.PUZZLES_MANAGE],
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Full access, including granting roles and reading the audit trail.',
  MODERATOR: 'Handles the anti-cheat queue: warnings, rating resets and bans.',
  ORGANIZER: 'Creates and runs tournaments.',
  CONTENT_EDITOR: 'Reviews, publishes and curates puzzles.',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Normalises stored/requested roles: known values only, no duplicates, stable order. */
export function normalizeRoles(roles: readonly unknown[] | null | undefined): Role[] {
  const set = new Set((roles ?? []).map((r) => (typeof r === 'string' ? r.trim().toUpperCase() : r)).filter(isRole));
  return ROLES.filter((r) => set.has(r));
}

export function permissionsFor(roles: readonly unknown[] | null | undefined): Permission[] {
  const set = new Set<Permission>();
  for (const role of normalizeRoles(roles)) for (const p of ROLE_PERMISSIONS[role]) set.add(p);
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

export function hasPermission(roles: readonly unknown[] | null | undefined, permission: Permission): boolean {
  return permissionsFor(roles).includes(permission);
}
