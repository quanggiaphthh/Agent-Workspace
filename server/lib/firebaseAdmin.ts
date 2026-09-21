import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import { redactAuditString } from '../core/audit/auditRedaction';

// Firebase Admin uses Application Default Credentials (ADC). ADC may be
// resolved from an environment-provided credential file, attached service
// account / Cloud Run identity, or other supported Google credential sources.
const app = getApps().length === 0
  ? initializeApp({
      credential: applicationDefault(),
      projectId: firebaseConfig.projectId,
    })
  : getApps()[0];

export const adminAuth = getAuth(app);
export const adminFirestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const adminStorageBucket = getStorage(app).bucket(firebaseConfig.storageBucket);

export const firebaseAdminConfig = {
  projectId: firebaseConfig.projectId,
  databaseId: firebaseConfig.firestoreDatabaseId,
  credentialStrategy: 'application-default-credentials',
  // Diagnostic only: this does NOT mean ADC is available or unavailable.
  googleApplicationCredentialsEnvPresent: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
};

export async function probeFirestoreAdmin() {
  const startedAt = Date.now();
  try {
    // Read-only probe. It never creates, updates, or deletes user data.
    await adminFirestore.collection('_runtime_health').doc('readiness').get();
    return {
      status: 'ok' as const,
      backend: 'firestore',
      durationMs: Date.now() - startedAt,
    };
  } catch (error: any) {
    return {
      status: 'error' as const,
      backend: 'firestore',
      durationMs: Date.now() - startedAt,
      errorCode: String(error?.code || 'FIRESTORE_UNAVAILABLE'),
      errorSummary: redactAuditString(error?.message || 'Firestore Admin probe failed.'),
    };
  }
}
