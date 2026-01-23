import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Recipe, RecipeChange, RecipePhoto } from "../lib/types";
import {
  getRecipe,
  deleteRecipe,
  updateRecipe,
  listRecipeChanges,
  getSharePermission,
  getRecipeSuggestions,
  rollbackRecipe,
  type SharePermission,
  type RecipeSuggestions,
  type RecipeNutrition,
  generateRecipeNutrition,
} from "../lib/recipeService";
import { formatAmount, scaleIngredient, type UnitMode } from "../lib/ingredientScaling";
import { listPhotosPage } from "../lib/photoService";
import { useAuth } from "../auth/UseAuth.ts";
import VersionComparison from "../ui/VersionComparison";
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
  const [unitMode, setUnitMode] = useState<UnitMode>(() => {
    const stored = localStorage.getItem("unitPreference");
    if (stored === "imperial" || stored === "metric") return stored;
    return "auto";
  });
  const [changes, setChanges] = useState<RecipeChange[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsStatus, setSuggestionsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [suggestionsError, setSuggestionsError] = useState("");
  const [suggestions, setSuggestions] = useState<RecipeSuggestions | null>(null);
  const [versionCompareOpen, setVersionCompareOpen] = useState(false);
  const [selectedChange, setSelectedChange] = useState<RecipeChange | null>(null);
  const [rollbackStatus, setRollbackStatus] = useState<"idle" | "loading" | "error">("idle");
  const [rollbackError, setRollbackError] = useState("");
  const [nutritionStatus, setNutritionStatus] = useState<"idle" | "loading" | "error">("idle");
  const [nutritionError, setNutritionError] = useState("");
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null);
  const [showMacrosPreference, setShowMacrosPreference] = useState(() => {
    return localStorage.getItem("showMacrosPerServing") === "true";
  });

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
    setNutrition(null);
    setNutritionStatus("idle");
    setNutritionError("");
  }, [id]);

  useEffect(() => {
    if (!showMacrosPreference || !recipe) return;
    if (!recipe.servings) return;
    if (nutrition || nutritionStatus !== "idle") return;
    handleGenerateNutrition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMacrosPreference, recipe?.id]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === "showMacrosPerServing") {
        setShowMacrosPreference(event.newValue === "true");
      }
      if (event.key === "unitPreference") {
        if (event.newValue === "imperial" || event.newValue === "metric") {
          setUnitMode(event.newValue);
        }
      }
    }
    function onMacrosPreference(event: Event) {
      const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      if (typeof enabled === "boolean") setShowMacrosPreference(enabled);
    }
    function onUnitPreference(event: Event) {
      const unit = (event as CustomEvent<{ unit?: "metric" | "imperial" }>).detail?.unit;
      if (unit === "metric" || unit === "imperial") setUnitMode(unit);
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("macros-preference-change", onMacrosPreference);
    window.addEventListener("unit-preference-change", onUnitPreference);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("macros-preference-change", onMacrosPreference);
      window.removeEventListener("unit-preference-change", onUnitPreference);
    };
  }, []);

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

  async function loadSuggestions(force = false) {
    if (!id) return;
    if (suggestionsStatus === "loading") return;
    if (!force && suggestions) return;
    setSuggestionsStatus("loading");
    setSuggestionsError("");
    try {
      const data = await getRecipeSuggestions(id);
      setSuggestions(data);
      setSuggestionsStatus("idle");
    } catch (err) {
      setSuggestionsStatus("error");
      setSuggestionsError(err instanceof Error ? err.message : "Failed to load suggestions.");
    }
  }

  function openSuggestions() {
    setSuggestionsOpen(true);
    loadSuggestions();
  }

  function formatSuggestionDetails(item: { rational?: string; change?: string }) {
    const rational = item.rational?.trim();
    const change = item.change?.trim();
    if (rational && change) {
      const trimmed = rational.replace(/[.!?]\s*$/, "");
      return `${trimmed}. ${change}`;
    }
    return rational || change || "";
  }

  const suggestionsModal =
    suggestionsOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="modal-overlay suggestions-modal" onClick={() => setSuggestionsOpen(false)}>
            <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="suggestions-title">
                  <div className="h2">AI suggestions</div>
                  <div className="muted small">Improvements and alternatives for this recipe.</div>
                </div>
                <div className="row" style={{ alignItems: "center" }}>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => loadSuggestions(true)}
                    disabled={suggestionsStatus === "loading"}
                  >
                    {suggestionsStatus === "loading" ? "Refreshing..." : "Refresh"}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => setSuggestionsOpen(false)}>
                    Close
                  </button>
                </div>
              </div>

              {suggestionsStatus === "loading" && (
                <div className="card muted">Generating suggestions...</div>
              )}

              {suggestionsStatus === "error" && (
                <div className="card">
                  <div style={{ fontWeight: 600 }}>Could not load suggestions.</div>
                  <div className="muted small">{suggestionsError}</div>
                </div>
              )}

              {suggestions && suggestionsStatus !== "loading" && (
                <div className="stack">
                  <div className="card stack">
                    <div className="h2">Improvements</div>
                    <div className="hr" />
                    {(suggestions.improvements ?? []).length === 0 ? (
                      <div className="muted small">No improvements returned.</div>
                    ) : (
                      <div className="stack">
                        {suggestions.improvements.map((item, idx) => (
                          <div key={`${item.title}-${idx}`} className="card suggestion-card">
                            <div style={{ fontWeight: 600 }}>{item.title}</div>
                            {formatSuggestionDetails(item) ? (
                              <div className="muted">{formatSuggestionDetails(item)}</div>
                            ) : (
                              <div className="muted small">No details provided.</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card stack">
                    <div className="h2">Alternatives</div>
                    <div className="hr" />
                    {(suggestions.alternatives ?? []).length === 0 ? (
                      <div className="muted small">No alternatives returned.</div>
                    ) : (
                      <div className="stack">
                        {suggestions.alternatives.map((item, idx) => (
                          <div key={`${item.title}-${idx}`} className="card suggestion-card">
                            <div style={{ fontWeight: 600 }}>{item.title}</div>
                            {formatSuggestionDetails(item) ? (
                              <div className="muted">{formatSuggestionDetails(item)}</div>
                            ) : (
                              <div className="muted small">No details provided.</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

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
      ingredients: scaledIngredients.map((text) => ({ text })),
      steps: (recipe.steps ?? []).map((s: unknown) => ({ text: s as {text?:string} ?? "" })),
      prepMinutes: recipe.prep_minutes ?? null,
      cookMinutes: recipe.cook_minutes ?? null,
      servings: recipe.servings ?? null,
      sourceUrl: recipe.source_url ?? null,
      scale,
      unitMode,
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
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const ingredients = scaledIngredients;
    const steps = (recipe.steps ?? []).map((s: unknown) => (s as { text?: string }).text || "").filter(Boolean);
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
    <title>${escapeHtml(recipe.title)} - keep</title>
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

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const onLoad = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    };

    iframe.onload = onLoad;
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
    scaledIngredients.forEach((item) => {
      if (item) lines.push(`- ${item}`);
    });

    lines.push(`\n## Steps`);
    (recipe.steps ?? []).forEach((s: unknown, idx: number) => {
      if ((s as { text?: string }).text) lines.push(`${idx + 1}. ${(s as { text?: string }) .text}`);
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
    const changed = fields.filter(
      (f) => JSON.stringify((before as Record<string, unknown>)?.[f]) !== JSON.stringify((after as Record<string, unknown>)?.[f])
    );
    if (changed.length === 0) return "Updated";
    const label = changed
      .slice(0, 3)
      .map((f) => f.replace(/_/g, " "))
      .join(", ");
    const extra = changed.length > 3 ? ` +${changed.length - 3}` : "";
    return `Updated: ${label}${extra}`;
  }

  function openVersionCompare(change: RecipeChange) {
    setSelectedChange(change);
    setVersionCompareOpen(true);
    setRollbackStatus("idle");
    setRollbackError("");
  }

  async function handleRollback(changeId: string) {
    if (!id || !recipe) return;
    setRollbackStatus("loading");
    setRollbackError("");
    try {
      await rollbackRecipe(id, changeId);
      setRollbackStatus("idle");
      setVersionCompareOpen(false);
      await refresh();
      // Reload changes to reflect the rollback
      const updatedChanges = await listRecipeChanges(id);
      setChanges(updatedChanges);
    } catch (err) {
      setRollbackStatus("error");
      setRollbackError(err instanceof Error ? err.message : "Failed to rollback recipe");
    }
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

  async function handleGenerateNutrition() {
    if (!recipe || nutritionStatus === "loading") return;
    setNutritionError("");
    if (!recipe.servings) {
      setNutritionError("Add servings to calculate per-serving nutrition.");
      setNutritionStatus("error");
      return;
    }
    setNutritionStatus("loading");
    try {
      const data = await generateRecipeNutrition(recipe.id);
      setNutrition(data);
      setNutritionStatus("idle");
    } catch (err) {
      setNutritionError(err instanceof Error ? err.message : "Nutrition generation failed.");
      setNutritionStatus("error");
    }
  }

  function formatMacro(value: number) {
    if (!Number.isFinite(value)) return "—";
    return Number.isInteger(value) ? `${value}g` : `${value.toFixed(1)}g`;
  }

  function formatCalories(value: number) {
    if (!Number.isFinite(value)) return "—";
    return `${Math.round(value)} kcal`;
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
            <button className="btn" type="button" onClick={() => setExportOpen((v) => !v)}>
              Export
            </button>
            <button className="btn ai-generate" type="button" onClick={openSuggestions}>
              AI Suggestions
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

        {exportOpen && (
          <div className="modal-overlay" onClick={() => setExportOpen(false)}>
            <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="h2">Export format</div>
                  <div className="muted small">Choose a format to download.</div>
                </div>
                <button className="btn ghost" type="button" onClick={() => setExportOpen(false)}>
                  Close
                </button>
              </div>
              <div className="row wrap" style={{ alignItems: "center" }}>
                <button className="btn" type="button" onClick={handleExportJson} style={{ flex: 0 }}>
                  JSON
                </button>
                <button className="btn" type="button" onClick={handleExportMarkdown} style={{ flex: 0 }}>
                  Markdown
                </button>
                <button className="btn" type="button" onClick={handleExportPdf} style={{ flex: 0 }}>
                  PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {suggestionsModal}

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

      {showMacrosPreference && (
        <div className="card stack">
          <div className="h2">Nutrition (AI estimate)</div>
          <div className="muted small">Per-serving estimates based on ingredient amounts.</div>
          <div className="row" style={{ alignItems: "center" }}>
            <button
              className="btn ai-generate"
              type="button"
              onClick={handleGenerateNutrition}
              disabled={nutritionStatus === "loading"}
            >
              <span className="btn-icon" aria-hidden="true">
                ✨
              </span>
              {nutritionStatus === "loading"
                ? "Calculating…"
                : nutrition
                  ? "Recalculate"
                  : "Generate"}
            </button>
            {nutritionStatus === "error" && <div className="muted small">{nutritionError}</div>}
          </div>
          {nutrition && recipe.servings && (
            <div className="card">
              <div className="muted small">Per serving ({recipe.servings} total)</div>
              <div style={{ fontWeight: 700 }}>
                {formatCalories(nutrition.perServing.calories)}
              </div>
              <div className="row">
                <div>Carbs: {formatMacro(nutrition.perServing.carbs)}</div>
                <div>Protein: {formatMacro(nutrition.perServing.protein)}</div>
                <div>Fat: {formatMacro(nutrition.perServing.fat)}</div>
              </div>
            </div>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{summarizeChange(change)}</div>
                    <div className="muted small">
                      {new Date(change.changed_at).toLocaleString()}
                    </div>
                  </div>
                  {change.action === "update" && canEdit && (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => openVersionCompare(change)}
                      style={{ flex: 0 }}
                    >
                      Compare
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {versionCompareOpen && selectedChange && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-overlay" onClick={() => setVersionCompareOpen(false)}>
              <div className="modal-panel version-compare-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <div className="h2">Version Comparison</div>
                    <div className="muted small">Compare this version with the current recipe</div>
                  </div>
                  <button className="btn ghost" type="button" onClick={() => setVersionCompareOpen(false)}>
                    Close
                  </button>
                </div>

                {rollbackStatus === "error" && rollbackError && (
                  <div className="card" style={{ background: "rgba(255, 59, 48, 0.1)", borderColor: "rgba(255, 59, 48, 0.3)" }}>
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>Rollback failed</div>
                    <div className="muted small">{rollbackError}</div>
                  </div>
                )}

                {rollbackStatus === "loading" && (
                  <div className="card muted">Rolling back recipe...</div>
                )}

                <VersionComparison
                  currentRecipe={recipe}
                  change={selectedChange}
                  onRollback={handleRollback}
                  canRollback={canEdit && rollbackStatus !== "loading"}
                />
              </div>
            </div>,
            document.body
          )
        : null}

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
