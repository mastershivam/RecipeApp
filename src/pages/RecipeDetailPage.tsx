import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Recipe, RecipeChange, RecipePhoto } from "../lib/types";
import { getRecipe, deleteRecipe, updateRecipe, listRecipeChanges, getSharePermission, type SharePermission } from "../lib/recipeService";
import { listPhotosPage } from "../lib/photoService";
import { useAuth } from "../auth/UseAuth.ts";
import {
  listGroupAdmins,
  listGroupShares,
  revokeGroupShare,
  shareRecipeToGroup,
  updateGroupShare,
} from "../lib/groupService";


export default function RecipeDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, session } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);
  const [photoPage, setPhotoPage] = useState(0);
  const [photoHasMore, setPhotoHasMore] = useState(false);
  const photoPageSize = 8;
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
  const [groupShares, setGroupShares] = useState<
    { id: string; groupId: string; groupName: string; permission: SharePermission }[]
  >([]);
  const [groupOptions, setGroupOptions] = useState<{ id: string; name: string }[]>([]);
  const [groupShareId, setGroupShareId] = useState("");
  const [groupShareAccess, setGroupShareAccess] = useState<SharePermission>("view");
  const [shareOpen, setShareOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [unitMode, setUnitMode] = useState<"auto" | "imperial" | "metric">("auto");
  const [changes, setChanges] = useState<RecipeChange[]>([]);

  async function refresh() {
    if (!id) return;
    const r = await getRecipe(id);
    setRecipe(r);
    const p = await listPhotosPage(id, { page: 0, pageSize: photoPageSize });
    setPhotos(p.data);
    setPhotoHasMore(p.hasMore);
    setPhotoPage(0);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    listRecipeChanges(id)
      .then((rows) => {
        if (!cancelled) setChanges(rows);
      })
      .catch(() => {
        if (!cancelled) setChanges([]);
      });
    return () => {
      cancelled = true;
    };
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
    if (!id || !user || !recipe) return;
    if (recipe.user_id !== user.id) return;
    const recipeId = id;
    let cancelled = false;

    async function loadGroupShares() {
      try {
        const data = await listGroupShares(recipeId);
        if (!cancelled) setGroupShares(data.shares ?? []);
      } catch {
        // Ignore group share list errors for now.
      }
    }

    loadGroupShares();
    return () => {
      cancelled = true;
    };
  }, [id, user, recipe]);

  useEffect(() => {
    if (!shareOpen || !user || !recipe) return;
    if (recipe.user_id !== user.id) return;
    let cancelled = false;

    async function loadGroupOptions() {
      try {
        const adminGroups = await listGroupAdmins();
        if (!cancelled) {
          setGroupOptions(adminGroups.map((g) => ({ id: g.id, name: g.name })));
        }
      } catch {
        // Ignore group list errors for now.
      }
    }

    loadGroupOptions();
    return () => {
      cancelled = true;
    };
  }, [shareOpen, user, recipe]);

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

  const scaledServings = useMemo(() => {
    if (!recipe?.servings) return null;
    return recipe.servings * scale;
  }, [recipe?.servings, scale]);

  const metaParts = useMemo(() => {
    if (!recipe) return [];
    const parts: string[] = [];
    if (recipe.prep_minutes) parts.push(`Prep ${recipe.prep_minutes}m`);
    if (recipe.cook_minutes) parts.push(`Cook ${recipe.cook_minutes}m`);
    if (scaledServings) parts.push(`${formatAmount(scaledServings)} servings`);
    return parts;
  }, [recipe, scaledServings]);

  const isOwner = !!(user && recipe && user.id === recipe.user_id);

  async function toggleFavorite() {
    if (!recipe || !user || recipe.user_id !== user.id) return;
    const next = !recipe.is_favorite;
    await updateRecipe(recipe.id, { is_favorite: next });
    setRecipe((prev) => (prev ? { ...prev, is_favorite: next } : prev));
  }

  async function loadMorePhotos() {
    if (!id || !photoHasMore) return;
    const nextPage = photoPage + 1;
    const p = await listPhotosPage(id, { page: nextPage, pageSize: photoPageSize });
    setPhotos((prev) => [...prev, ...p.data]);
    setPhotoHasMore(p.hasMore);
    setPhotoPage(nextPage);
  }

  function handleExportJson() {
    if (!recipe) return;
    const exportData = {
      schemaVersion: 1,
      title: recipe.title,
      description: recipe.description ?? null,
      tags: recipe.tags ?? [],
      ingredients: (recipe.ingredients ?? []).map((i: any) => ({ text: i.text ?? "" })),
      steps: (recipe.steps ?? []).map((s: any) => ({ text: s.text ?? "" })),
      prepMinutes: recipe.prep_minutes ?? null,
      cookMinutes: recipe.cook_minutes ?? null,
      servings: recipe.servings ?? null,
      sourceUrl: recipe.source_url ?? null,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const titleSlug = recipe.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    const fileName = `${titleSlug || "recipe"}.json`;

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportPdf() {
    if (!recipe) return;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const ingredients = (recipe.ingredients ?? []).map((i: any) => i.text || "").filter(Boolean);
    const steps = (recipe.steps ?? []).map((s: any) => s.text || "").filter(Boolean);
    const tags = (recipe.tags ?? []).filter(Boolean).join(" · ");
    const meta = [
      recipe.prep_minutes ? `Prep ${recipe.prep_minutes}m` : null,
      recipe.cook_minutes ? `Cook ${recipe.cook_minutes}m` : null,
      recipe.servings ? `Serves ${recipe.servings}` : null,
    ]
      .filter(Boolean)
      .join(" • ");

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(recipe.title)} - Recipe Archive</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #1d1d1f; }
      h1 { font-size: 28px; margin: 0 0 8px; }
      h2 { font-size: 16px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 0.12em; color: #6e6e73; }
      .muted { color: #6e6e73; font-size: 14px; }
      .meta { margin: 6px 0 14px; font-size: 14px; }
      ul, ol { margin: 0; padding-left: 18px; }
      li { margin: 6px 0; line-height: 1.5; }
      .tags { margin-top: 8px; }
      .rule { height: 1px; background: #e5e7eb; margin: 18px 0; }
      @media print { body { margin: 0.5in; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(recipe.title)}</h1>
    ${recipe.description ? `<div class="muted">${escapeHtml(recipe.description)}</div>` : ""}
    ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ""}
    ${tags ? `<div class="tags muted">Tags: ${escapeHtml(tags)}</div>` : ""}
    ${recipe.source_url ? `<div class="muted">Source: ${escapeHtml(recipe.source_url)}</div>` : ""}
    <div class="rule"></div>
    <h2>Ingredients</h2>
    <ul>
      ${ingredients.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
    <h2>Steps</h2>
    <ol>
      ${steps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ol>
    <script>
      window.onload = () => {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function handleExportMarkdown() {
    if (!recipe) return;
    const lines: string[] = [];
    lines.push(`# ${recipe.title}`);
    if (recipe.description) lines.push(`\n${recipe.description}`);
    const meta = [
      recipe.prep_minutes ? `Prep: ${recipe.prep_minutes}m` : null,
      recipe.cook_minutes ? `Cook: ${recipe.cook_minutes}m` : null,
      recipe.servings ? `Serves: ${recipe.servings}` : null,
    ]
      .filter(Boolean)
      .join(" • ");
    if (meta) lines.push(`\n${meta}`);
    if (recipe.tags?.length) lines.push(`\nTags: ${recipe.tags.join(", ")}`);
    if (recipe.source_url) lines.push(`\nSource: ${recipe.source_url}`);

    lines.push(`\n## Ingredients`);
    (recipe.ingredients ?? []).forEach((i: any) => {
      if (i?.text) lines.push(`- ${i.text}`);
    });

    lines.push(`\n## Steps`);
    (recipe.steps ?? []).forEach((s: any, idx: number) => {
      if (s?.text) lines.push(`${idx + 1}. ${s.text}`);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const titleSlug = recipe.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    const fileName = `${titleSlug || "recipe"}.md`;
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function summarizeChange(change: RecipeChange) {
    if (change.action === "insert") return "Created";
    if (change.action === "delete") return "Deleted";
    const before = change.changes?.before;
    const after = change.changes?.after;
    if (!before || !after) return "Updated";
    const fields = [
      "title",
      "description",
      "tags",
      "ingredients",
      "steps",
      "prep_minutes",
      "cook_minutes",
      "servings",
      "source_url",
      "cover_photo_id",
      "is_favorite",
      "last_cooked_at",
    ];
    const changed = fields.filter((f) => JSON.stringify(before?.[f]) !== JSON.stringify(after?.[f]));
    if (changed.length === 0) return "Updated";
    const label = changed
      .slice(0, 3)
      .map((f) => f.replace(/_/g, " "))
      .join(", ");
    const extra = changed.length > 3 ? ` +${changed.length - 3}` : "";
    return `Updated: ${label}${extra}`;
  }
  const canEdit = isOwner || sharePermission === "edit";

  useEffect(() => {
    if (!recipe) return;
    window.dispatchEvent(
      new CustomEvent("share-permission", { detail: { canShare: isOwner } })
    );
  }, [isOwner, recipe]);

  const scaledIngredients = useMemo(() => {
    if (!recipe) return [];
    return recipe.ingredients.map((i) => scaleIngredient(i.text, scale, unitMode));
  }, [recipe, scale, unitMode]);

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

  async function shareGroup() {
    if (!id) return;
    if (!groupShareId) {
      setShareError("Pick a group to share with.");
      setShareStatus("error");
      return;
    }

    setShareStatus("sending");
    setShareError("");
    setShareNotice(null);

    try {
      const payload = await shareRecipeToGroup(id, groupShareId, groupShareAccess);
      if (payload?.share) {
        setGroupShares((prev) => {
          const existing = prev.filter((s) => s.id !== payload.share.id);
          return [...existing, payload.share].sort((a, b) => a.groupName.localeCompare(b.groupName));
        });
      }
      setShareStatus("success");
      setShareNotice("Shared with group.");
      setGroupShareId("");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Share failed.");
      setShareStatus("error");
    }
  }

  async function updateGroupShareAccess(idToUpdate: string, permission: SharePermission) {
    setShareError("");
    setShareNotice(null);
    try {
      await updateGroupShare(idToUpdate, permission);
      setGroupShares((prev) => prev.map((s) => (s.id === idToUpdate ? { ...s, permission } : s)));
      setShareNotice("Group access updated.");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Update failed.");
      setShareStatus("error");
    }
  }

  async function revokeGroup(idToDelete: string) {
    setShareError("");
    setShareNotice(null);
    try {
      await revokeGroupShare(idToDelete);
      setGroupShares((prev) => prev.filter((s) => s.id !== idToDelete));
      setShareNotice("Group access revoked.");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Revoke failed.");
      setShareStatus("error");
    }
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
            <Link to={`/recipes/${id}/cook`} className="btn">
              Cook Mode
            </Link>
            {isOwner && (
              <button className="btn" type="button" onClick={toggleFavorite}>
                {recipe.is_favorite ? "Favorited" : "Favorite"}
              </button>
            )}
            <button className="btn" type="button" onClick={handleExportJson}>
              Export JSON
            </button>
            <button className="btn" type="button" onClick={handleExportMarkdown}>
              Export Markdown
            </button>
            <button className="btn" type="button" onClick={handleExportPdf}>
              Export PDF
            </button>
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
                  Invite someone or a group to view or edit this recipe. They must have an account.
                </div>
              </div>
              <button className="btn ghost" type="button" onClick={() => setShareOpen(false)}>
                Close
              </button>
            </div>

            <div className="stack">
              <div className="h2">Share with group</div>
              <div className="row">
                <select
                  className="select"
                  value={groupShareId}
                  onChange={(e) => setGroupShareId(e.target.value)}
                >
                  <option value="">Select group</option>
                  {groupOptions.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={groupShareAccess}
                  onChange={(e) => setGroupShareAccess(e.target.value as SharePermission)}
                >
                  <option value="view">View only</option>
                  <option value="edit">Can edit</option>
                </select>
                <button className="btn" onClick={shareGroup} disabled={shareStatus === "sending"}>
                  {shareStatus === "sending" ? "Sharing…" : "Share with group"}
                </button>
              </div>

              <div className="share-list">
                {groupShares.length === 0 ? (
                  <div className="muted small">No groups yet.</div>
                ) : (
                  groupShares.map((share) => (
                    <div key={share.id} className="share-row">
                      <div className="share-email">{share.groupName}</div>
                      <div className="share-actions">
                        <select
                          className="select"
                          value={share.permission}
                          onChange={(e) => updateGroupShareAccess(share.id, e.target.value as SharePermission)}
                        >
                          <option value="view">View</option>
                          <option value="edit">Edit</option>
                        </select>
                        <button className="btn danger" type="button" onClick={() => revokeGroup(share.id)}>
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hr" />

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
          {photoHasMore && (
            <button className="btn" type="button" onClick={loadMorePhotos}>
              Load more photos
            </button>
          )}
        </div>
      )}
      
      <div className="detail-grid">
        <div className="card">
          <div className="row wrap" style={{ alignItems: "center" }}>
            <div className="h2">Ingredients</div>
            <div style={{ flex: 0 }} className="segmented">
              {[1, 2, 3].map((value) => (
                <button
                  key={value}
                  className={`btn ${scale === value ? "primary" : ""}`}
                  type="button"
                  onClick={() => setScale(value)}
                >
                  {value}x
                </button>
              ))}
            </div>
            <div style={{ flex: 0 }} className="segmented">
              <button
                className={`btn ${unitMode === "auto" ? "primary" : ""}`}
                type="button"
                onClick={() => setUnitMode("auto")}
              >
                Auto
              </button>
              <button
                className={`btn ${unitMode === "imperial" ? "primary" : ""}`}
                type="button"
                onClick={() => setUnitMode("imperial")}
              >
                Imperial
              </button>
              <button
                className={`btn ${unitMode === "metric" ? "primary" : ""}`}
                type="button"
                onClick={() => setUnitMode("metric")}
              >
                Metric
              </button>
            </div>
          </div>
          <div className="hr" />
          <ul className="detail-list">
            {scaledIngredients.map((text, idx) => (
              <li key={idx}>{text}</li>
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

      {changes.length > 0 && (
        <div className="card stack">
          <div className="h2">Change log</div>
          <div className="hr" />
          <ul className="detail-list">
            {changes.map((change) => (
              <li key={change.id}>
                <div style={{ fontWeight: 600 }}>{summarizeChange(change)}</div>
                <div className="muted small">
                  {new Date(change.changed_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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

type ParsedQuantity = {
  amount: number;
  unit: string | null;
  unitToken: string | null;
  rest: string;
};

const VOLUME_TO_ML: Record<string, number> = {
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  "fl oz": 29.5735,
  pt: 473.176,
  qt: 946.353,
  gal: 3785.41,
};

const WEIGHT_TO_G: Record<string, number> = {
  oz: 28.3495,
  lb: 453.592,
};

const UNIT_ALIASES: Record<string, string> = {
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  cup: "cup",
  cups: "cup",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  pt: "pt",
  pint: "pt",
  pints: "pt",
  qt: "qt",
  quart: "qt",
  quarts: "qt",
  gal: "gal",
  gallon: "gal",
  gallons: "gal",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
};

const LIQUID_KEYWORDS = [
  "water",
  "milk",
  "cream",
  "broth",
  "stock",
  "juice",
  "vinegar",
  "soy sauce",
  "fish sauce",
  "oil",
  "olive oil",
  "sesame oil",
  "buttermilk",
  "wine",
  "beer",
  "coconut milk",
  "honey",
  "syrup",
];

const SOLID_KEYWORDS = [
  "flour",
  "rice",
  "sugar",
  "salt",
  "butter",
  "cheese",
  "onion",
  "garlic",
  "pepper",
  "tomato",
  "potato",
  "carrot",
  "chicken",
  "beef",
  "pork",
  "tofu",
  "mushroom",
  "peas",
  "beans",
  "lentils",
  "pasta",
  "breadcrumbs",
];

function scaleIngredient(text: string, scale: number, unitMode: "auto" | "imperial" | "metric") {
  const parsed = parseQuantity(text);
  if (!parsed) return text;

  const scaledAmount = parsed.amount * scale;
  if (!parsed.unit) {
    const token = parsed.unitToken ? `${parsed.unitToken} ` : "";
    return `${formatAmount(scaledAmount)} ${token}${parsed.rest}`.trim();
  }

  const unitKey = normalizeUnit(parsed.unit);
  if (!unitKey) {
    const unitText = parsed.unitToken ?? parsed.unit;
    return `${formatAmount(scaledAmount)} ${unitText} ${parsed.rest}`.trim();
  }
  if (unitMode === "metric") {
    const metric = convertToMetric(scaledAmount, unitKey, parsed.rest);
    if (metric) {
      return `${formatAmount(metric.amount)} ${metric.unit} ${parsed.rest}`.trim();
    }
  }

  if (unitMode === "imperial") {
    const imperial = convertToImperial(scaledAmount, unitKey, parsed.rest);
    if (imperial) {
      return `${formatAmount(imperial.amount)} ${imperial.unit} ${parsed.rest}`.trim();
    }
  }

  if (unitMode === "auto") {
    if (isMetricUnit(unitKey)) {
      const imperial = convertToImperial(scaledAmount, unitKey, parsed.rest);
      if (imperial) {
        return `${formatAmount(imperial.amount)} ${imperial.unit} ${parsed.rest}`.trim();
      }
    } else {
      const metric = convertToMetric(scaledAmount, unitKey, parsed.rest);
      if (metric) {
        return `${formatAmount(metric.amount)} ${metric.unit} ${parsed.rest}`.trim();
      }
    }
  }

  const unitText = parsed.unitToken ?? parsed.unit;
  return `${formatAmount(scaledAmount)} ${unitText} ${parsed.rest}`.trim();
}

function parseQuantity(text: string): ParsedQuantity | null {
  const match = text.trim().match(
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)([a-zA-Z]+)?(.*)$/
  );
  if (!match) return null;
  const amount = parseAmount(match[1]);
  const inlineUnit = match[2] || null;
  const restRaw = (match[3] || "").trim();

  if (inlineUnit) {
    const normalized = normalizeUnit(inlineUnit);
    return {
      amount,
      unit: normalized,
      unitToken: inlineUnit,
      rest: restRaw,
    };
  }

  if (!restRaw) return { amount, unit: null, unitToken: null, rest: "" };

  const { unit, unitToken, rest } = parseUnit(restRaw);
  return { amount, unit, unitToken, rest };
}

function parseAmount(raw: string) {
  const cleaned = raw.trim();
  if (cleaned.includes(" ")) {
    const [whole, frac] = cleaned.split(/\s+/);
    return parseFloat(whole) + parseFraction(frac);
  }
  if (cleaned.includes("/")) return parseFraction(cleaned);
  return parseFloat(cleaned);
}

function parseFraction(raw: string) {
  const [num, den] = raw.split("/").map((n) => parseFloat(n));
  if (!den) return 0;
  return num / den;
}

function parseUnit(rest: string) {
  const lower = rest.toLowerCase();
  const tokens = lower.split(/\s+/);
  if (tokens.length >= 2) {
    const maybeTwo = `${tokens[0]} ${tokens[1]}`;
    if (maybeTwo === "fl oz" || maybeTwo === "fluid ounce" || maybeTwo === "fluid ounces") {
      const originalToken = rest.split(/\s+/).slice(0, 2).join(" ");
      return { unit: "fl oz", unitToken: originalToken, rest: rest.split(/\s+/).slice(2).join(" ") };
    }
  }

  const unitToken = rest.split(/\s+/)[0];
  const unitKey = normalizeUnit(unitToken);
  if (!unitKey) {
    return { unit: null, unitToken: null, rest };
  }
  const remaining = rest.split(/\s+/).slice(1).join(" ");
  return { unit: unitKey, unitToken, rest: remaining };
}

function normalizeUnit(unit: string) {
  const cleaned = unit.toLowerCase().replace(/[.,]/g, "");
  return UNIT_ALIASES[cleaned] ?? null;
}

function convertToMetric(amount: number, unit: string, rest: string) {
  if (unit === "ml" || unit === "l") {
    const ml = unit === "l" ? amount * 1000 : amount;
    return normalizeMetric(ml, "ml");
  }
  if (unit === "g" || unit === "kg") {
    const g = unit === "kg" ? amount * 1000 : amount;
    return normalizeMetric(g, "g");
  }
  if (VOLUME_TO_ML[unit]) {
    const target = detectIngredientState(rest);
    if (target === "solid") {
      return normalizeMetric(amount * VOLUME_TO_ML[unit], "g");
    }
    return normalizeMetric(amount * VOLUME_TO_ML[unit], "ml");
  }
  if (WEIGHT_TO_G[unit]) {
    return normalizeMetric(amount * WEIGHT_TO_G[unit], "g");
  }
  return null;
}

function convertToImperial(amount: number, unit: string, rest: string) {
  if (unit === "g") {
    return normalizeImperial(amount / WEIGHT_TO_G.oz, "oz");
  }
  if (unit === "kg") {
    return normalizeImperial((amount * 1000) / WEIGHT_TO_G.oz, "oz");
  }
  if (unit === "ml") {
    return normalizeImperial(amount / VOLUME_TO_ML["fl oz"], "fl oz", rest);
  }
  if (unit === "l") {
    return normalizeImperial((amount * 1000) / VOLUME_TO_ML["fl oz"], "fl oz", rest);
  }
  if (WEIGHT_TO_G[unit]) {
    return normalizeImperial(amount, unit);
  }
  if (VOLUME_TO_ML[unit]) {
    return normalizeImperial(amount, unit, rest);
  }
  return null;
}

function normalizeImperial(amount: number, unit: string, rest?: string) {
  if (unit === "oz") {
    if (amount >= 16) return { amount: amount / 16, unit: "lb" };
    return { amount, unit: "oz" };
  }
  if (unit === "fl oz") {
    const target = rest ? detectIngredientState(rest) : "liquid";
    if (target === "solid") return { amount, unit: "oz" };
    if (amount >= 32) return { amount: amount / 32, unit: "qt" };
    if (amount >= 16) return { amount: amount / 16, unit: "pt" };
    if (amount >= 8) return { amount: amount / 8, unit: "cup" };
    return { amount, unit: "fl oz" };
  }
  return { amount, unit };
}

function isMetricUnit(unit: string) {
  return unit === "g" || unit === "kg" || unit === "ml" || unit === "l";
}

function normalizeMetric(amount: number, unit: "ml" | "g") {
  if (unit === "ml" && amount >= 1000) {
    return { amount: amount / 1000, unit: "l" };
  }
  if (unit === "g" && amount >= 1000) {
    return { amount: amount / 1000, unit: "kg" };
  }
  return { amount, unit };
}

function formatAmount(amount: number) {
  const rounded =
    amount >= 10 ? Math.round(amount * 10) / 10 : Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toString();
}

function detectIngredientState(rest: string) {
  const text = rest.toLowerCase();
  for (const keyword of LIQUID_KEYWORDS) {
    if (text.includes(keyword)) return "liquid";
  }
  for (const keyword of SOLID_KEYWORDS) {
    if (text.includes(keyword)) return "solid";
  }
  return "liquid";
}
