import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string>("");

  const nav = useNavigate();
  const loc = useLocation();
  const redirectTo = useMemo(() => {
    const from = (loc.state as any)?.from;
    return typeof from === "string" ? from : "/";
  }, [loc.state]);

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
        // IMPORTANT: set this to your deployed URL later (Vercel etc.)
        // For local dev, this is fine:
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

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div className="card stack">
        <div className="h1">Sign in</div>
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

          {error && <div style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div>}

          <button className="btn primary" disabled={status === "sending"} type="submit">
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>

          {status === "sent" && (
            <div className="toast success">
            Link sent. Check your email and open the link to sign in.
          </div>
          )}

          <button className="btn" type="button" onClick={() => nav(redirectTo)}>
            Back
          </button>
        </form>
      </div>
    </div>
  );
}