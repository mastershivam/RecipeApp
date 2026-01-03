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

  const groupId = req.query?.groupId;
  if (!groupId) {
    res.statusCode = 400;
    res.end("Missing groupId.");
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
    const { data: member, error: memberErr } = await supabase
      .from("group_members")
      .select("status")
      .eq("group_id", groupId)
      .eq("user_id", requesterId)
      .maybeSingle();

    if (memberErr || !member || member.status !== "accepted") {
      res.statusCode = 403;
      res.end("Not a group member.");
      return;
    }

    const { data: members, error: listErr } = await supabase
      .from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (listErr) {
      res.statusCode = 500;
      res.end(listErr.message);
      return;
    }

    const enriched = await Promise.all(
      (members ?? []).map(async (memberRow) => {
        const { data } = await supabase.auth.admin.getUserById(memberRow.user_id);
        return {
          ...memberRow,
          email: data?.user?.email || "Unknown user",
        };
      })
    );

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ members: enriched }));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Failed to load group members.");
  }
}
