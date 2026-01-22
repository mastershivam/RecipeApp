import { supabase } from "./supabaseClient";
import type { Recipe, RecipeChange, RecipeLine } from "./types";

export type SharePermission = "view" | "edit";
export type SharedRecipe = { recipe: Recipe; permission: SharePermission };
export type RecipeSuggestions = {
  improvements: { title: string; rational?: string; change?: string }[];
  alternatives: { title: string; rational?: string; change?: string }[];
};
type PermissionRank = 0 | 1;

function permissionScore(permission: SharePermission): PermissionRank {
  return permission === "edit" ? 1 : 0;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export async function listRecipes(options?: {
  search?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
}): Promise<{ data: Recipe[]; hasMore: boolean }> {
  const search = options?.search?.trim();
  const tags = options?.tags ?? [];
  const page = options?.page ?? 0;
  const pageSize = options?.pageSize ?? 0;
  let query = supabase.from("recipes").select("*");

  if (search) {
    query = query.textSearch("search_vector", search, {
      type: "websearch",
      config: "english",
    });
  }

  if (tags.length > 0) {
    query = query.contains("tags", tags);
  }

  if (pageSize > 0) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Recipe[];
  const hasMore = pageSize > 0 ? rows.length === pageSize : false;
  return { data: rows, hasMore };
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
  const groupIds = (memberRows ?? []).map((row: { group_id: string } | null) => row?.group_id ?? "");

  let groupData: { recipe: Recipe; permission: SharePermission }[] = [];
  if (groupIds.length > 0) {
    const { data: shares, error: groupErr } = await supabase
      .from("recipe_group_shares")
      .select("permission, recipe_id")
      .in("group_id", groupIds)
      .order("created_at", { ascending: false });

    if (groupErr) throw new Error(groupErr.message);
    const recipeIds = Array.from(new Set((shares ?? []).map((row: unknown) => (row as { recipe_id: string }).recipe_id)));
    if (recipeIds.length > 0) {
      const { data: recipes, error: recipeErr } = await supabase
        .from("recipes")
        .select("*")
        .in("id", recipeIds)
        .neq("user_id", user.id);
      if (recipeErr) throw new Error(recipeErr.message);
      const recipeMap = new Map((recipes ?? []).map((r: Recipe) => [r.id, r]));
      groupData = (shares ?? [])
        .map((row) => ({
          recipe: recipeMap.get(row.recipe_id),
          permission: row.permission as SharePermission,
        }))
        .filter((row) => !!row.recipe) as { recipe: Recipe; permission: SharePermission }[];
    }
  }
  

  
  const merged = new Map<string, SharedRecipe>();

  type Row = NonNullable<typeof data>[number];
  
  (data ?? []).forEach((row: Row) => {
    if (row.owner_id === user.id) return;
  
    const recipes = row.recipes;
    if (!recipes) return;
  
    // If `recipes` is an array (common for relations), handle that:
    if (Array.isArray(recipes)) {
      for (const recipe of recipes) {
        merged.set(recipe.id, {
          recipe,
          permission: row.permission,
        });
      }
      return;
    }
  
    // If `recipes` is a single object:
    merged.set((recipes as Recipe).id, {
      recipe: recipes as Recipe,
      permission: row.permission,
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
  type MemberRow = NonNullable<typeof memberRows>[number];

  const groupIds = (memberRows ?? []).map((row: MemberRow) => row.group_id);
  if (groupIds.length === 0) return null;

  const { data: groupShare, error: groupErr } = await supabase
    .from("recipe_group_shares")
    .select("permission")
    .eq("recipe_id", recipeId)
    .in("group_id", groupIds)
    .order("created_at", { ascending: false });

  if (groupErr) throw new Error(groupErr.message);
  return (groupShare ?? []).reduce<SharePermission | null>((acc, row) => {
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

export async function listTagSuggestions(): Promise<string[]> {
  const { data, error } = await supabase.from("recipes").select("tags");
  if (error) throw new Error(error.message);
  const tags = new Set<string>();
  (data ?? []).forEach((row) => {
    (row.tags ?? []).forEach((t: string) => tags.add(t));
  });
  return Array.from(tags).sort();
}

export async function getRecipeSuggestions(recipeId: string): Promise<RecipeSuggestions> {
  const token = await getAccessToken();
  const res = await fetch("/api/recipe-suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipeId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as RecipeSuggestions;
}

export async function generateRecipeDescription(input: {
  title: string;
  tags?: string[];
  ingredients?: RecipeLine[];
  steps?: RecipeLine[];
  prepMinutes?: number;
  cookMinutes?: number;
  servings?: number;
}): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch("/api/recipe-description", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: input.title,
      tags: input.tags ?? [],
      ingredients: (input.ingredients ?? []).map((line) => line.text),
      steps: (input.steps ?? []).map((line) => line.text),
      prepMinutes: input.prepMinutes ?? null,
      cookMinutes: input.cookMinutes ?? null,
      servings: input.servings ?? null,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { description?: string };
  const description = typeof data.description === "string" ? data.description.trim() : "";
  if (!description) throw new Error("AI description was empty.");
  return description;
}

export async function listRecipeChanges(recipeId: string): Promise<RecipeChange[]> {
  const { data, error } = await supabase
    .from("recipe_changes")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("changed_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as RecipeChange[];
}

export async function rollbackRecipe(recipeId: string, changeId: string): Promise<Recipe> {
  const { data: changeData, error: changeError } = await supabase
    .from("recipe_changes")
    .select("*")
    .eq("id", changeId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (changeError) throw new Error(changeError.message);
  if (!changeData) throw new Error("Change record not found");

  const change = changeData as RecipeChange;
  if (change.action === "delete") {
    throw new Error("Cannot rollback a delete action");
  }

  // Get the version to restore - use the "after" state (what the recipe was after this change)
  // This allows rolling back to the state at that point in time
  const versionToRestore = change.changes?.after;
  if (!versionToRestore) {
    throw new Error("No version data found in change record");
  }

  // Restore the recipe to the version after this change
  const patch: Partial<Omit<Recipe, "id" | "user_id" | "created_at">> = {
    title: versionToRestore.title,
    description: versionToRestore.description ?? null,
    tags: versionToRestore.tags ?? [],
    ingredients: versionToRestore.ingredients ?? [],
    steps: versionToRestore.steps ?? [],
    prep_minutes: versionToRestore.prep_minutes ?? null,
    cook_minutes: versionToRestore.cook_minutes ?? null,
    servings: versionToRestore.servings ?? null,
    source_url: versionToRestore.source_url ?? null,
    cover_photo_id: versionToRestore.cover_photo_id ?? null,
    is_favorite: versionToRestore.is_favorite ?? null,
    last_cooked_at: versionToRestore.last_cooked_at ?? null,
  };

  return updateRecipe(recipeId, patch);
}
