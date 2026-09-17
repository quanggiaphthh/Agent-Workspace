import { UserContext } from '../../../shared/contracts/capability';

export class PermissionResolver {
  public static can(user: UserContext | null | undefined, requiredPermissions: string[] = []): boolean {
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }
    if (!user) {
      return false;
    }
    // Super-admin / admin override
    if (user.roles?.includes('admin') || user.roles?.includes('superadmin')) {
      return true;
    }
    const userPerms = new Set(user.permissions || []);
    return requiredPermissions.every(p => userPerms.has(p));
  }
}
