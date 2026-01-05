import { createClient } from "@supabase/supabase-js";

function getEnv(name) {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function readJson(body) {
  try {
    return typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return null;
  }
}

async function loadRecipeWithAccess(supabase, recipeId, userId) {
  const { data: recipe, error } = await supabase.from("recipes").select("*").eq("id", recipeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!recipe) return null;
  if (recipe.user_id === userId) return recipe;

  const { data: directShare, error: shareErr } = await supabase
    .from("recipe_shares")
    .select("permission")
    .eq("recipe_id", recipeId)
    .eq("shared_with", userId)
    .maybeSingle();
  if (shareErr) throw new Error(shareErr.message);
  if (directShare) return recipe;

  const { data: memberRows, error: memberErr } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId)
    .eq("status", "accepted");
  if (memberErr) throw new Error(memberErr.message);
  const groupIds = (memberRows ?? []).map((row) => row.group_id);
  if (groupIds.length === 0) return null;

  const { data: groupShare, error: groupErr } = await supabase
    .from("recipe_group_shares")
    .select("id")
    .eq("recipe_id", recipeId)
    .in("group_id", groupIds)
    .limit(1);
  if (groupErr) throw new Error(groupErr.message);
  if ((groupShare ?? []).length > 0) return recipe;

  return null;
}

function normalizeSuggestions(payload) {
  const improvements = Array.isArray(payload?.improvements) ? payload.improvements : [];
  const alternatives = Array.isArray(payload?.alternatives) ? payload.alternatives : [];
  return { improvements, alternatives };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = getEnv("AI_API_KEY");

  if (!supabaseUrl || !serviceRole) {
    res.statusCode = 500;
    res.end("Missing server configuration.");
    return;
  }

  if (!apiKey) {
    res.statusCode = 501;
    res.end("AI suggestions are not configured.");
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.statusCode = 401;
    res.end("Missing auth token.");
    return;
  }

  const payload = readJson(req.body);
  const recipeId = String(payload?.recipeId || "").trim();
  if (!recipeId) {
    res.statusCode = 400;
    res.end("Missing recipe id.");
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

    const recipe = await loadRecipeWithAccess(supabase, recipeId, authData.user.id);
    if (!recipe) {
      res.statusCode = 404;
      res.end("Recipe not found.");
      return;
    }

    const ingredients = (recipe.ingredients ?? []).map((item) => item?.text || "").filter(Boolean);
    const steps = (recipe.steps ?? []).map((item) => item?.text || "").filter(Boolean);

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a culinary assistant. Respond only with JSON: {improvements:[{title,rationale,changes}], alternatives:[{title,summary,changes}]}. Provide 3-5 items per list. Changes are short strings, no bullets. Keep wording concise and actionable.",
          },
          {
            role: "user",
            content: JSON.stringify({
              title: recipe.title,
              description: recipe.description || "",
              tags: recipe.tags || [],
              servings: recipe.servings || null,
              prepMinutes: recipe.prep_minutes || null,
              cookMinutes: recipe.cook_minutes || null,
              ingredients,
              steps,
            }),
          },
        ],
      }),
    });

    if (!groqRes.ok) {
      const msg = await groqRes.text();
      res.statusCode = 502;
      res.end(msg || "AI suggestion request failed.");
      return;
    }

    const groqData = await groqRes.json();
    const content = groqData?.choices?.[0]?.message?.content;
    if (!content) {
      res.statusCode = 502;
      res.end("AI suggestion response was empty.");
      return;
    }

    let suggestions = null;
    try {
      suggestions = normalizeSuggestions(JSON.parse(content));
    } catch {
      res.statusCode = 502;
      res.end("AI suggestion response could not be parsed.");
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(suggestions));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "AI suggestion failed.");
  }
}
