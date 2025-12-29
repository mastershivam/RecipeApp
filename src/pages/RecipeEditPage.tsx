import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RecipeForm from "../ui/RecipeForm";
import PhotoUploader from "../ui/PhotoUploader";
import type { Recipe, RecipePhoto } from "../lib/types";
import { getRecipe, updateRecipe } from "../lib/recipeService";
import { addPhoto, deletePhoto, listPhotos } from "../lib/photoService";

export default function RecipeEditPage() {
  const { id } = useParams();
  const nav = useNavigate();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  return (
    <div className="stack">
      {/* Photos while editing */}
      <PhotoUploader
        title="Photos"
        subtitle="Upload photos while editing. Saved automatically."
        isUploading={uploading}
        onFiles={async (files) => {
          setUploading(true);
          try {
            for (const f of Array.from(files)) await addPhoto(id, f);
            await refresh();
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
              <div key={p.id} className="card" style={{ padding: 10 }}>
                <img
                  className="thumb zoomable"
                  src={p.signed_url || coverUrl || ""}
                  alt=""
                  onClick={() => (p.signed_url || coverUrl) && setLightboxIndex(idx)}
                />
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className={`btn ${recipe.cover_photo_id === p.id ? "primary" : ""}`}
                    onClick={async () => {
                      await updateRecipe(id, { cover_photo_id: p.id });
                      await refresh();
                    }}
                  >
                    {recipe.cover_photo_id === p.id ? "Cover" : "Set cover"}
                  </button>

                  <button
                    className="btn"
                    onClick={async () => {
                      if (!confirm("Delete this photo?")) return;
                      const deletingCover = recipe.cover_photo_id === p.id;
                      await deletePhoto(p);
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
        </div>
      )}

      {/* Your existing form (save disables button + shows inline errors) */}
      <RecipeForm
        submitLabel="Edit recipe"
        initial={{
          // Adapt Supabase recipe -> RecipeForm's shape
          id: recipe.id as any,
          title: recipe.title,
          description: recipe.description ?? undefined,
          tags: recipe.tags,
          ingredients: recipe.ingredients as any,
          steps: recipe.steps as any,
          prepMinutes: recipe.prep_minutes ?? undefined,
          cookMinutes: recipe.cook_minutes ?? undefined,
          servings: recipe.servings ?? undefined,
          sourceUrl: recipe.source_url ?? undefined,
          coverPhotoId: recipe.cover_photo_id ?? undefined,
          createdAt: 0,
          updatedAt: 0,
        } as any}
        onSubmit={async (draft) => {
          await updateRecipe(id, {
            title: draft.title,
            description: draft.description ?? null,
            tags: draft.tags,
            ingredients: draft.ingredients as any,
            steps: draft.steps as any,
            prep_minutes: draft.prepMinutes ?? null,
            cook_minutes: draft.cookMinutes ?? null,
            servings: draft.servings ?? null,
            source_url: draft.sourceUrl ?? null,
          });

          nav("/", { state: { toast: { type: "success", message: "Recipe updated." } } });
        }}
      />
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