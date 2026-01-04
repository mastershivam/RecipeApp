import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GroupSummary } from "../lib/groupService";
import { listGroupInvites, respondToInvite } from "../lib/groupService";
import { listSharedRecipes, type SharedRecipe } from "../lib/recipeService";

export default function InboxPage() {
  const [invites, setInvites] = useState<GroupSummary[]>([]);
  const [shares, setShares] = useState<SharedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [inviteRows, shareRows] = await Promise.all([listGroupInvites(), listSharedRecipes()]);
        if (cancelled) return;
        setInvites(inviteRows);
        setShares(shareRows);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load inbox.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleInvite(groupId: string, accept: boolean) {
    setBusyGroupId(groupId);
    setError(null);
    try {
      await respondToInvite(groupId, accept);
      setInvites((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err: any) {
      setError(err?.message || "Failed to update invite.");
    } finally {
      setBusyGroupId(null);
    }
  }

  if (loading) return <div className="card">Loading inbox…</div>;

  return (
    <div className="stack">
      {error && <div className="toast error">{error}</div>}

      <div className="card stack">
        <div className="h2">Group invites</div>
        <div className="muted small">Accept or decline group invites here.</div>
        <div className="hr" />
        {invites.length === 0 ? (
          <div className="muted small">No pending invites.</div>
        ) : (
          <div className="share-list">
            {invites.map((invite) => (
              <div key={invite.id} className="share-row">
                <div>
                  <div style={{ fontWeight: 600 }}>{invite.name}</div>
                  <div className="muted small">Role: {invite.role}</div>
                </div>
                <div className="share-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => handleInvite(invite.id, true)}
                    disabled={busyGroupId === invite.id}
                  >
                    Accept
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => handleInvite(invite.id, false)}
                    disabled={busyGroupId === invite.id}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card stack">
        <div className="h2">Shared with you</div>
        <div className="muted small">Recipes others have shared.</div>
        <div className="hr" />
        {shares.length === 0 ? (
          <div className="muted small">No shared recipes yet.</div>
        ) : (
          <div className="share-list">
            {shares.map((share) => (
              <div key={share.recipe.id} className="share-row">
                <div>
                  <div style={{ fontWeight: 600 }}>{share.recipe.title}</div>
                  <div className="muted small">
                    Access: {share.permission === "edit" ? "Can edit" : "View only"}
                  </div>
                </div>
                <div className="share-actions">
                  <Link className="btn" to={`/recipes/${share.recipe.id}`}>
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
