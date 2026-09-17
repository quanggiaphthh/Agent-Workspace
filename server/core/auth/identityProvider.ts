import { UserContext } from '../../../shared/contracts/capability';
import { adminAuth } from '../../lib/firebaseAdmin';

export class ServerIdentityProvider {
  /**
   * Resolves the user identity from the request's Authorization header using Firebase Admin SDK.
   * Strictly throws a 401 error if authentication is missing or invalid.
   */
  public static async getIdentity(req: any): Promise<UserContext> {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new Error('Unauthorized: Missing or invalid Authorization header');
      (err as any).status = 401;
      throw err;
    }

    const token = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      
      // Determine user roles/permissions from verified token
      const roles: string[] = Array.isArray(decodedToken.roles)
        ? decodedToken.roles
        : (decodedToken.admin ? ['admin'] : ['user']);

      const isAdmin = decodedToken.admin === true || roles.includes('admin');
      const isAuditor = roles.includes('auditor');
      
      let permissions: string[] = [];

      // Always include base permissions if logged in
      permissions = [
        'tasks.read',
        'tasks.write',
        'memory.read',
        'memory.write',
        'web.search',
        'web.read'
      ];

      if (isAdmin) {
        permissions = [
          ...permissions,
          'tasks.delete',
          'memory.delete',
          'demo.read',
          'demo.write',
          'demo.delete',
          'settings.read',
          'settings.write',
          'module.manage',
          'audit.read'
        ];
      } else if (isAuditor) {
        permissions = [
          ...permissions,
          'demo.read',
          'settings.read',
          'audit.read'
        ];
      }

      return {
        id: decodedToken.uid,
        email: decodedToken.email || '',
        name: decodedToken.name || decodedToken.email || 'User',
        roles: roles,
        permissions: permissions,
      };
    } catch (err: any) {
      console.error('Token verification failed:', err);
      const authErr = new Error(`Unauthorized: Token verification failed: ${err.message}`);
      (authErr as any).status = 401;
      throw authErr;
    }
  }
}

