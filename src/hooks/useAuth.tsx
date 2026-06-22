"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, firebaseReady } from "@/lib/firebase";
import { AppUser, Role } from "@/types";

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If Firebase isn't configured (e.g. local preview without env vars),
    // skip auth and let pages render with mock data.
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      // Pull the role + department from the user's Firestore profile.
      let role: Role = "employee";
      let departmentId: string | null = null;
      let displayName = fbUser.displayName ?? fbUser.email ?? "";
      try {
        const snap = await getDoc(doc(db, "users", fbUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          role = (data.role as Role) ?? "employee";
          departmentId = data.departmentId ?? null;
          displayName = data.displayName ?? displayName;
        }
      } catch {
        // Falls back to employee on read failure — least privilege.
      }
      setUser({
        uid: fbUser.uid,
        email: fbUser.email ?? "",
        displayName,
        role,
        departmentId,
      });
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };
  const signOut = async () => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
