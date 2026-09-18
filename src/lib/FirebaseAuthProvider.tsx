import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import { moduleRegistry } from '../core/modules/moduleRegistry';
import { AI_SETTINGS_RESET, useAIKeysStore } from '../modules/settings/aiKeysStore';
import { DEFAULT_USER, useContextStore } from '../core/context/contextStore';
import { resolveVerifiedPermissions, uniqueStrings } from '../../shared/security/permissions';

interface FirebaseAuthContextValue {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

export const FirebaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      void (async () => {
        setLoading(true);
        setUser(nextUser);

        // Reset all user-scoped AI settings before switching persistence namespace.
        useAIKeysStore.setState({ ...AI_SETTINGS_RESET, aiSettingsHydrated: false });
        const storeKey = nextUser ? `ai-keys-storage_${nextUser.uid}` : 'ai-keys-storage_guest';
        useAIKeysStore.persist.setOptions({ name: storeKey });

        try {
          if (nextUser) {
            await useAIKeysStore.persist.rehydrate();
          }
        } catch (err) {
          console.warn('Failed to rehydrate user-scoped AI settings', err);
        } finally {
          useAIKeysStore.getState().setAISettingsHydrated(true);
        }

        if (!nextUser) {
          useContextStore.getState().setUser(DEFAULT_USER);
          setLoading(false);
          return;
        }

        try {
          // Client claims are used only for UI affordances. Server-side authorization
          // independently verifies the ID token and never trusts this client state.
          const tokenResult = await nextUser.getIdTokenResult();
          const claims = tokenResult.claims as Record<string, unknown>;
          const claimRoles = Array.isArray(claims.roles)
            ? claims.roles.filter((role): role is string => typeof role === 'string')
            : [];
          const admin = claims.admin === true;
          const roles = uniqueStrings(admin
            ? [...claimRoles, 'admin']
            : (claimRoles.length > 0 ? claimRoles : ['user']));
          const claimedPermissions = Array.isArray(claims.permissions)
            ? claims.permissions.filter((permission): permission is string => typeof permission === 'string')
            : null;

          useContextStore.getState().setUser({
            id: nextUser.uid,
            email: nextUser.email || '',
            name: nextUser.displayName || nextUser.email || 'User',
            roles,
            permissions: resolveVerifiedPermissions({ roles, claimedPermissions, admin }),
          });

          // Sync module settings with server after login
          void moduleRegistry.syncWithServer().catch(err => {
            console.warn('Failed to sync module state after login:', err);
          });
        } catch (err) {
          console.warn('Failed to load Firebase claims for UI context', err);
          useContextStore.getState().setUser({
            id: nextUser.uid,
            email: nextUser.email || '',
            name: nextUser.displayName || nextUser.email || 'User',
            roles: ['user'],
            permissions: [],
          });
        } finally {
          setLoading(false);
        }
      })();
    });
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const getToken = async () => {
    if (!user) return null;
    return await user.getIdToken();
  };

  return (
    <FirebaseAuthContext.Provider value={{ user, loading, login, logout, getToken }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
};

export const useFirebaseAuth = () => {
  const context = useContext(FirebaseAuthContext);
  if (!context) {
    throw new Error('useFirebaseAuth must be used within a FirebaseAuthProvider');
  }
  return context;
};
