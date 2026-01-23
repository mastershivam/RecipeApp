import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RecipeForm from "../ui/RecipeForm";
import PhotoUploader from "../ui/PhotoUploader";
import type { Recipe, RecipePhoto } from "../lib/types";
import { getRecipe, updateRecipe, getSharePermission, listTagSuggestions, type SharePermission } from "../lib/recipeService";
import { addPhoto, deletePhoto, listPhotosPage, invalidatePhotoCache } from "../lib/photoService";
import { useAuth } from "../auth/UseAuth.ts";

export default function RecipeEditPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);
  const [photoPage, setPhotoPage] = useState(0);
  const [photoHasMore, setPhotoHasMore] = useState(false);
  const photoPageSize = 8;
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<
    {
      id: string;
      file: File;
      previewUrl: string;
      progress?: number;
      status?: "uploading" | "done" | "error";
      error?: string | null;
    }[]
  >([]);
  const [sharePermission, setSharePermission] = useState<SharePermission | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  async function refresh() {
    if (!id) return;
    const r = await getRecipe(id);
    setRecipe(r);
    const p = await listPhotosPage(id, { page: 0, pageSize: photoPageSize });
    setPhotos(p.data);
    setPhotoHasMore(p.hasMore);
    setPhotoPage(0);
  }

  async function loadMorePhotos() {
    if (!id || !photoHasMore) return;
    const nextPage = photoPage + 1;
    const p = await listPhotosPage(id, { page: nextPage, pageSize: photoPageSize });
    setPhotos((prev) => [...prev, ...p.data]);
    setPhotoHasMore(p.hasMore);
    setPhotoPage(nextPage);
  }

  async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 600): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        if (attempt >= retries) throw err;
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        attempt += 1;
      }
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    listTagSuggestions()
      .then(setSuggestedTags)
      .catch(() => setSuggestedTags([]));
  }, []);

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

  if (!id) return <div className="card">Missing id</div>;
  if (!recipe) return <div className="card">Loading…</div>;

  const isOwner = user?.id === recipe.user_id;
  const canEdit = isOwner || sharePermission === "edit";

  if (!canEdit) {
    return (
      <div className="card stack">
        <div className="h2">View-only access</div>
        <div className="muted small">
          You can view this recipe but don't have permission to edit it.
        </div>
        <button className="btn" type="button" onClick={() => nav(`/recipes/${id}`)}>
          Back to recipe
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      {uploadError && <div className="toast error">{uploadError}</div>}
      <div className="card page-hero">
        <div>
          <div className="eyebrow">Edit</div>
          <div className="hero-title">Refine the recipe</div>
          <div className="muted">
            Tweak the details, update the hero image, and keep everything in sync.
          </div>
        </div>
        <div className="hero-side">
          <div className="hero-side-title">Current recipe</div>
          <ul className="tip-list">
            <li>{recipe.title}</li>
            <li>{recipe.tags.join(" · ") || "No tags yet"}</li>
            <li>{photos.length} photo{photos.length === 1 ? "" : "s"}</li>
          </ul>
        </div>
      </div>

      <div className="form-grid">
        <div className="stack">
          {/* Photos while editing */}
          <PhotoUploader
            title="Photos"
            subtitle="Upload photos while editing. Saved automatically."
            isUploading={uploading}
            pendingPhotos={uploadQueue}
            onFiles={async (files) => {
              const incoming = Array.from(files).map((file) => ({
                id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
                file,
                previewUrl: URL.createObjectURL(file),
                progress: 0,
                status: "uploading" as const,
                error: null,
              }));
              setUploadQueue((prev) => [...prev, ...incoming]);
              setUploading(true);
              setUploadError(null);
              try {
                for (const item of incoming) {
                  await withRetry(
                    () =>
                      addPhoto(id, item.file, (progress) => {
                        setUploadQueue((prev) =>
                          prev.map((q) => (q.id === item.id ? { ...q, progress } : q))
                        );
                      }),
                    2
                  );
                  URL.revokeObjectURL(item.previewUrl);
                  setUploadQueue((prev) => prev.filter((q) => q.id !== item.id));
                }
                await refresh();
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Photo upload failed. Please try again.";
                setUploadError(msg);
                setUploadQueue((prev) =>
                  prev.map((q) =>
                    q.status === "uploading" ? { ...q, status: "error", error: msg } : q
                  )
                );
              } finally {
                setUploading(false);
              }
            }}
          />

          {photos.length > 0 && (
            <div className="card stack">
              <div className="h2">Gallery</div>
              <div className="muted small">Set a cover photo for the list view</div>
              <div className="hr" />

              <div className="gallery">
                {photos.map((p, idx) => (
                  <div key={p.id} className="card gallery-item">
                    <div className="gallery-media">
                      <img
                        className="thumb zoomable"
                        src={p.signed_url || coverUrl || ""}
                        alt=""
                        onClick={() => (p.signed_url || coverUrl) && setLightboxIndex(idx)}
                      />
                    </div>
                    <div className="row" style={{ marginTop: 8 }}>
                      <button
                        className={`btn ${recipe.cover_photo_id === p.id ? "primary" : ""}`}
                      onClick={async () => {
                          const prevCover = recipe.cover_photo_id;
                          await updateRecipe(id, { cover_photo_id: p.id });
                          if (prevCover) invalidatePhotoCache(prevCover);
                          invalidatePhotoCache(p.id);
                          await refresh();
                        }}
                      >
                        {recipe.cover_photo_id === p.id ? "Cover" : "Set cover"}
                      </button>

                      <button
                        className="btn danger"
                    onClick={async () => {
                      if (!confirm("Delete this photo?")) return;
                      const deletingCover = recipe.cover_photo_id === p.id;
                      await deletePhoto(p);
                      invalidatePhotoCache(p.id);
                      if (deletingCover) await updateRecipe(id, { cover_photo_id: null });
                      await refresh();
                    }}
                      >
                        Delete
                      </button>
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
        </div>

        {/* Your existing form (save disables button + shows inline errors) */}
          <RecipeForm
            submitLabel="Keep"
            suggestedTags={suggestedTags}
            initial={{
            id: recipe.id,
            title: recipe.title,
            description: recipe.description ?? undefined,
            tags: recipe.tags,
            ingredients: recipe.ingredients,
            steps: recipe.steps,
            prepMinutes: recipe.prep_minutes ?? undefined,
            cookMinutes: recipe.cook_minutes ?? undefined,
            servings: recipe.servings ?? undefined,
            sourceUrl: recipe.source_url ?? undefined,
            coverPhotoId: recipe.cover_photo_id ?? undefined,
            createdAt: 0,
            updatedAt: 0,
          }}
          onSubmit={async (draft) => {
            await updateRecipe(id, {
              title: draft.title,
              description: draft.description ?? null,
              tags: draft.tags,
              ingredients: draft.ingredients,
              steps: draft.steps,
              prep_minutes: draft.prepMinutes ?? null,
              cook_minutes: draft.cookMinutes ?? null,
              servings: draft.servings ?? null,
              source_url: draft.sourceUrl ?? null,
            });

            nav("/", { state: { toast: { type: "success", message: "Kept" } } });
          }}
        />
      </div>
      {lightboxIndex !== null && (photos[lightboxIndex]?.signed_url || coverUrl) && (
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

            <img
              className="lightbox-img"
              src={(photos[lightboxIndex]?.signed_url || coverUrl) as string}
              alt=""
            />
          </div>
        </div>
      )}
    </div>
  );
}
