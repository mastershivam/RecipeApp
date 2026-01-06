import { useContext , createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

export const AuthCtx = createContext<AuthState | undefined>(undefined);