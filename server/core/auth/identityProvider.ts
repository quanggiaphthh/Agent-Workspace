import { UserContext } from '../../../shared/contracts/capability';
import { resolveVerifiedPermissions, uniqueStrings } from '../../../shared/security/permissions';
import { adminAuth } from '../../lib/firebaseAdmin';

export class ServerIdentityProvider {
  /**
   * Resolves identity exclusively from a Firebase token verified by Admin SDK.
   * Client-provided role/permission state is never trusted here.
   */
  public static async getIdentity(req: any): Promise<UserContext> {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new Error('Unauthorized: Missing or invalid Authorization header');
      (err as any).status = 401;
      throw err;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      const err = new Error('Unauthorized: Empty bearer token');
      (err as any).status = 401;
      throw err;
    }

    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      const claimRoles = Array.isArray(decodedToken.roles)
        ? decodedToken.roles.filter((role: unknown): role is string => typeof role === 'string')
        : [];
      const roles = uniqueStrings(decodedToken.admin === true
        ? [...claimRoles, 'admin']
        : (claimRoles.length > 0 ? claimRoles : ['user']));
      const claimedPermissions = Array.isArray(decodedToken.permissions)
        ? decodedToken.permissions.filter((permission: unknown): permission is string => typeof permission === 'string')
        : null;

      return {
        id: decodedToken.uid,
        email: decodedToken.email || '',
        name: decodedToken.name || decodedToken.email || 'User',
        roles,
        permissions: resolveVerifiedPermissions({
          roles,
          claimedPermissions,
          admin: decodedToken.admin === true,
        }),
      };
    } catch (err: any) {
      console.error('Token verification failed:', err);
      const authErr = new Error(`Unauthorized: Token verification failed: ${err.message}`);
      (authErr as any).status = 401;
      throw authErr;
    }
  }
}
