import { UserContext } from '../../../shared/contracts/capability';
import { resolveVerifiedPermissions, uniqueStrings } from '../../../shared/security/permissions';
import { redactAuditString } from '../audit/auditRedaction';
import { adminAuth } from '../../lib/firebaseAdmin';

export class ServerIdentityProvider {
  /**
   * Resolves identity exclusively from a Firebase token verified by Admin SDK.
   * Client-provided role/permission state is never trusted here.
   *
   * OWNER_UID is an optional deployment allowlist during W11. When configured,
   * even a valid Firebase identity must match it before receiving owner access.
   * W12 release verification requires production to configure this value.
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

    let decodedToken: any;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (err: any) {
      const verifierCode = redactAuditString(String(err?.code || err?.name || 'AUTH_VERIFY_FAILED'));
      console.error(`Token verification failed: ${verifierCode}`);
      const authErr = new Error('Unauthorized: Token verification failed');
      (authErr as any).status = 401;
      (authErr as any).code = 'AUTH_TOKEN_INVALID';
      throw authErr;
    }

    const ownerUid = process.env.OWNER_UID?.trim();
    if (ownerUid && decodedToken.uid !== ownerUid) {
      const ownerErr = new Error('Forbidden: authenticated account is not the configured owner.');
      (ownerErr as any).status = 403;
      (ownerErr as any).code = 'OWNER_MISMATCH';
      throw ownerErr;
    }

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
  }
}
