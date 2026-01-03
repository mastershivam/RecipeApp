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
  const groupId = payload?.groupId;
  const permission = payload?.permission === "edit" ? "edit" : "view";

  if (!recipeId || !groupId) {
    res.statusCode = 400;
    res.end("Missing recipeId or groupId.");
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
      res.end("Only the owner can share this recipe.");
      return;
    }

    const { data: groupMember, error: groupErr } = await supabase
      .from("group_members")
      .select("role,status,groups(name)")
      .eq("group_id", groupId)
      .eq("user_id", ownerId)
      .maybeSingle();

    if (
      groupErr ||
      !groupMember ||
      groupMember.status !== "accepted" ||
      !["owner", "admin"].includes(groupMember.role)
    ) {
      res.statusCode = 403;
      res.end("Only group admins can share to the group.");
      return;
    }

    const { data: share, error: shareErr } = await supabase
      .from("recipe_group_shares")
      .upsert(
        {
          recipe_id: recipeId,
          group_id: groupId,
          owner_id: ownerId,
          permission,
        },
        { onConflict: "recipe_id,group_id" }
      )
      .select("id,permission,group_id,groups(name)")
      .single();

    if (shareErr || !share) {
      res.statusCode = 500;
      res.end(shareErr?.message || "Failed to share recipe.");
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        share: {
          id: share.id,
          groupId: share.group_id,
          groupName: share.groups?.name || "Unnamed group",
          permission: share.permission,
        },
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Failed to share recipe.");
  }
}
