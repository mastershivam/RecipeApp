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
  is_favorite?: boolean | null;
  last_cooked_at?: string | null;
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

export type RecipeChange = {
  id: string;
  recipe_id: string;
  user_id?: string | null;
  action: "insert" | "update" | "delete";
  changes?: { after?: Partial<Recipe>; before?: Partial<Recipe> };
  changed_at: string;
};

export type GroupRole = "owner" | "admin" | "member";
export type GroupMemberStatus = "pending" | "accepted" | "declined";

export type Group = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  status: GroupMemberStatus;
  invited_by?: string | null;
  created_at: string;
};
