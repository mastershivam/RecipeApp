import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";
import RecipeForm from "../ui/RecipeForm";
import PhotoUploader from "../ui/PhotoUploader";
import { addPhoto, invalidatePhotoCache } from "../lib/photoService";
import { createRecipe, updateRecipe, listTagSuggestions } from "../lib/recipeService";
import { useAuth } from "../auth/UseAuth";

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  progress?: number;
  status?: "pending" | "uploading" | "done" | "error";
  error?: string | null;
};

export default function RecipeNewPage() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStage, setImportStage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [jsonImporting, setJsonImporting] = useState(false);
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [jsonImportNotice, setJsonImportNotice] = useState<string | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  function addPending(files: FileList) {
    const next: PendingPhoto[] = [];
    for (const f of Array.from(files)) {
      next.push({
        id: uuid(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        progress: 0,
        status: "pending",
        error: null,
      });
    }
    setPending((prev) => [...prev, ...next]);
  }

  function removePending(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  useEffect(() => {
    return () => pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  }, [pending]);

  useEffect(() => {
    listTagSuggestions()
      .then(setSuggestedTags)
      .catch(() => setSuggestedTags([]));
  }, []);

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

  async function handleImport() {
    const url = importUrl.trim();
    if (!url) {
      setImportError("Paste a recipe URL to import.");
      return;
    }
    if (!session?.access_token) {
      setImportError("You're not signed in.");
      return;
    }

    setImportError(null);
    setImportNotice(null);
    setImporting(true);
    setImportStage("Fetching recipe page…");

    try {
      const res = await fetch("/api/recipe-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Import failed.");
      }

      setImportStage("Saving recipe…");
      const payload = await res.json();
      const recipeId = payload?.recipeId;
      if (!recipeId) throw new Error("Missing recipe id.");

      setImportNotice("Recipe imported.");
      setImportUrl("");
      nav(`/recipes/${recipeId}/edit`, {
        state: { toast: { type: "success", message: "Recipe imported. Review and edit as needed." } },
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
      setImportStage(null);
    }
  }

  async function handleJsonImport(file: File | null) {
    if (!file) return;
    setJsonImportError(null);
    setJsonImportNotice(null);
    setJsonImporting(true);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const source = parsed?.recipe ?? parsed;

      const payload = {
        title: String(source?.title || "").trim(),
        description: source?.description ?? undefined,
        tags: Array.isArray(source?.tags) ? source.tags : [],
        ingredients: Array.isArray(source?.ingredients)
          ? source.ingredients.map((i: unknown) => ({
              text: String(
                (i && typeof i === "object" && "text" in i ? (i as { text?: string }).text : i) || ""
              ).trim(),
            }))
          : [],
        steps: Array.isArray(source?.steps)
          ? source.steps.map((s: unknown) => ({
              text: String(
                (s && typeof s === "object" && "text" in s ? (s as { text?: string }).text : s) || ""
              ).trim(),
            }))
          : [],
        prep_minutes: source?.prepMinutes ?? undefined,
        cook_minutes: source?.cookMinutes ?? undefined,
        servings: source?.servings ?? undefined,
        source_url: source?.sourceUrl ?? undefined,
      };

      if (!payload.title || payload.ingredients.length === 0 || payload.steps.length === 0) {
        throw new Error("Import file is missing title, ingredients, or steps.");
      }

      const recipe = await createRecipe(payload);

      setJsonImportNotice("Recipe imported.");
      nav(`/recipes/${recipe.id}/edit`, {
        state: { toast: { type: "success", message: "Recipe imported. Review and edit as needed." } },
      });
    } catch (err) {
      setJsonImportError(err instanceof Error ? err.message : "JSON import failed.");
    } finally {
      setJsonImporting(false);
    }
  }

  return (
    <div className="stack">
      {uploadError && <div className="toast error">{uploadError}</div>}
      {importError && <div className="toast error">{importError}</div>}
      {importNotice && <div className="toast success">{importNotice}</div>}
      {jsonImportError && <div className="toast error">{jsonImportError}</div>}
      {jsonImportNotice && <div className="toast success">{jsonImportNotice}</div>}
      <div className="card page-hero">
        <div>
          <div className="eyebrow">Create</div>
          <div className="hero-title">New recipe</div>
          <div className="muted">
            Capture the idea while it is fresh. Add steps, ingredients, and a hero photo.
          </div>
        </div>
        <div className="hero-side">
          <div className="hero-side-title">Quick tips</div>
          <ul className="tip-list">
            <li>Lead with the most iconic photo.</li>
            <li>Keep steps short and actionable.</li>
            <li>Tag with cuisine + vibe.</li>
          </ul>
        </div>
      </div>

      <div className="card stack">
        <div className="h2">Import from URL</div>
        <div className="muted small">
          Paste a recipe link. We'll import and save it immediately so you can edit it.
        </div>
        <div className="row wrap">
          <input
            className="input"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://example.com/recipe"
            style={{ flex: "1 1 240px" }}
          />
          <button
            className="btn primary"
            type="button"
            onClick={handleImport}
            disabled={importing}
            style={{ flex: 0 }}
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
        {importing && importStage && <div className="muted small">{importStage}</div>}
      </div>

      <div className="card stack">
        <div className="h2">Import JSON</div>
        <div className="muted small">
          Upload a JSON file exported from Recipe Archive or a compatible format.
        </div>
        <div className="row wrap">
          <input
            className="input"
            type="file"
            accept="application/json"
            onChange={(e) => handleJsonImport(e.target.files?.[0] ?? null)}
            style={{ flex: "1 1 240px" }}
            disabled={jsonImporting}
          />
          <div className="muted small" style={{ flex: "0 1 auto" }}>
            {jsonImporting ? "Importing…" : "Choose a file"}
          </div>
        </div>
      </div>

      <div className="form-grid">
        <div className="stack">
          <PhotoUploader
            title="Photos (optional)"
            subtitle="Pick photos now. They’ll upload after you save."
            onFiles={addPending}
            pendingPhotos={pending}
            onRemovePending={removePending}
            isUploading={uploading}
          />
          <div className="card info-card">
            <div className="h2">Publish flow</div>
            <div className="muted small">
              Your recipe saves first, then photos upload in the background.
            </div>
          </div>
        </div>

        <RecipeForm
          submitLabel="Create recipe"
          suggestedTags={suggestedTags}
          onSubmit={async (draft) => {
            // 1) Create recipe row (Supabase generates id)
            const recipe = await createRecipe({
              title: draft.title,
              description: draft.description,
              tags: draft.tags,
              ingredients: draft.ingredients,
              steps: draft.steps,
              prep_minutes: draft.prepMinutes,
              cook_minutes: draft.cookMinutes,
              servings: draft.servings,
              source_url: draft.sourceUrl,
            });

            // 2) Upload photos + set cover
            let firstPhotoId: string | null = null;

            if (pending.length > 0) {
              setUploading(true);
              setUploadError(null);
              try {
                for (const p of pending) {
                  setPending((prev) =>
                    prev.map((item) =>
                      item.id === p.id
                        ? { ...item, status: "uploading", progress: 0, error: null }
                        : item
                    )
                  );
                  const uploaded = await withRetry(
                    () =>
                      addPhoto(recipe.id, p.file, (progress) => {
                        setPending((prev) =>
                          prev.map((item) =>
                            item.id === p.id ? { ...item, progress } : item
                          )
                        );
                      }),
                    2
                  );
                  if (!firstPhotoId) firstPhotoId = uploaded.id;
                  URL.revokeObjectURL(p.previewUrl);
                  setPending((prev) =>
                    prev.map((item) =>
                      item.id === p.id ? { ...item, status: "done", progress: 100 } : item
                    )
                  );
                }
                setPending([]);
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Photo upload failed. Please try again.";
                setPending((prev) =>
                  prev.map((item) =>
                    item.status === "uploading"
                      ? { ...item, status: "error", error: msg }
                      : item
                  )
                );
                setUploadError(`Recipe saved, but ${msg}`);
                return;
              } finally {
                setUploading(false);
              }
            }

            if (firstPhotoId) {
              await updateRecipe(recipe.id, { cover_photo_id: firstPhotoId });
              invalidatePhotoCache(firstPhotoId);
            }

            nav("/", { state: { toast: { type: "success", message: "Recipe saved." } } });
          }}
        />
      </div>
    </div>
  );
}
