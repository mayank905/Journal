import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  type User as FirebaseUser 
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: string;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: AppUser | null;
  idToken: string | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInDevMock: (customUid?: string) => void;
  signInDevAdmin: () => void;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for saved dev mock session
    const savedDevUser = localStorage.getItem("mindmirror_dev_user");
    if (savedDevUser) {
      try {
        const parsed = JSON.parse(savedDevUser);
        setUser(parsed);
        setIdToken(`dev-mock-token-${parsed.uid}`);
        setLoading(false);
        return;
      } catch {
        localStorage.removeItem("mindmirror_dev_user");
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          const isAdmin = Boolean(tokenResult.claims.admin || tokenResult.claims.role === "admin" || tokenResult.claims.role === "super_admin");
          const role = (tokenResult.claims.role as string) || (isAdmin ? "admin" : "user");
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split("@")[0] : "Journaler"),
            photoURL: firebaseUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${firebaseUser.uid}`,
            role,
            isAdmin,
          });
          setIdToken(tokenResult.token);
        } catch (err: any) {
          console.error("Error retrieving Firebase token:", err);
          setError(err.message || "Failed to retrieve session token.");
        }
      } else {
        setUser(null);
        setIdToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const tokenResult = await result.user.getIdTokenResult();
      const isAdmin = Boolean(tokenResult.claims.admin || tokenResult.claims.role === "admin" || tokenResult.claims.role === "super_admin");
      const role = (tokenResult.claims.role as string) || (isAdmin ? "admin" : "user");
      setUser({
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName || "Journaler",
        photoURL: result.user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${result.user.uid}`,
        role,
        isAdmin,
      });
      setIdToken(tokenResult.token);
    } catch (err: any) {
      console.warn("Google sign-in popup error:", err);
      if (
        err.code === "auth/invalid-api-key" || 
        err.code?.includes("api-key-not-valid") ||
        err.code === "auth/configuration-not-found" || 
        err.message?.includes("API key not valid") ||
        err.message?.includes("api-key-not-valid")
      ) {
        setError("Firebase API Key is missing or invalid in .env. Please check FIREBASE_API_KEY in your root .env, or click 'Instant Demo Explorer' below to test immediately!");
      } else {
        setError(err.message || "Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const signInDevMock = (customUid: string = "dev-explorer") => {
    const isAdmin = customUid.includes("admin") || customUid === "dev-explorer";
    const role = isAdmin ? (customUid.includes("root") ? "super_admin" : "admin") : "user";
    const mockUser: AppUser = {
      uid: customUid,
      email: `${customUid}@mindmirror.internal`,
      displayName: isAdmin ? "Architect Explorer (Admin)" : "Architect Explorer",
      photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${customUid}`,
      role,
      isAdmin,
    };
    setUser(mockUser);
    setIdToken(`dev-mock-token-${customUid}`);
    localStorage.setItem("mindmirror_dev_user", JSON.stringify(mockUser));
    setError(null);
    setLoading(false);
  };

  const signInDevAdmin = () => {
    const adminUser: AppUser = {
      uid: "admin-root",
      email: "admin@mindmirror.internal",
      displayName: "System Super Admin",
      photoURL: "https://api.dicebear.com/7.x/bottts/svg?seed=admin-root",
      role: "super_admin",
      isAdmin: true,
    };
    setUser(adminUser);
    setIdToken("dev-mock-token-admin-root");
    localStorage.setItem("mindmirror_dev_user", JSON.stringify(adminUser));
    setError(null);
    setLoading(false);
  };

  const signOut = async () => {
    setLoading(true);
    try {
      localStorage.removeItem("mindmirror_dev_user");
      await firebaseSignOut(auth);
      setUser(null);
      setIdToken(null);
    } catch (err: any) {
      console.error("Sign-out error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        loading,
        error,
        signInWithGoogle,
        signInDevMock,
        signInDevAdmin,
        signOut,
        clearError: () => setError(null),
      }}
    >

      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
