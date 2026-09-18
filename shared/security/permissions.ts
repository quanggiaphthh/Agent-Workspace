export const USER_DEFAULT_PERMISSIONS = [
  'tasks.read',
  'memory.read',
  'web.read',
  'settings.read',
] as const;

export const AUDITOR_DEFAULT_PERMISSIONS = [
  ...USER_DEFAULT_PERMISSIONS,
  'settings.read',
  'audit.read',
] as const;

export const ADMIN_DEFAULT_PERMISSIONS = [
  ...AUDITOR_DEFAULT_PERMISSIONS,
  'tasks.write',
  'tasks.delete',
  'memory.write',
  'memory.delete',
  'web.search',
  'demo.read',
  'demo.write',
  'demo.delete',
  'settings.write',
  'module.manage',
] as const;

export function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

export function resolveVerifiedPermissions(options: {
  roles: string[];
  claimedPermissions?: string[] | null;
  admin?: boolean;
}): string[] {
  const { roles, claimedPermissions, admin = false } = options;
  const isAdmin = admin || roles.includes('admin');
  const isAuditor = roles.includes('auditor');

  if (isAdmin) {
    return uniqueStrings([...(claimedPermissions || []), ...ADMIN_DEFAULT_PERMISSIONS]);
  }
  if (claimedPermissions) {
    return uniqueStrings(claimedPermissions);
  }
  if (isAuditor) {
    return uniqueStrings(AUDITOR_DEFAULT_PERMISSIONS);
  }
  return uniqueStrings(USER_DEFAULT_PERMISSIONS);
}
