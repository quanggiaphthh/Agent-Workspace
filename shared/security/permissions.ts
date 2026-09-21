/**
 * Canonical permissions for the authenticated owner of this private,
 * single-user application. This set is shared by client UI affordances and
 * server identity resolution; the server remains authoritative because it
 * only applies it after Firebase Admin verifies the ID token.
 */
export const SINGLE_USER_OWNER_PERMISSIONS = [
  'tasks.read',
  'tasks.write',
  'tasks.delete',
  'memory.read',
  'memory.write',
  'memory.delete',
  'web.read',
  'web.search',
  'settings.read',
  'settings.write',
  'module.manage',
  'files.read',
  'files.write',
] as const;

// Compatibility alias for code/tests that still refer to the historical name.
export const USER_DEFAULT_PERMISSIONS = SINGLE_USER_OWNER_PERMISSIONS;

export const AUDITOR_DEFAULT_PERMISSIONS = [
  ...SINGLE_USER_OWNER_PERMISSIONS,
  'audit.read',
] as const;

export const ADMIN_DEFAULT_PERMISSIONS = [
  ...AUDITOR_DEFAULT_PERMISSIONS,
  'demo.read',
  'demo.write',
  'demo.delete',
] as const;

export function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

export const CANONICAL_PERMISSION_IDS = uniqueStrings([
  ...ADMIN_DEFAULT_PERMISSIONS,
]) as readonly string[];

export function isCanonicalPermissionId(permission: string): boolean {
  return CANONICAL_PERMISSION_IDS.includes(permission);
}

/**
 * Resolve permissions from a verified identity.
 *
 * In the current private single-user product every authenticated identity is
 * the owner, so owner permissions are a non-removable baseline. Existing
 * verified Firebase custom claims remain additive for compatibility. Admin and
 * auditor claims retain their historical extra permissions.
 *
 * IMPORTANT: callers on the server must invoke this only after token
 * verification. Browser-provided role/permission fields are not authority.
 */
export function resolveVerifiedPermissions(options: {
  roles: string[];
  claimedPermissions?: string[] | null;
  admin?: boolean;
}): string[] {
  const { roles, claimedPermissions, admin = false } = options;
  const isAdmin = admin || roles.includes('admin');
  const isAuditor = roles.includes('auditor');

  const roleDefaults = isAdmin
    ? ADMIN_DEFAULT_PERMISSIONS
    : isAuditor
      ? AUDITOR_DEFAULT_PERMISSIONS
      : SINGLE_USER_OWNER_PERMISSIONS;

  return uniqueStrings([
    ...SINGLE_USER_OWNER_PERMISSIONS,
    ...roleDefaults,
    ...(claimedPermissions || []),
  ]);
}
