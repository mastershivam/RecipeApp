import { useEffect, useMemo, useState } from "react";
import type { Recipe } from "../lib/types";
import { listRecipes } from "../lib/recipeService";
import { listPhotos } from "../lib/photoService";
import TagFilter from "../ui/TagFilter";
import RecipeCard from "../ui/RecipeCard";

type CoverMap = Record<string, string | undefined>;

export default function RecipeListPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [coverUrls, setCoverUrls] = useState<CoverMap>({});

  async function refresh() {
    const r = await listRecipes();
    setRecipes(r);
  }

  useEffect(() => {
    refresh();
  }, []);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const r of recipes) for (const t of r.tags) s.add(t);
    return Array.from(s).sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      const matchesText =
        !q ||
        r.title.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        r.tags.some((t) => t.includes(q));

      const matchesTags = activeTags.size === 0 || r.tags.some((t) => activeTags.has(t));
      return matchesText && matchesTags;
    });
  }, [recipes, query, activeTags]);

  useEffect(() => {
    let cancelled = false;

    async function buildCovers() {
      const next: CoverMap = {};
      for (const r of filtered) {
        if (r.cover_photo_id) {
          const photos = await listPhotos(r.id);
          const cover = photos.find((p) => p.id === r.cover_photo_id);
          next[r.id] = cover?.signed_url;
        }
      }
      if (!cancelled) setCoverUrls(next);
    }

    buildCovers();
    return () => {
      cancelled = true;
    };
  }, [filtered]);

  function toggleTag(t: string) {
    setActiveTags((prev) => {
      const n = new Set(prev);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="h1">Your recipes</div>
        <div className="muted small" style={{ marginTop: 6 }}>
          Cloud synced — sign in anywhere.
        </div>
        <div style={{ marginTop: 12 }}>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
          />
        </div>
      </div>

      <TagFilter
        tags={allTags}
        active={activeTags}
        onToggle={toggleTag}
        onClear={() => setActiveTags(new Set())}
      />

      {filtered.length === 0 ? (
        <div className="card muted">No recipes yet. Hit “New recipe”.</div>
      ) : (
        <div className="grid">
          {filtered.map((r) => (
            <RecipeCard key={r.id} recipe={r as any} coverUrl={coverUrls[r.id]} />
          ))}
        </div>
      )}
    </div>
  );
}