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
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mindmirror-dev.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mindmirror-ideathon",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:abcdef123456",
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

  if (!getApps().length) {
    app = initializeApp(config);
  } else {
    app = getApp();
  }

  auth = getAuth(app);
  db = getFirestore(app);

  return { auth, db };
}

// Initial eager initialization with defaults
if (!getApps().length) {
  app = initializeApp(defaultFirebaseConfig);
} else {
  app = getApp();
}
auth = getAuth(app);
db = getFirestore(app);

export { app, auth, db, googleProvider };
