import { ExecutionContext } from '../../../shared/contracts/capability';

export class PermissionResolver {
  /**
   * Synchronous permission predicate for filtering and early checks.
   */
  public static checkPermission(requiredPermissions: string[], context: ExecutionContext): { authorized: boolean; error?: string } {
    if (requiredPermissions.length === 0) {
      return { authorized: true };
    }

    // Recognize admin from verified server-side custom claims/role store
    if (context.user.roles?.includes('admin')) {
      return { authorized: true };
    }

    const userPermissions = context.user.permissions || [];
    
    const missingPermissions = requiredPermissions.filter(
      p => !userPermissions.includes(p)
    );

    if (missingPermissions.length > 0) {
      return {
        authorized: false,
        error: `Unauthorized: Missing required permissions [${missingPermissions.join(', ')}]`,
      };
    }

    return { authorized: true };
  }

  public static async resolve(
    requiredPermissions: string[],
    context: ExecutionContext
  ): Promise<{ authorized: boolean; error?: string }> {
    // In P0, synchronous check is sufficient as we don't have async DB permission lookups yet.
    return this.checkPermission(requiredPermissions, context);
  }
}
