import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Recipe, RecipePhoto } from "../lib/types";
import { getRecipe, deleteRecipe, getSharePermission, type SharePermission } from "../lib/recipeService";
import { listPhotos } from "../lib/photoService";
import { useAuth } from "../auth/AuthProvider";


export default function RecipeDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, session } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [sharePermission, setSharePermission] = useState<SharePermission | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareAccess, setShareAccess] = useState<SharePermission>("view");
  const [shareStatus, setShareStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [shareError, setShareError] = useState<string>("");
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [shareList, setShareList] = useState<
    { id: string; email: string; permission: SharePermission }[]
  >([]);
  const [shareOpen, setShareOpen] = useState(false);

  async function refresh() {
    if (!id) return;
    const r = await getRecipe(id);
    setRecipe(r);
    const p = await listPhotos(id);
    setPhotos(p);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;
    if (recipe && recipe.user_id === user.id) {
      setSharePermission("edit");
      return;
    }

    let cancelled = false;
    async function loadPermission() {
      if (!id) return;
      try {
        const perm = await getSharePermission(id);
        if (!cancelled) setSharePermission(perm);
      } catch {
        if (!cancelled) setSharePermission(null);
      }
    }
    loadPermission();
    return () => {
      cancelled = true;
    };
  }, [id, user, recipe]);

  useEffect(() => {
    const onOpen = () => {
      if (user && recipe?.user_id === user.id) setShareOpen(true);
    };
    window.addEventListener("open-share-modal", onOpen);
    return () => window.removeEventListener("open-share-modal", onOpen);
  }, [user, recipe]);

  useEffect(() => {
    if (!id || !session?.access_token || !user || !recipe) return;
    if (recipe.user_id !== user.id) return;
    let cancelled = false;

    async function loadShares() {
      if (!session?.access_token) return;
      try {
        const res = await fetch(`/api/share-list?recipeId=${id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { shares: { id: string; email: string; permission: SharePermission }[] };
        if (!cancelled) setShareList(data.shares ?? []);
      } catch {
        // Ignore share list errors for now.
      }
    }

    loadShares();
    return () => {
      cancelled = true;
    };
  }, [id, session?.access_token, user, recipe]);

  useEffect(() => {
    if (lightboxIndex === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") {
        setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length));
      }
      if (e.key === "ArrowRight") {
        setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, photos.length]);

  const coverUrl = useMemo(() => {
    if (!recipe?.cover_photo_id) return undefined;
    return photos.find((p) => p.id === recipe.cover_photo_id)?.signed_url;
  }, [recipe?.cover_photo_id, photos]);

  const metaParts = useMemo(() => {
    if (!recipe) return [];
    const parts: string[] = [];
    if (recipe.prep_minutes) parts.push(`Prep ${recipe.prep_minutes}m`);
    if (recipe.cook_minutes) parts.push(`Cook ${recipe.cook_minutes}m`);
    if (recipe.servings) parts.push(`${recipe.servings} servings`);
    return parts;
  }, [recipe]);

  const isOwner = !!(user && recipe && user.id === recipe.user_id);
  const canEdit = isOwner || sharePermission === "edit";

  useEffect(() => {
    if (!recipe) return;
    window.dispatchEvent(
      new CustomEvent("share-permission", { detail: { canShare: isOwner } })
    );
  }, [isOwner, recipe]);

  if (!id) return <div className="card">Missing id</div>;
  if (!recipe) return <div className="card">Loading…</div>;

  async function shareRecipe() {
    if (!id) return;
    const email = shareEmail.trim();
    if (!email) {
      setShareError("Enter an email to share with.");
      setShareStatus("error");
      return;
    }
    if (!session?.access_token) {
      setShareError("You're not signed in.");
      setShareStatus("error");
      return;
    }

    setShareStatus("sending");
    setShareError("");
    setShareNotice(null);

    const res = await fetch("/api/share-recipe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ recipeId: id, email, permission: shareAccess }),
    });

    if (!res.ok) {
      const msg = await res.text();
      setShareError(msg || "Share failed.");
      setShareStatus("error");
      return;
    }

    const payload = await res.json();
    if (payload?.share) {
      setShareList((prev) => {
        const existing = prev.filter((s) => s.id !== payload.share.id);
        return [...existing, payload.share].sort((a, b) => a.email.localeCompare(b.email));
      });
    }

    setShareStatus("success");
    setShareNotice("Invite sent.");
    setShareEmail("");
  }

  async function updateShare(idToUpdate: string, permission: SharePermission) {
    if (!id || !session?.access_token) return;
    setShareError("");
    setShareNotice(null);
    const res = await fetch("/api/share-update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ shareId: idToUpdate, permission }),
    });

    if (!res.ok) {
      const msg = await res.text();
      setShareError(msg || "Update failed.");
      setShareStatus("error");
      return;
    }

    setShareList((prev) =>
      prev.map((s) => (s.id === idToUpdate ? { ...s, permission } : s))
    );
    setShareNotice("Access updated.");
  }

  async function revokeShare(idToDelete: string) {
    if (!session?.access_token) return;
    setShareError("");
    setShareNotice(null);
    const res = await fetch("/api/share-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ shareId: idToDelete }),
    });

    if (!res.ok) {
      const msg = await res.text();
      setShareError(msg || "Revoke failed.");
      setShareStatus("error");
      return;
    }

    setShareList((prev) => prev.filter((s) => s.id !== idToDelete));
    setShareNotice("Access revoked.");
  }

  return (
    <div className="stack detail-page">
      <div className="card detail-hero">
        <div className="detail-hero-copy">
          <div className="eyebrow">Recipe</div>
          <div className="hero-title">{recipe.title}</div>
          {metaParts.length > 0 && (
            <div className="meta-row">
              {metaParts.map((part) => (
                <span key={part} className="meta-pill">
                  {part}
                </span>
              ))}
            </div>
          )}
          {recipe.description && <div className="muted">{recipe.description}</div>}

          {recipe.tags.length > 0 && (
            <div className="badges detail-tags">
              {recipe.tags.map((t) => (
                <div key={t} className="badge">
                  {t}
                </div>
              ))}
            </div>
          )}

          {recipe.source_url && (
            <div className="small">
              Source:{" "}
              <a href={recipe.source_url} target="_blank" rel="noreferrer" className="muted">
                {recipe.source_url}
              </a>
            </div>
          )}

          <div className="detail-actions">
            {canEdit && (
              <Link to={`/recipes/${id}/edit`} className="btn">
                Edit
              </Link>
            )}
            {isOwner && (
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm("Delete this recipe?")) return;
                  await deleteRecipe(id);
                  nav("/");
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="detail-hero-media">
          {(() => {
            const coverSrc = coverUrl || photos[0]?.signed_url || "";
            const coverIdx =
              recipe.cover_photo_id ? photos.findIndex((p) => p.id === recipe.cover_photo_id) : 0;

            return coverSrc ? (
              <img
                className="thumb zoomable detail-hero-img"
                src={coverSrc}
                alt=""
                onClick={() => {
                  if (photos.length === 0) return;
                  const idx = coverIdx >= 0 ? coverIdx : 0;
                  setLightboxIndex(idx);
                }}
              />
            ) : (
              <div className="detail-hero-placeholder">
                <div className="muted small">No photo yet</div>
              </div>
            );
          })()}
        </div>
      </div>

      {isOwner && shareOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="h2">Share recipe</div>
                <div className="muted small">
                  Invite someone to view or edit this recipe. They must have an account.
                </div>
              </div>
              <button className="btn ghost" type="button" onClick={() => setShareOpen(false)}>
                Close
              </button>
            </div>

            <div className="stack">
              <div className="row">
                <input
                  className="input"
                  placeholder="friend@example.com"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  type="email"
                />
                <select
                  className="select"
                  value={shareAccess}
                  onChange={(e) => setShareAccess(e.target.value as SharePermission)}
                >
                  <option value="view">View only</option>
                  <option value="edit">Can edit</option>
                </select>
              </div>
              {shareError && <div className="toast error">{shareError}</div>}
              {shareNotice && <div className="toast success">{shareNotice}</div>}
              <button className="btn primary" onClick={shareRecipe} disabled={shareStatus === "sending"}>
                {shareStatus === "sending" ? "Sharing…" : "Share"}
              </button>
            </div>

            <div className="hr" />

            <div className="stack">
              <div className="h2">Shared with</div>
              {shareList.length === 0 ? (
                <div className="muted small">No one yet.</div>
              ) : (
                <div className="share-list">
                  {shareList.map((share) => (
                    <div key={share.id} className="share-row">
                      <div className="share-email">{share.email}</div>
                      <div className="share-actions">
                        <select
                          className="select"
                          value={share.permission}
                          onChange={(e) => updateShare(share.id, e.target.value as SharePermission)}
                        >
                          <option value="view">View</option>
                          <option value="edit">Edit</option>
                        </select>
                        <button
                          className="btn danger"
                          type="button"
                          onClick={() => revokeShare(share.id)}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {photos.length > 0 && (
        <div className="card stack">
          <div className="h2">Gallery</div>
          <div className="hr" />
          <div className="gallery">
            {photos.map((p, idx) => (
              <div key={p.id} className="card gallery-item">
                <div className="gallery-media">
                  <img
                    className="thumb zoomable"
                    src={p.signed_url || ""}
                    alt=""
                    onClick={() => p.signed_url && setLightboxIndex(idx)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="detail-grid">
        <div className="card">
          <div className="h2">Ingredients</div>
          <div className="hr" />
          <ul className="detail-list">
            {recipe.ingredients.map((i, idx) => (
              <li key={idx}>{i.text}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <div className="h2">Steps</div>
          <div className="hr" />
          <ol className="detail-list ordered">
            {recipe.steps.map((s, idx) => (
              <li key={idx}>{s.text}</li>
            ))}
          </ol>
        </div>
      </div>

      

      {lightboxIndex !== null && photos[lightboxIndex]?.signed_url && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="lightbox-panel" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" type="button" onClick={() => setLightboxIndex(null)}>
              ✕
            </button>

            {photos.length > 1 && (
              <>
                <button
                  className="lightbox-nav prev"
                  type="button"
                  onClick={() =>
                    setLightboxIndex((i) =>
                      i === null ? null : (i - 1 + photos.length) % photos.length
                    )
                  }
                  aria-label="Previous photo"
                >
                  ‹
                </button>
                <button
                  className="lightbox-nav next"
                  type="button"
                  onClick={() =>
                    setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length))
                  }
                  aria-label="Next photo"
                >
                  ›
                </button>
              </>
            )}

            <img className="lightbox-img" src={photos[lightboxIndex]!.signed_url!} alt="" />
          </div>
        </div>
      )}
    </div>
  );
}
