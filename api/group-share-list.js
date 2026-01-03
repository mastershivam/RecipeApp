import { createClient } from "@supabase/supabase-js";

function getEnv(name) {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRole) {
    res.statusCode = 500;
    res.end("Missing server configuration.");
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.statusCode = 401;
    res.end("Missing auth token.");
    return;
  }

  const recipeId = req.query?.recipeId;
  if (!recipeId) {
    res.statusCode = 400;
    res.end("Missing recipeId.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      res.statusCode = 401;
      res.end("Invalid auth token.");
      return;
    }

    const ownerId = authData.user.id;
    const recipeRes = await supabase.from("recipes").select("id,user_id").eq("id", recipeId).single();
    if (recipeRes.error || !recipeRes.data) {
      res.statusCode = 404;
      res.end("Recipe not found.");
      return;
    }
    if (recipeRes.data.user_id !== ownerId) {
      res.statusCode = 403;
      res.end("Only the owner can view group shares.");
      return;
    }

    const { data: shares, error: sharesErr } = await supabase
      .from("recipe_group_shares")
      .select("id,permission,group_id,groups(name)")
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: true });

    if (sharesErr) {
      res.statusCode = 500;
      res.end(sharesErr.message);
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        shares: (shares ?? []).map((share) => ({
          id: share.id,
          permission: share.permission,
          groupId: share.group_id,
          groupName: share.groups?.name || "Unnamed group",
        })),
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Failed to load group shares.");
  }
}
