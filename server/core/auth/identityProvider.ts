import { UserContext } from '../../../shared/contracts/capability';
import { resolveVerifiedPermissions, uniqueStrings } from '../../../shared/security/permissions';
import { redactAuditString } from '../audit/auditRedaction';
import { adminAuth } from '../../lib/firebaseAdmin';

export class ServerIdentityProvider {
  /**
   * Resolves identity exclusively from a Firebase token verified by Admin SDK.
   * Client-provided role/permission state is never trusted here.
   *
   * OWNER_UID is the production single-owner allowlist. Production fails closed
   * when it is missing; non-production environments may omit it for hermetic
   * tests and local development.
   */
  public static async getIdentity(req: any): Promise<UserContext> {
    // Historical Firestore diagnostics remain available only outside production.
    // Hiding the route at the shared auth boundary avoids exposing project/config
    // metadata or probe writes on the deployed personal application.
    if (process.env.NODE_ENV === 'production' && req?.path === '/test/firebase-connection') {
      const routeErr = new Error('Not found.');
      (routeErr as any).status = 404;
      (routeErr as any).code = 'ROUTE_NOT_AVAILABLE';
      throw routeErr;
    }

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
    if (process.env.NODE_ENV === 'production' && !ownerUid) {
      const configErr = new Error('Service owner configuration is unavailable.');
      (configErr as any).status = 503;
      (configErr as any).code = 'OWNER_NOT_CONFIGURED';
      throw configErr;
    }
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
