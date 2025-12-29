import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RecipeForm from "../ui/RecipeForm";
import { getRecipe, updateRecipe } from "../lib/recipeService";
import type { Recipe } from "../lib/types";

export default function RecipeEditPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const r = await getRecipe(id);
      setRecipe(r);
    }
    load();
  }, [id]);

  if (!id) return <div className="card">Missing id</div>;
  if (!recipe) return <div className="card">Loading…</div>;

  return (
    <RecipeForm
      initial={{
        // adapt your form fields
        id: recipe.id as any,
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
      } as any}
      submitLabel="Edit recipe"
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
        nav(`/recipes/${id}`);
      }}
    />
  );
}