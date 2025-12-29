import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function AppLayout() {
  const loc = useLocation();
  const { user, signOut } = useAuth();

  const [theme, setTheme] = useState<"light" | "dark">(
    ((document.documentElement.dataset.theme as string) === "dark" ? "dark" : "light")
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="Home">
            <span>Recipe Vault</span>
          </Link>

          <div className="row" style={{ flex: 0, gap: 8 }}>
            {loc.pathname !== "/recipes/new" && (
              <Link to="/recipes/new" className="btn primary">
                + New recipe
              </Link>
            )}
            <button className="btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
            <button className="btn" onClick={signOut} title={user?.email ?? ""}>
              Log out
            </button>
          </div>
        </div>
      </div>

      <div className="container">
        <Outlet />
        <div className="muted small" style={{ marginTop: 18 }}>
          Cloud-synced.
        </div>
      </div>
    </>
  );
}