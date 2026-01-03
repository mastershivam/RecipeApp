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

  const groupId = payload?.groupId;
  const memberId = payload?.memberId;
  if (!groupId || !memberId) {
    res.statusCode = 400;
    res.end("Missing groupId or memberId.");
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

    const requesterId = authData.user.id;
    const { data: requester, error: requesterErr } = await supabase
      .from("group_members")
      .select("role,status")
      .eq("group_id", groupId)
      .eq("user_id", requesterId)
      .maybeSingle();

    if (
      requesterErr ||
      !requester ||
      requester.status !== "accepted" ||
      !["owner", "admin"].includes(requester.role)
    ) {
      res.statusCode = 403;
      res.end("Only group admins can remove members.");
      return;
    }

    const { data: target, error: targetErr } = await supabase
      .from("group_members")
      .select("role")
      .eq("id", memberId)
      .eq("group_id", groupId)
      .maybeSingle();

    if (targetErr || !target) {
      res.statusCode = 404;
      res.end("Member not found.");
      return;
    }

    if (target.role === "owner") {
      res.statusCode = 400;
      res.end("Owners cannot be removed.");
      return;
    }

    const { error: delErr } = await supabase.from("group_members").delete().eq("id", memberId);
    if (delErr) {
      res.statusCode = 500;
      res.end(delErr.message);
      return;
    }

    res.end("OK");
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Failed to remove member.");
  }
}
