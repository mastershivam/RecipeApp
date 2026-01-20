import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/UseAuth.ts";
import InboxPanel from "./InboxPanel.tsx";
import { useInboxData } from "./useInboxData.ts";

export default function AppLayout() {
  const loc = useLocation();
  const { user, signOut } = useAuth();

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const pageTitle = useMemo(() => {
    if (loc.pathname === "/recipes/new") return "Create recipe";
    if (loc.pathname === "/inbox") return "Sharing inbox";
    if (loc.pathname === "/shared") return "Shared with you";
    if (loc.pathname === "/groups") return "Groups";
    if (loc.pathname.endsWith("/edit")) return "Edit recipe";
    if (loc.pathname.endsWith("/cook")) return "Cook mode";
    if (loc.pathname.startsWith("/recipes/")) return "Recipe details";
    return "Recipe library";
  }, [loc.pathname]);

  const [canShare, setCanShare] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const {
    invites,
    shares,
    loading,
    error,
    busyGroupId,
    handleInvite,
    markShareSeen,
    clearAllShares,
  } = useInboxData();
  const pendingCount = invites.length + shares.length;
  const pendingLabel = pendingCount > 9 ? "9+" : `${pendingCount}`;

  const isLibrary =
    loc.pathname === "/" ||
    (loc.pathname.startsWith("/recipes/") && loc.pathname !== "/recipes/new");
  const isDetail =
    loc.pathname.startsWith("/recipes/") &&
    !loc.pathname.endsWith("/edit") &&
    !loc.pathname.endsWith("/cook");

  useEffect(() => {
    function onSharePermission(e: Event) {
      const detail = (e as CustomEvent).detail;
      setCanShare(Boolean(detail?.canShare));
    }
    window.addEventListener("share-permission", onSharePermission);
    return () => window.removeEventListener("share-permission", onSharePermission);
  }, []);

  useEffect(() => {
    if (!inboxOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setInboxOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (popoverRef.current?.contains(target)) return;
      if (bellRef.current?.contains(target)) return;
      setInboxOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [inboxOpen]);

  useEffect(() => {
    queueMicrotask(() => setInboxOpen(false));
  }, [loc.pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="Home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="img" focusable="false">
              <path d="M18 10c-4 4 4 6 0 10" />
              <path d="M30 8c-4 4 4 6 0 10" />
              <path d="M42 10c-4 4 4 6 0 10" />
              <path d="M14 48V22h16c6 0 10 4 10 9s-4 9-10 9H14" />
              <path d="M30 40l10 8" />
              <path d="M44 48l6-18 6 18" />
              <path d="M47 40h6" />
            </svg>
          </span>
          <span className="brand-text">Recipe Archive</span>
        </Link>

        <div className="nav">
          <div className="nav-title">Browse</div>
          <Link className={`nav-item ${isLibrary ? "active" : ""}`} to="/">
            All recipes
          </Link>
          <Link className={`nav-item ${loc.pathname === "/shared" ? "active" : ""}`} to="/shared">
            Shared with you
          </Link>
          <Link className={`nav-item ${loc.pathname === "/groups" ? "active" : ""}`} to="/groups">
            Groups
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

          <div className="topbar-actions">
            {isDetail && canShare && (
              <button
                className="btn"
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("open-share-modal"))}
              >
                Share
              </button>
            )}
            {loc.pathname !== "/recipes/new" && (
              <Link to="/recipes/new" className="btn primary">
                New Recipe
              </Link>
            )}
            <button
              className="inbox-bell"
              type="button"
              aria-label={
                pendingCount > 0 ? `Sharing inbox (${pendingCount} pending)` : "Sharing inbox"
              }
              aria-haspopup="dialog"
              aria-expanded={inboxOpen}
              onClick={() => setInboxOpen((prev) => !prev)}
              ref={bellRef}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M12 22a2.6 2.6 0 0 0 2.6-2.6H9.4A2.6 2.6 0 0 0 12 22Zm7-6.4V11a7 7 0 1 0-14 0v4.6L3 18v1.2h18V18l-2-2.4Z"
                  fill="currentColor"
                />
              </svg>
              {pendingCount > 0 && <span className="notify-badge">{pendingLabel}</span>}
            </button>
            {inboxOpen && (
              <div className="inbox-popover" ref={popoverRef} role="dialog" aria-label="Sharing inbox">
                <InboxPanel
                  variant="popover"
                  invites={invites}
                  shares={shares}
                  loading={loading}
                  error={error}
                  busyGroupId={busyGroupId}
                  onInvite={handleInvite}
                  onOpenShare={markShareSeen}
                  onDismissShare={markShareSeen}
                  onClearShares={clearAllShares}
                  onNavigate={() => setInboxOpen(false)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="content">
          <Outlet key={loc.pathname} />
          <div className="muted small footer-note">Cloud-synced</div>
        </div>
      </main>
    </div>
  );
}
