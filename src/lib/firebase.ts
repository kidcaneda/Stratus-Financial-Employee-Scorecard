import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// Client-side Firebase config. These NEXT_PUBLIC_ vars are safe to
// expose in the browser — security is enforced by Firestore rules.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Only initialize when an API key is present. During build/prerender on
// a machine without env vars, these stay null and the app falls back to
// mock data instead of crashing. At runtime in the browser (with env vars
// configured) the real instances are created.
const isConfigured = Boolean(firebaseConfig.apiKey);

const app: FirebaseApp | null = isConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const auth: Auth = app ? getAuth(app) : ({} as Auth);
export const db: Firestore = app ? getFirestore(app) : ({} as Firestore);
export const firebaseReady = isConfigured;
export default app;
