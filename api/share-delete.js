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
      .from("recipe_shares")
      .select("id,owner_id")
      .eq("id", shareId)
      .single();

    if (shareErr || !share) {
      res.statusCode = 404;
      res.end("Share not found.");
      return;
    }

    if (share.owner_id !== ownerId) {
      res.statusCode = 403;
      res.end("Only the owner can revoke shares.");
      return;
    }

    const { error: delErr } = await supabase.from("recipe_shares").delete().eq("id", shareId);
    if (delErr) {
      res.statusCode = 500;
      res.end(delErr.message);
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Failed to revoke share.");
  }
}
