import { useMemo, useState } from "react";
import { type RecipeLine } from "../lib/types";

type RecipeFormData = {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  ingredients: RecipeLine[];
  steps: RecipeLine[];
  prepMinutes?: number;
  cookMinutes?: number;
  servings?: number;
  sourceUrl?: string;
  coverPhotoId?: string;
  createdAt?: number;
  updatedAt?: number;
};

function normaliseTags(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.toLowerCase());
}

function linesFromText(s: string): RecipeLine[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

function textFromLines(lines: RecipeLine[]): string {
  return lines.map((l) => l.text).join("\n");
}

export default function RecipeForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: RecipeFormData;
  onSubmit: (recipe: Omit<RecipeFormData, "createdAt" | "updatedAt">) => Promise<void>;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "));
  const [ingredientsText, setIngredientsText] = useState(
    textFromLines(initial?.ingredients ?? [])
  );
  const [stepsText, setStepsText] = useState(textFromLines(initial?.steps ?? []));
  const [prepMinutes, setPrepMinutes] = useState<number | "">(initial?.prepMinutes ?? "");
  const [cookMinutes, setCookMinutes] = useState<number | "">(initial?.cookMinutes ?? "");
  const [servings, setServings] = useState<number | "">(initial?.servings ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const tags = useMemo(() => normaliseTags(tagsText), [tagsText]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError("");

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Title is required.");
      return;
    }

    const ingredients = linesFromText(ingredientsText);
    const steps = linesFromText(stepsText);
    if (ingredients.length === 0) {
      setError("Add at least one ingredient.");
      return;
    }
    if (steps.length === 0) {
      setError("Add at least one step.");
      return;
    }

    try {
      setSaving(true);
      await onSubmit({
        ...(initial ? { id: initial.id, coverPhotoId: initial.coverPhotoId } : { id: "" }),
        title: cleanTitle,
        description: description.trim() || undefined,
        tags,
        ingredients,
        steps,
        prepMinutes: prepMinutes === "" ? undefined : Number(prepMinutes),
        cookMinutes: cookMinutes === "" ? undefined : Number(cookMinutes),
        servings: servings === "" ? undefined : Number(servings),
        sourceUrl: sourceUrl.trim() || undefined,
      });
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div className="card stack">
        <div className="h1">{submitLabel}</div>
        {error && <div style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div>}

        <div className="stack">
          <div>
            <div className="muted small">Title</div>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <div className="muted small">Description (optional)</div>
            <textarea
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <div className="muted small">Tags (comma-separated)</div>
            <input
              className="input"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g. italian, vegetarian, quick"
            />
            {tags.length > 0 && (
              <div className="muted small" style={{ marginTop: 6 }}>
                Saved as: {tags.join(", ")}
              </div>
            )}
          </div>

          <div className="row">
            <div>
              <div className="muted small">Prep minutes</div>
              <input
                className="input"
                inputMode="numeric"
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div>
              <div className="muted small">Cook minutes</div>
              <input
                className="input"
                inputMode="numeric"
                value={cookMinutes}
                onChange={(e) => setCookMinutes(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div>
              <div className="muted small">Servings</div>
              <input
                className="input"
                inputMode="numeric"
                value={servings}
                onChange={(e) => setServings(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <div className="muted small">Source URL (optional)</div>
            <input
              className="input"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="h2">Ingredients</div>
        <div className="muted small">One per line</div>
        <textarea
          className="textarea"
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
          placeholder={"e.g.\n200g mushrooms\n2 cloves garlic\n1 tbsp olive oil"}
        />
      </div>

      <div className="card stack">
        <div className="h2">Steps</div>
        <div className="muted small">One per line</div>
        <textarea
          className="textarea"
          value={stepsText}
          onChange={(e) => setStepsText(e.target.value)}
          placeholder={"e.g.\nHeat pan\nAdd oil\nCook mushrooms\nServe"}
        />
      </div>

      <button className="btn primary" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}