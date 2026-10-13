// Shared Alkebuleum Firebase project (also used by JollofSwap and Nuru).
// Firestore "lite" keeps the bundle small: we only need one-off reads/writes,
// not realtime listeners. Auth is imported lazily, only for admin sign-in.
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";

const app = initializeApp({
  apiKey: process.env.REACT_APP_FB_API_KEY,
  authDomain: process.env.REACT_APP_FB_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FB_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FB_SENDER_ID,
  appId: process.env.REACT_APP_FB_APP_ID,
});

export const db = getFirestore(app);

let authPromise = null;
function loadAuth() {
  authPromise ||= import("firebase/auth").then((m) => ({ m, auth: m.getAuth(app) }));
  return authPromise;
}

// Resolves with the signed-in user once Firebase has restored any saved session.
export async function currentUser() {
  const { auth } = await loadAuth();
  await auth.authStateReady();
  return auth.currentUser;
}

// Anonymous sessions (used for the Nuru QR flows) are never admins; the
// Firestore rules make the real decision by email.
export const isAdminUser = (user) => !!user && !user.isAnonymous && !!user.email;

// The QR connect/sign flows only need "some" signed-in session, which is how
// Nuru itself signs in. Keeps an existing (admin) session if there is one.
export async function ensureSignedIn() {
  const { m, auth } = await loadAuth();
  await auth.authStateReady();
  if (!auth.currentUser) await m.signInAnonymously(auth);
  return auth.currentUser;
}

// Full Firestore SDK (realtime listeners) for the Nuru flows, loaded on demand.
let fullDbPromise = null;
export function loadRealtimeDb() {
  fullDbPromise ||= import("firebase/firestore").then((m) => ({ m, db: m.getFirestore(app) }));
  return fullDbPromise;
}

export async function onUserChange(cb) {
  const { m, auth } = await loadAuth();
  return m.onAuthStateChanged(auth, cb);
}

export async function signInAdmin(email, password) {
  const { m, auth } = await loadAuth();
  await m.setPersistence(auth, m.browserLocalPersistence);
  return (await m.signInWithEmailAndPassword(auth, email, password)).user;
}

export async function signInAdminWithGoogle() {
  const { m, auth } = await loadAuth();
  await m.setPersistence(auth, m.browserLocalPersistence);
  return (await m.signInWithPopup(auth, new m.GoogleAuthProvider())).user;
}

export async function signOutAdmin() {
  const { m, auth } = await loadAuth();
  await m.signOut(auth);
}
