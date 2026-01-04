import { useEffect, useMemo, useRef, useState } from "react";
import type { Recipe } from "../lib/types";
import { listRecipes } from "../lib/recipeService";
import { getCoverUrlByPhotoId } from "../lib/photoService";
import TagFilter from "../ui/TagFilter";
import RecipeCard from "../ui/RecipeCard";
import { useLocation, useNavigate } from "react-router-dom";

type CoverMap = Record<string, string | undefined>;

export default function RecipeListPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [coverUrls, setCoverUrls] = useState<CoverMap>({});
  const coverIdsRef = useRef<Record<string, string | null>>({});

  const loc = useLocation();
  const nav = useNavigate();
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const activeTagsArray = useMemo(() => Array.from(activeTags).sort(), [activeTags]);

  async function refresh(nextQuery: string, tags: string[]) {
    const r = await listRecipes({ search: nextQuery, tags });
    setRecipes(r);
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      refresh(query, activeTagsArray).catch(() => {
        if (!cancelled) setRecipes([]);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, activeTagsArray]);

  useEffect(() => {
    const nextIds: Record<string, string | null> = {};
    let changed = false;
    for (const r of recipes) {
      nextIds[r.id] = r.cover_photo_id ?? null;
      if (coverIdsRef.current[r.id] !== undefined && coverIdsRef.current[r.id] !== nextIds[r.id]) {
        changed = true;
      }
    }
    if (changed) {
      setCoverUrls((prev) => {
        const next = { ...prev };
        for (const r of recipes) {
          if (coverIdsRef.current[r.id] !== undefined && coverIdsRef.current[r.id] !== nextIds[r.id]) {
            delete next[r.id];
          }
        }
        return next;
      });
    }
    coverIdsRef.current = nextIds;
  }, [recipes]);

  useEffect(() => {
    const t = (loc.state as any)?.toast;
    if (t?.message) {
      setToast(t);
      nav(loc.pathname, { replace: true, state: {} });
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [loc.state, loc.pathname, nav]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const r of recipes) for (const t of r.tags) s.add(t);
    return Array.from(s).sort();
  }, [recipes]);

  const stats = useMemo(() => {
    const withPhotos = recipes.filter((r) => r.cover_photo_id).length;
    return [
      { label: "Recipes", value: recipes.length.toString().padStart(2, "0") },
      { label: "Tags", value: allTags.length.toString().padStart(2, "0") },
      { label: "With photos", value: withPhotos.toString().padStart(2, "0") },
    ];
  }, [recipes, allTags.length]);


  useEffect(() => {
    let cancelled = false;

    async function buildCovers() {
      const missing = recipes.filter((r) => r.cover_photo_id && !coverUrls[r.id]);
      if (missing.length === 0) return;

      const next: CoverMap = {};
      for (const r of missing) {
        const url = await getCoverUrlByPhotoId(r.cover_photo_id!);
        if (url) next[r.id] = url;
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setCoverUrls((prev) => ({ ...prev, ...next }));
      }
    }

    buildCovers();
    return () => {
      cancelled = true;
    };
  }, [recipes, coverUrls]);

  function toggleTag(t: string) {
    setActiveTags((prev) => {
      const n = new Set(prev);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });
  }

  return (
    <div className="stack">
      <div className="card hero">
        <div className="hero-content">
          <div className="eyebrow">Taste lab</div>
          <div className="hero-title">Your recipe vault</div>
          <div className="muted">
            Search, remix, and save your best ideas in one cookbook.
          </div>

          <div className="hero-search">
            <input
              className="input search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes or tags..."
            />
          </div>
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

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === "success" ? "✅ " : "⚠️ "}
          {toast.message}
        </div>
      )}

      <TagFilter
        tags={allTags}
        active={activeTags}
        onToggle={toggleTag}
        onClear={() => setActiveTags(new Set())}
      />

      {recipes.length === 0 ? (
        <div className="card muted">No recipes yet. Hit “New recipe”.</div>
      ) : (
        <div className="grid">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r as any} coverUrl={coverUrls[r.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
