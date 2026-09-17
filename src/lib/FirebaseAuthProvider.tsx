import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { auth } from './firebase';
import { useAIKeysStore } from '../modules/settings/aiKeysStore';

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
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      try {
        // Reset Zustand store to initial state BEFORE changing persist name and rehydrating
        useAIKeysStore.setState({
          keys: [],
          autoRotate: false,
          globalDefaultModel: null,
          agentProvider: 'google',
          agentModel: 'gemini-flash-lite-latest',
          providerDefaultModels: {},
          providerLoadedModels: {},
        });

        const storeKey = u ? `ai-keys-storage_${u.uid}` : 'ai-keys-storage';
        useAIKeysStore.persist.setOptions({ name: storeKey });
        useAIKeysStore.persist.rehydrate();
      } catch (e) {
        console.warn('Failed to rehydrate useAIKeysStore with user-scoped key', e);
      }
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
