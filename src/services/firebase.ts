import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Configure Firestore with long-polling to prevent WebSocket connection timeouts (10s)
// in iframe preview, Cloud Run proxy, and mobile environments
const firestoreOptions = {
  experimentalForceLongPolling: true
};

// @ts-ignore
const databaseId = firebaseConfig.firestoreDatabaseId;
export const db = databaseId 
  ? initializeFirestore(app, firestoreOptions, databaseId) 
  : initializeFirestore(app, firestoreOptions);

export const auth = getAuth(app);

