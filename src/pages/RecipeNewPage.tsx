import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";
import RecipeForm from "../ui/RecipeForm";
import PhotoUploader from "../ui/PhotoUploader";
import { addPhoto } from "../lib/photoService";
import { createRecipe, updateRecipe } from "../lib/recipeService";

type PendingPhoto = { id: string; file: File; previewUrl: string };

export default function RecipeNewPage() {
  const nav = useNavigate();
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  function addPending(files: FileList) {
    const next: PendingPhoto[] = [];
    for (const f of Array.from(files)) {
      next.push({ id: uuid(), file: f, previewUrl: URL.createObjectURL(f) });
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

  return (
    <div className="stack">
      <PhotoUploader
        title="Photos (optional)"
        subtitle="Pick photos now — they’ll upload after you save."
        onFiles={addPending}
        pendingPhotos={pending}
        onRemovePending={removePending}
        isUploading={uploading}
      />

      <RecipeForm
        submitLabel="Create recipe"
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
            try {
              for (const p of pending) {
                const uploaded = await addPhoto(recipe.id, p.file);
                if (!firstPhotoId) firstPhotoId = uploaded.id;
                URL.revokeObjectURL(p.previewUrl);
              }
              setPending([]);
            } finally {
              setUploading(false);
            }
          }

          if (firstPhotoId) {
            await updateRecipe(recipe.id, { cover_photo_id: firstPhotoId });
          }

          nav("/", { state: { toast: { type: "success", message: "Recipe saved." } } });
        }}
      />
    </div>
  );
}