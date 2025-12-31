import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./UseAuth.ts";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <div className="container"><div className="card">Loading…</div></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  return <Outlet />;
}