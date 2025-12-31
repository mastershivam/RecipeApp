import { supabase } from "./supabaseClient";
import type { Recipe } from "./types";

export type SharePermission = "view" | "edit";
export type SharedRecipe = { recipe: Recipe; permission: SharePermission };

export async function listRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Recipe[];
}

export async function listSharedRecipes(): Promise<SharedRecipe[]> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const user = userData.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("recipe_shares")
    .select("permission, recipes(*)")
    .eq("shared_with", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row: any) => ({ recipe: row.recipes as Recipe, permission: row.permission as SharePermission }))
    .filter((row: SharedRecipe) => !!row.recipe);
}

export async function getSharePermission(recipeId: string): Promise<SharePermission | null> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const user = userData.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("recipe_shares")
    .select("permission")
    .eq("recipe_id", recipeId)
    .eq("shared_with", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.permission as SharePermission) ?? null;
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Recipe | null;
}

export async function createRecipe(input: {
  title: string;
  description?: string;
  tags: string[];
  ingredients: { text: string }[];
  steps: { text: string }[];
  prep_minutes?: number;
  cook_minutes?: number;
  servings?: number;
  source_url?: string;
}): Promise<Recipe> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const user = userData.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      title: input.title,
      description: input.description ?? null,
      tags: input.tags ?? [],
      ingredients: input.ingredients ?? [],
      steps: input.steps ?? [],
      prep_minutes: input.prep_minutes ?? null,
      cook_minutes: input.cook_minutes ?? null,
      servings: input.servings ?? null,
      source_url: input.source_url ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Recipe;
}

export async function updateRecipe(id: string, patch: Partial<Omit<Recipe, "id" | "user_id" | "created_at">>) {
  const { data, error } = await supabase
    .from("recipes")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Recipe;
}

export async function deleteRecipe(id: string) {
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
