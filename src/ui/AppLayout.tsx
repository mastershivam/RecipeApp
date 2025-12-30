import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function AppLayout() {
  const loc = useLocation();
  const { user, signOut } = useAuth();

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const pageTitle = useMemo(() => {
    if (loc.pathname === "/recipes/new") return "Create recipe";
    if (loc.pathname.endsWith("/edit")) return "Edit recipe";
    if (loc.pathname.startsWith("/recipes/")) return "Recipe details";
    return "Recipe library";
  }, [loc.pathname]);

  const isLibrary =
    loc.pathname === "/" ||
    (loc.pathname.startsWith("/recipes/") && loc.pathname !== "/recipes/new");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="Home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" role="img" focusable="false">
              <path d="M10 12h18l4 4v20H10z" />
              <path d="M16 18h10M16 24h7M16 30h10" />
              <path d="M36 14h4v20h-4" />
              <path d="M36 18h4M36 24h4M36 30h4" />
            </svg>
          </span>
          <span className="brand-text">Recipe Lab</span>
        </Link>

        <div className="nav">
          <div className="nav-title">Browse</div>
          <Link className={`nav-item ${isLibrary ? "active" : ""}`} to="/">
            All recipes
          </Link>
          <Link className={`nav-item ${loc.pathname === "/recipes/new" ? "active" : ""}`} to="/recipes/new">
            New recipe
          </Link>
        </div>

        <div className="nav">
          <div className="nav-title">Account</div>
          <button className="nav-item ghost" onClick={signOut} title={user?.email ?? ""}>
            Log out
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">{user?.email ?? "Signed in"}</div>
          <button className="btn ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "Switch to light" : "Switch to dark"}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="eyebrow">Kitchen mode</div>
            <div className="page-title">{pageTitle}</div>
          </div>

          <div className="row" style={{ flex: 0, gap: 8 }}>
            {loc.pathname !== "/recipes/new" && (
              <Link to="/recipes/new" className="btn primary">
                + New recipe
              </Link>
            )}
          </div>
        </div>

        <div className="content">
          <Outlet />
          <div className="muted small footer-note">Cloud-synced</div>
        </div>
      </main>
    </div>
  );
}
