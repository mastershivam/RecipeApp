export type RecipeLine = { text: string };

export type Recipe = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  tags: string[];
  ingredients: RecipeLine[];
  steps: RecipeLine[];
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  servings?: number | null;
  source_url?: string | null;
  cover_photo_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipePhoto = {
  id: string;
  user_id: string;
  recipe_id: string;
  storage_path: string;
  created_at: string;
  signed_url?: string; // computed client-side
};