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
  const email = String(payload?.email || "").trim().toLowerCase();
  const role = payload?.role === "admin" ? "admin" : "member";

  if (!groupId || !email) {
    res.statusCode = 400;
    res.end("Missing groupId or email.");
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

    const inviterId = authData.user.id;
    const { data: member, error: memberErr } = await supabase
      .from("group_members")
      .select("role,status")
      .eq("group_id", groupId)
      .eq("user_id", inviterId)
      .maybeSingle();

    if (memberErr || !member || member.status !== "accepted" || !["owner", "admin"].includes(member.role)) {
      res.statusCode = 403;
      res.end("Only group admins can invite members.");
      return;
    }

    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();
    if (usersErr) {
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

    if (targetUser.id === inviterId) {
      res.statusCode = 400;
      res.end("You are already in the group.");
      return;
    }

    const { data: existing, error: existingErr } = await supabase
      .from("group_members")
      .select("id,status")
      .eq("group_id", groupId)
      .eq("user_id", targetUser.id)
      .maybeSingle();

    if (existingErr) {
      res.statusCode = 500;
      res.end(existingErr.message);
      return;
    }

    if (existing?.status === "accepted") {
      res.statusCode = 400;
      res.end("User is already in the group.");
      return;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("group_members")
      .upsert(
        {
          id: existing?.id,
          group_id: groupId,
          user_id: targetUser.id,
          role,
          status: "pending",
          invited_by: inviterId,
        },
        { onConflict: "group_id,user_id" }
      )
      .select("*")
      .single();

    if (insertErr || !inserted) {
      res.statusCode = 500;
      res.end(insertErr?.message || "Failed to invite member.");
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        member: {
          id: inserted.id,
          group_id: inserted.group_id,
          user_id: inserted.user_id,
          role: inserted.role,
          status: inserted.status,
          invited_by: inserted.invited_by,
          created_at: inserted.created_at,
          email: targetUser.email,
        },
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Failed to invite member.");
  }
}
