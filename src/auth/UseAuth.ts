import { useContext } from "react";
import { AuthCtx } from "./AuthProvider"; // or wherever AuthCtx lives

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}