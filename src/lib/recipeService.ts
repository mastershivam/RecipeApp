import { supabase } from "./supabaseClient";
import type { Recipe } from "./types";

export type SharePermission = "view" | "edit";
export type SharedRecipe = { recipe: Recipe; permission: SharePermission };
type PermissionRank = 0 | 1;

function permissionScore(permission: SharePermission): PermissionRank {
  return permission === "edit" ? 1 : 0;
}

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
    .select("permission, owner_id, recipes(*)")
    .eq("shared_with", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const { data: memberRows, error: memberErr } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("status", "accepted");

  if (memberErr) throw new Error(memberErr.message);
  const groupIds = (memberRows ?? []).map((row: any) => row.group_id);

  let groupData: { recipe: Recipe; permission: SharePermission }[] = [];
  if (groupIds.length > 0) {
    const { data: shares, error: groupErr } = await supabase
      .from("recipe_group_shares")
      .select("permission, recipe_id")
      .in("group_id", groupIds)
      .order("created_at", { ascending: false });

    if (groupErr) throw new Error(groupErr.message);
    const recipeIds = Array.from(new Set((shares ?? []).map((row: any) => row.recipe_id)));
    if (recipeIds.length > 0) {
      const { data: recipes, error: recipeErr } = await supabase
        .from("recipes")
        .select("*")
        .in("id", recipeIds)
        .neq("user_id", user.id);
      if (recipeErr) throw new Error(recipeErr.message);
      const recipeMap = new Map((recipes ?? []).map((r: Recipe) => [r.id, r]));
      groupData = (shares ?? [])
        .map((row: any) => ({
          recipe: recipeMap.get(row.recipe_id),
          permission: row.permission as SharePermission,
        }))
        .filter((row) => !!row.recipe) as { recipe: Recipe; permission: SharePermission }[];
    }
  }

  const merged = new Map<string, SharedRecipe>();
  (data ?? []).forEach((row: any) => {
    if (row.owner_id === user.id) return;
    if (!row.recipes) return;
    merged.set(row.recipes.id, {
      recipe: row.recipes as Recipe,
      permission: row.permission as SharePermission,
    });
  });

  (groupData ?? []).forEach((row) => {
    const existing = merged.get(row.recipe.id);
    const permission = row.permission;
    if (!existing || permissionScore(permission) > permissionScore(existing.permission)) {
      merged.set(row.recipe.id, { recipe: row.recipe, permission });
    }
  });

  const result = Array.from(merged.values()).filter(
    (row) => !!row.recipe && row.recipe.user_id !== user.id
  );
  return result;
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
  const direct = (data?.permission as SharePermission) ?? null;
  if (direct) return direct;

  const { data: memberRows, error: memberErr } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("status", "accepted");

  if (memberErr) throw new Error(memberErr.message);
  const groupIds = (memberRows ?? []).map((row: any) => row.group_id);
  if (groupIds.length === 0) return null;

  const { data: groupShare, error: groupErr } = await supabase
    .from("recipe_group_shares")
    .select("permission")
    .eq("recipe_id", recipeId)
    .in("group_id", groupIds)
    .order("created_at", { ascending: false });

  if (groupErr) throw new Error(groupErr.message);
  return (groupShare ?? []).reduce<SharePermission | null>((acc, row: any) => {
    const permission = row.permission as SharePermission;
    if (!acc) return permission;
    return permissionScore(permission) > permissionScore(acc) ? permission : acc;
  }, null);
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
