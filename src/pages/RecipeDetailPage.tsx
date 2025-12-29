import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Recipe, RecipePhoto } from "../lib/types";
import { getRecipe, deleteRecipe, updateRecipe } from "../lib/recipeService";
import { addPhoto, deletePhoto, listPhotos } from "../lib/photoService";
import PhotoUploader from "../ui/PhotoUploader";

export default function RecipeDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);

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

  const coverUrl = useMemo(() => {
    if (!recipe?.cover_photo_id) return undefined;
    return photos.find((p) => p.id === recipe.cover_photo_id)?.signed_url;
  }, [recipe?.cover_photo_id, photos]);

  const meta = useMemo(() => {
    if (!recipe) return "";
    const parts: string[] = [];
    if (recipe.prep_minutes) parts.push(`Prep ${recipe.prep_minutes}m`);
    if (recipe.cook_minutes) parts.push(`Cook ${recipe.cook_minutes}m`);
    if (recipe.servings) parts.push(`${recipe.servings} servings`);
    return parts.join(" · ");
  }, [recipe]);

  if (!id) return <div className="card">Missing id</div>;
  if (!recipe) return <div className="card">Loading…</div>;

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row" style={{ alignItems: "baseline" }}>
          <div>
            <div className="h1">{recipe.title}</div>
            {meta && <div className="muted small">{meta}</div>}
          </div>
          <div style={{ flex: 0 }} className="row">
            <Link to={`/recipes/${id}/edit`} className="btn">Edit</Link>
            <button
              className="btn"
              onClick={async () => {
                if (!confirm("Delete this recipe?")) return;
                await deleteRecipe(id);
                nav("/");
              }}
            >
              Delete
            </button>
          </div>
        </div>

        <img
          className="thumb"
          style={{ aspectRatio: "16/9" }}
          src={coverUrl || "/pwa-512.png"}
          alt=""
        />

        {recipe.description && <div>{recipe.description}</div>}

        {recipe.tags.length > 0 && (
          <div className="badges">
            {recipe.tags.map((t) => (
              <div key={t} className="badge">{t}</div>
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
      </div>

      <PhotoUploader
        onFiles={async (files) => {
          for (const f of Array.from(files)) await addPhoto(id, f);
          await refresh();
        }}
      />

      {photos.length > 0 && (
        <div className="card stack">
          <div className="h2">Gallery</div>
          <div className="muted small">Set a cover photo for the list view</div>
          <div className="hr" />

          <div className="gallery">
            {photos.map((p) => (
              <div key={p.id} className="card" style={{ padding: 10 }}>
                <img className="thumb" src={p.signed_url || "/pwa-512.png"} alt="" />
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

      <div className="card">
        <div className="h2">Ingredients</div>
        <div className="hr" />
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {recipe.ingredients.map((i, idx) => (
            <li key={idx} style={{ marginBottom: 6 }}>{i.text}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="h2">Steps</div>
        <div className="hr" />
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          {recipe.steps.map((s, idx) => (
            <li key={idx} style={{ marginBottom: 10 }}>{s.text}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}