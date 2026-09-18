import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SINGLE_USER_OWNER_PERMISSIONS,
  resolveVerifiedPermissions,
} from '../../shared/security/permissions';
import { PermissionResolver } from '../../server/core/permissions/permissionResolver';

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock('../../server/lib/firebaseAdmin', () => ({
  adminAuth: { verifyIdToken },
}));

import { ServerIdentityProvider } from '../../server/core/auth/identityProvider';

const ownerPermissions = [...SINGLE_USER_OWNER_PERMISSIONS];

function requestWithToken(extra: Record<string, unknown> = {}) {
  return {
    headers: { authorization: 'Bearer verified-token' },
    body: extra,
  };
}

describe('single-user owner permission baseline', () => {
  beforeEach(() => verifyIdToken.mockReset());

  it('gives an authenticated normal user the complete owner permission set', () => {
    const resolved = resolveVerifiedPermissions({ roles: ['user'] });
    expect(resolved).toEqual(expect.arrayContaining(ownerPermissions));
    expect(resolved).not.toContain('audit.read');
  });

  it('keeps verified custom claims additive without removing owner permissions or duplicating entries', () => {
    const resolved = resolveVerifiedPermissions({
      roles: ['user'],
      claimedPermissions: ['tasks.read', 'custom.permission'],
    });
    expect(resolved).toEqual(expect.arrayContaining([...ownerPermissions, 'custom.permission']));
    expect(resolved.filter((permission) => permission === 'tasks.read')).toHaveLength(1);
  });

  it('derives server permissions only from the verified Firebase token, not spoofed request fields', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.test' });
    const identity = await ServerIdentityProvider.getIdentity(requestWithToken({
      roles: ['admin'],
      permissions: ['audit.read', 'anything'],
      admin: true,
      confirmed: true,
    }));

    expect(identity.roles).toEqual(['user']);
    expect(identity.permissions).toEqual(expect.arrayContaining(ownerPermissions));
    expect(identity.permissions).not.toContain('audit.read');
    expect(identity.permissions).not.toContain('anything');
  });

  it('preserves verified admin/custom claims without permission inconsistency', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'owner-1',
      roles: ['admin'],
      admin: true,
      permissions: ['custom.permission', 'tasks.read'],
    });
    const identity = await ServerIdentityProvider.getIdentity(requestWithToken());
    expect(identity.roles).toContain('admin');
    expect(identity.permissions).toEqual(expect.arrayContaining([
      ...ownerPermissions,
      'audit.read',
      'custom.permission',
    ]));
    expect(new Set(identity.permissions).size).toBe(identity.permissions.length);
  });

  it('passes Tasks, Memory and Web Search server permission checks for the owner', () => {
    const user = {
      id: 'owner-1', email: '', name: 'Owner', roles: ['user'],
      permissions: resolveVerifiedPermissions({ roles: ['user'] }),
    };
    const context = { user, appContext: { user, availableCapabilities: [] } };
    for (const permission of [
      'tasks.read', 'tasks.write', 'tasks.delete',
      'memory.read', 'memory.write', 'memory.delete',
      'web.read', 'web.search', 'settings.read', 'settings.write', 'module.manage',
    ]) {
      expect(PermissionResolver.checkPermission([permission], context).authorized).toBe(true);
    }
  });

  it('rejects anonymous requests before any permission resolution', async () => {
    await expect(ServerIdentityProvider.getIdentity({ headers: {} }))
      .rejects.toMatchObject({ status: 401 });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
