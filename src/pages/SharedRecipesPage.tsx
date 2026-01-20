import { useEffect, useMemo, useState } from "react";
import { listSharedRecipes, type SharedRecipe } from "../lib/recipeService";
import { getCoverUrlByPhotoId } from "../lib/photoService";
import RecipeCard from "../ui/RecipeCard";

type CoverMap = Record<string, string | undefined>;

export default function SharedRecipesPage() {
  const [shared, setShared] = useState<SharedRecipe[]>([]);
  const [coverUrls, setCoverUrls] = useState<CoverMap>({});

  useEffect(() => {
    async function refresh() {
      const rows = await listSharedRecipes();
      setShared(rows);
    }
    refresh();
  }, []);

  const stats = useMemo(() => {
    const recipes = shared.length;
    const photos = shared.filter((s) => s.recipe.cover_photo_id).length;
    return [
      { label: "Shared recipes", value: recipes.toString().padStart(2, "0") },
      { label: "With photos", value: photos.toString().padStart(2, "0") },
    ];
  }, [shared]);

  useEffect(() => {
    let cancelled = false;

    async function buildCovers() {
      const missing = shared.filter((s) => s.recipe.cover_photo_id && !coverUrls[s.recipe.id]);
      if (missing.length === 0) return;

      const next: CoverMap = {};
      for (const s of missing) {
        const url = await getCoverUrlByPhotoId(s.recipe.cover_photo_id!);
        if (url) next[s.recipe.id] = url;
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setCoverUrls((prev) => ({ ...prev, ...next }));
      }
    }

    buildCovers();
    return () => {
      cancelled = true;
    };
  }, [shared, coverUrls]);

  return (
    <div className="stack">
      <div className="card hero">
        <div className="hero-content">
          <div className="eyebrow">Shared with you</div>
          <div className="hero-title">Community cookbook</div>
          <div className="muted">Recipes friends and teammates have shared with you.</div>
        </div>

        <div className="stat-grid">
          {stats.map((stat) => (
            <div key={stat.label} className="card stat-card">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {shared.length === 0 ? (
        <div className="card muted">No shared recipes yet.</div>
      ) : (
        <div className="grid">
          {shared.map((s) => (
            <RecipeCard key={s.recipe.id} recipe={s.recipe} coverUrl={coverUrls[s.recipe.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
