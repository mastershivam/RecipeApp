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

  const name = String(payload?.name || "").trim();
  if (!name) {
    res.statusCode = 400;
    res.end("Missing group name.");
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
    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .insert({ name, owner_id: ownerId })
      .select("*")
      .single();

    if (groupErr || !group) {
      res.statusCode = 500;
      res.end(groupErr?.message || "Failed to create group.");
      return;
    }

    const { error: memberErr } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: ownerId,
      role: "owner",
      status: "accepted",
      invited_by: ownerId,
    });

    if (memberErr) {
      res.statusCode = 500;
      res.end(memberErr.message);
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ group }));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Failed to create group.");
  }
}
