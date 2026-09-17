import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { applicationDefault } from 'firebase-admin/app';
import firebaseConfig from '../../firebase-applet-config.json';

// Phase 4: Secure Admin Initialization
const app = getApps().length === 0
  ? initializeApp({
      credential: applicationDefault(),
      projectId: firebaseConfig.projectId,
    })
  : getApps()[0];

export const adminAuth = getAuth(app);
export const adminFirestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Export for diagnostics
export const firebaseAdminConfig = {
  projectId: firebaseConfig.projectId,
  databaseId: firebaseConfig.firestoreDatabaseId,
  hasADC: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
};

