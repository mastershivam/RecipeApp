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

  const shareId = payload?.shareId;
  const permission = payload?.permission === "edit" ? "edit" : "view";

  if (!shareId) {
    res.statusCode = 400;
    res.end("Missing shareId.");
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
    const { data: share, error: shareErr } = await supabase
      .from("recipe_group_shares")
      .select("owner_id")
      .eq("id", shareId)
      .maybeSingle();

    if (shareErr || !share) {
      res.statusCode = 404;
      res.end("Share not found.");
      return;
    }

    if (share.owner_id !== ownerId) {
      res.statusCode = 403;
      res.end("Only the owner can update shares.");
      return;
    }

    const { error: updErr } = await supabase
      .from("recipe_group_shares")
      .update({ permission })
      .eq("id", shareId);

    if (updErr) {
      res.statusCode = 500;
      res.end(updErr.message);
      return;
    }

    res.end("OK");
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Failed to update share.");
  }
}
