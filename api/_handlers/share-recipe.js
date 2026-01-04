import { createClient } from "@supabase/supabase-js";

function getEnv(name) {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
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

  let payload = null;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.statusCode = 400;
    res.end("Invalid request body.");
    return;
  }

  const recipeId = payload?.recipeId;
  const email = String(payload?.email || "").trim().toLowerCase();
  const permission = payload?.permission === "edit" ? "edit" : "view";

  if (!recipeId || !email) {
    res.statusCode = 400;
    res.end("Missing recipeId or email.");
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
    const recipeRes = await supabase
      .from("recipes")
      .select("id,user_id,title")
      .eq("id", recipeId)
      .single();
    if (recipeRes.error || !recipeRes.data) {
      res.statusCode = 404;
      res.end("Recipe not found.");
      return;
    }
    if (recipeRes.data.user_id !== ownerId) {
      res.statusCode = 403;
      res.end("Only the owner can share this recipe.");
      return;
    }

    const { data: usersData, error: targetErr } = await supabase.auth.admin.listUsers();
    if (targetErr) {
      res.statusCode = 500;
      res.end("Failed to lookup user.");
      return;
    }

    const targetUser = usersData.users.find((u) => u.email?.toLowerCase() === email);
    if (!targetUser) {
      res.statusCode = 404;
      res.end("User not found.");
      return;
    }

    if (targetUser.id === ownerId) {
      res.statusCode = 400;
      res.end("You already own this recipe.");
      return;
    }

    const { data: share, error: shareErr } = await supabase
      .from("recipe_shares")
      .upsert(
        {
          recipe_id: recipeId,
          owner_id: ownerId,
          shared_with: targetUser.id,
          permission,
        },
        { onConflict: "recipe_id,shared_with" }
      )
      .select("*")
      .single();

    if (shareErr) {
      res.statusCode = 500;
      res.end(shareErr.message);
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ share: { id: share.id, email: targetUser.email, permission: share.permission } }));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Failed to share recipe.");
  }
}
