import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
if (!firebaseApiKey) {
  throw new Error('Firebase client API configuration is unavailable.');
}

const app = initializeApp({ ...firebaseConfig, apiKey: firebaseApiKey });

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
