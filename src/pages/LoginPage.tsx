import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [stats, setStats] = useState<{ recipes: number; tags: number; photos: number } | null>(
    null
  );
  type LocationState = { from?: string };

  const nav = useNavigate();
  const loc = useLocation();
  const redirectTo = useMemo(() => {
    const from = (loc.state as LocationState)?.from;
    return typeof from === "string" ? from : "/";
  }, [loc.state]);

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin, // or `${window.location.origin}/`
      },
    });
  
    if (error) throw error;
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("sending");

    const clean = email.trim();
    if (!clean) {
      setError("Enter your email.");
      setStatus("error");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: {
        
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
      return;
    }

    setStatus("sent");
  }

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) return;
        const data = (await res.json()) as { recipes: number; tags: number; photos: number };
        if (!cancelled) setStats(data);
      } catch {
        // Ignore stats errors; this is a landing page.
      }
    }

    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const statValues = {
    recipes: stats?.recipes ?? 0,
    tags: stats?.tags ?? 0,
    photos: stats?.photos ?? 0,
  };

  return (
    <div className="login-shell">
      <div className="login-hero">
        <div className="eyebrow">Welcome</div>
        <div className="login-title">Recipe Archive</div>
        <div className="muted login-subtitle">
          Your personal cookbook, finally in sync. Store recipes, photos, and cooking flows in one
          cinematic space.
        </div>

        <div className="login-stats">
          <div className="stat-card">
            <div className="stat-value">{statValues.recipes.toString().padStart(2, "0")}</div>
            <div className="stat-label">Recipes saved</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{statValues.tags.toString().padStart(2, "0")}</div>
            <div className="stat-label">Tags curated</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{statValues.photos.toString().padStart(2, "0")}</div>
            <div className="stat-label">Photos pinned</div>
          </div>
        </div>

        <div className="login-feature-list">
          <div className="login-feature">
            <div className="feature-pill">Smart tags</div>
            <div className="muted">Filter by mood, cuisine, or prep time instantly.</div>
          </div>
          <div className="login-feature">
            <div className="feature-pill">Photo vault</div>
            <div className="muted">Pin your hero shot and build a visual gallery.</div>
          </div>
          <div className="login-feature">
            <div className="feature-pill">Cloud synced</div>
            <div className="muted">Every recipe stays synced across devices.</div>
          </div>
        </div>
      </div>

      <div className="login-panel card stack">
        <div>
          <div className="eyebrow">Sign in</div>
          <div className="h1">Recipe Archive access</div>
          <div className="muted small">Sign in to keep your recipes safe and synced.</div>
        </div>

        <button className="btn primary" type="button" onClick={signInWithGoogle}>
          Continue with Google
        </button>

        <div className="login-divider">
          <span>or</span>
        </div>

        <div className="muted small">
          We’ll email you a magic link. Open it on the device you want to use.
        </div>

        <form onSubmit={sendLink} className="stack">
          <div>
            <div className="muted small">Email</div>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="btn primary" disabled={status === "sending"} type="submit">
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>

          {status === "sent" && (
            <div className="toast success">
              Link sent. Check your email and open the link to sign in.
            </div>
          )}

          {status === "sent" && (
            <button className="btn" type="button" onClick={() => nav(redirectTo)}>
              Back
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
