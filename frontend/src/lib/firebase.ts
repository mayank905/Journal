import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

interface ClientConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
  };
  maps: {
    hasClientKey: boolean;
    clientKey: string;
  };
}

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const defaultFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAskYJQKnqn5rZ6WGoTzcjUffEaeNU7GrY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mindmirror-app-bae2d.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mindmirror-app-bae2d",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:92992583743:web:e237cc1be19ec844cc608a",
};

export async function initFirebaseClient(): Promise<{ auth: Auth; db: Firestore }> {
  if (auth && db) {
    return { auth, db };
  }

  let config = { ...defaultFirebaseConfig };

  try {
    const res = await fetch("/api/config/client");
    if (res.ok) {
      const serverConfig: ClientConfig = await res.json();
      if (serverConfig.firebase?.apiKey) {
        config = {
          apiKey: serverConfig.firebase.apiKey,
          authDomain: serverConfig.firebase.authDomain || config.authDomain,
          projectId: serverConfig.firebase.projectId || config.projectId,
          appId: serverConfig.firebase.appId || config.appId,
        };
      }
    }
  } catch {
    // Local dev mode fallback
  }

  try {
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.warn("Dynamic Firebase client initialization error:", err);
  }

  return { auth, db };
}

// Initial eager initialization with defensive fallback
try {
  if (!getApps().length) {
    app = initializeApp(defaultFirebaseConfig);
  } else {
    app = getApp();
  }
  auth = getAuth(app);
  db = getFirestore(app);
} catch (err) {
  console.warn("Eager Firebase initialization deferred to runtime:", err);
}

export { app, auth, db, googleProvider };

