import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getRecipe, updateRecipe } from "../lib/recipeService";
import type { Recipe } from "../lib/types";
import { useAuth } from "../auth/UseAuth";
import { scaleIngredient, type UnitMode } from "../lib/ingredientScaling";

export default function CookModePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [wakeActive, setWakeActive] = useState(false);
  const [wakeError, setWakeError] = useState<string | null>(null);
  const [unitMode, setUnitMode] = useState<UnitMode>(() => {
    const stored = localStorage.getItem("unitPreference");
    if (stored === "imperial" || stored === "metric") return stored;
    return "auto";
  });

  useEffect(() => {
    if (!id) return;
    const recipeId = id;
    let cancelled = false;
    async function load() {
      const r = await getRecipe(recipeId);
      if (!cancelled) setRecipe(r);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === "unitPreference") {
        if (event.newValue === "imperial" || event.newValue === "metric") {
          setUnitMode(event.newValue);
        }
      }
    }
    function onUnitPreference(event: Event) {
      const unit = (event as CustomEvent<{ unit?: "metric" | "imperial" }>).detail?.unit;
      if (unit === "metric" || unit === "imperial") setUnitMode(unit);
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("unit-preference-change", onUnitPreference);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("unit-preference-change", onUnitPreference);
    };
  }, []);

  const lastCookedUpdatedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!recipe || !user || recipe.user_id !== user.id) return;
    if (lastCookedUpdatedFor.current === recipe.id) return;
    lastCookedUpdatedFor.current = recipe.id;
    const now = new Date().toISOString();
    updateRecipe(recipe.id, { last_cooked_at: now })
      .then(() => setRecipe((prev) => (prev ? { ...prev, last_cooked_at: now } : prev)))
      .catch(() => {});
  }, [recipe, user]);

  useEffect(() => {
    if (!("wakeLock" in navigator) || !navigator.wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function requestLock() {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (!cancelled) setWakeActive(true);
        sentinel.addEventListener?.("release", () => {
          if (!cancelled) setWakeActive(false);
        });
      } catch (err) {
        if (!cancelled) {
          setWakeActive(false);
          setWakeError(err instanceof Error ? err.message : "Wake lock failed.");
        }
      }
    }

    requestLock();
    const onVis = () => {
      if (document.visibilityState === "visible") requestLock();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      if (sentinel && !sentinel.released) sentinel.release();
    };
  }, []);

  const stepCount = recipe?.steps?.length ?? 0;
  const step = useMemo(() => recipe?.steps?.[stepIndex]?.text ?? "", [recipe, stepIndex]);
  const ingredients = useMemo(() => {
    const items = (recipe?.ingredients ?? []).map((i) => i.text).filter(Boolean);
    return items.map((item) => scaleIngredient(item, 1, unitMode));
  }, [recipe, unitMode]);

  if (!id) return <div className="card">Missing id</div>;
  if (!recipe) return <div className="card">Loading…</div>;
  const recipeId = id;
  if (stepCount === 0) {
    return (
      <div className="card stack cook-empty">
        <div className="h2">No steps yet</div>
        <div className="muted">Add steps to enable Cook Mode.</div>
        <div className="row" style={{ flex: 0 }}>
          <button className="btn" onClick={() => nav(`/recipes/${recipeId}/edit`)}>
            Edit recipe
          </button>
          <Link className="btn ghost" to={`/recipes/${recipeId}`}>
            Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack cook-mode">
      <div className="card cook-hero">
        <div>
          <div className="eyebrow">Cook mode</div>
          <div className="hero-title">{recipe.title}</div>
          <div className="muted small">
            Step {stepIndex + 1} of {stepCount}
          </div>
        </div>
        <div className="row" style={{ flex: 0 }}>
          <Link className="btn ghost" to={`/recipes/${id}`}>
            Exit
          </Link>
        </div>
      </div>

      <div className="cook-grid">
        <div className="card cook-step">
          <div className="cook-step-text">{step}</div>
          <div className="row cook-controls">
            <button
              className="btn"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
            >
              Previous
            </button>
            <button
              className="btn primary"
              onClick={() => setStepIndex((i) => Math.min(stepCount - 1, i + 1))}
              disabled={stepIndex === stepCount - 1}
            >
              Next
            </button>
          </div>
        </div>

        <div className="card cook-ingredients">
          <div className="h2">Ingredients</div>
          <div className="hr" />
          {ingredients.length === 0 ? (
            <div className="muted small">No ingredients listed.</div>
          ) : (
            <ul className="detail-list">
              {ingredients.map((item, idx) => (
                <li key={`${item}-${idx}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card cook-status">
        <div className="row">
          <div className="muted small">
            {wakeActive ? "Screen stays awake while Cook Mode is open." : "Screen wake lock not active."}
          </div>
          {wakeError && <div className="muted small">{wakeError}</div>}
        </div>
      </div>
    </div>
  );
}
