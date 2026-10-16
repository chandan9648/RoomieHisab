import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Client-side Firebase only. These NEXT_PUBLIC_* values are the public web app
 * config — they identify the project, they are not secrets, and all real
 * protection comes from `firestore.rules`. Admin SDK service-account
 * credentials must never appear anywhere under `src/`.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** False when `.env.local` has not been filled in; the UI shows setup help. */
export const firebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

const app: FirebaseApp | null = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(config)
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;

export const googleProvider = new GoogleAuthProvider();
// Always let the roommate pick an account rather than silently reusing one.
googleProvider.setCustomParameters({ prompt: "select_account" });

/**
 * Narrows the nullable singletons in one place so callers can use plain
 * `db`/`auth` without a non-null assertion on every line.
 */
export function requireFirebase(): { auth: Auth; db: Firestore } {
  if (!auth || !db) {
    throw new Error("Firebase is not configured. Add your web app config to .env.local.");
  }
  return { auth, db };
}
