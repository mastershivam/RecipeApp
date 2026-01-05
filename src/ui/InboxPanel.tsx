import { Link } from "react-router-dom";
import type { GroupSummary } from "../lib/groupService";
import type { SharedRecipe } from "../lib/recipeService";

type InboxPanelProps = {
  variant?: "page" | "popover";
  invites: GroupSummary[];
  shares: SharedRecipe[];
  loading: boolean;
  error: string | null;
  busyGroupId: string | null;
  onInvite: (groupId: string, accept: boolean) => void;
  onOpenShare?: (recipeId: string) => void;
  onDismissShare?: (recipeId: string) => void;
  onClearShares?: () => void;
  onNavigate?: () => void;
};

export default function InboxPanel({
  variant = "page",
  invites,
  shares,
  loading,
  error,
  busyGroupId,
  onInvite,
  onOpenShare,
  onDismissShare,
  onClearShares,
  onNavigate,
}: InboxPanelProps) {
  const isPopover = variant === "popover";

  if (loading) {
    return <div className={isPopover ? "inbox-loading" : "card"}>Loading inbox…</div>;
  }

  return (
    <div className={`stack ${isPopover ? "inbox-panel popover" : ""}`}>
      {isPopover && (
        <div className="inbox-header">
          <div className="h2">Sharing inbox</div>
          {onClearShares && shares.length > 0 && (
            <button className="btn ghost small" type="button" onClick={onClearShares}>
              Clear all
            </button>
          )}
        </div>
      )}

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
                    onClick={() => onInvite(invite.id, true)}
                    disabled={busyGroupId === invite.id}
                  >
                    Accept
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => onInvite(invite.id, false)}
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
        <div className="inbox-section-header">
          <div className="h2">Shared with you</div>
          {!isPopover && onClearShares && shares.length > 0 && (
            <button className="btn ghost small" type="button" onClick={onClearShares}>
              Clear all
            </button>
          )}
        </div>
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
                  <Link
                    className="btn"
                    to={`/recipes/${share.recipe.id}`}
                    onClick={() => {
                      onOpenShare?.(share.recipe.id);
                      onNavigate?.();
                    }}
                  >
                    Open
                  </Link>
                  {onDismissShare && (
                    <button
                      className="btn ghost dismiss-share"
                      type="button"
                      aria-label="Dismiss shared recipe"
                      onClick={() => onDismissShare(share.recipe.id)}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
