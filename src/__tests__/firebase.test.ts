import { describe, it, expect } from 'vitest';
import { adminAuth, adminFirestore } from '../../server/lib/firebaseAdmin';
import firebaseConfig from '../../firebase-applet-config.json';

describe('Firebase Admin Connection and Initialization Preflight', () => {
  it('should initialize with correct project ID', () => {
    expect(firebaseConfig.projectId).toBeDefined();
    expect(firebaseConfig.projectId).not.toBe('');
  });

  it('should resolve correct named database ID', () => {
    expect(firebaseConfig.firestoreDatabaseId).toBeDefined();
    expect(firebaseConfig.firestoreDatabaseId).toContain('ai-studio-modularagentweba-44b40a69-3a84-4a8e-af00-a0a4885390d1');
  });

  it('should export verified auth and firestore instances', () => {
    expect(adminAuth).toBeDefined();
    expect(adminFirestore).toBeDefined();
  });
});
