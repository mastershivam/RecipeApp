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
  const { data: recipe, error } = await supabase
    .from("recipes")
    .select(
      "id, user_id, title, description, ingredients, steps, servings, updated_at, nutrition_cache, nutrition_updated_at"
    )
    .eq("id", recipeId)
    .maybeSingle();
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
    res.end("AI nutrition is not configured.");
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

    if (recipe.nutrition_cache && recipe.nutrition_updated_at) {
      const cachedAt = new Date(recipe.nutrition_updated_at).getTime();
      const updatedAt = new Date(recipe.updated_at).getTime();
      if (Number.isFinite(cachedAt) && Number.isFinite(updatedAt) && cachedAt >= updatedAt) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ perServing: recipe.nutrition_cache }));
        return;
      }
    }

    const ingredients = (recipe.ingredients ?? []).map((item) => item?.text || "").filter(Boolean);
    const steps = (recipe.steps ?? []).map((item) => item?.text || "").filter(Boolean);
    if (ingredients.length === 0) {
      res.statusCode = 400;
      res.end("Ingredients are required.");
      return;
    }

    const servings = Number(recipe.servings);
    if (!Number.isFinite(servings) || servings <= 0) {
      res.statusCode = 400;
      res.end("Servings are required for per-serving nutrition.");
      return;
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Estimate per-serving nutrition. Return a JSON object with a single key \"perServing\" whose value has calories, carbs, protein, fat numbers. Use best-effort estimates from ingredients and typical quantities; do not explain. Example: {\"perServing\":{\"calories\":300,\"carbs\":30,\"protein\":20,\"fat\":12}}.",
          },
          {
            role: "user",
            content: JSON.stringify({
              title: recipe.title,
              description: recipe.description || "",
              ingredients,
              steps,
              servings,
            }),
          },
        ],
      }),
    });

    if (!groqRes.ok) {
      const msg = await groqRes.text();
      res.statusCode = 502;
      res.end(msg || "AI nutrition request failed.");
      return;
    }

    const groqData = await groqRes.json();
    const content = groqData?.choices?.[0]?.message?.content;
    if (!content) {
      res.statusCode = 502;
      res.end("AI nutrition response was empty.");
      return;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.statusCode = 502;
      res.end("AI nutrition response could not be parsed.");
      return;
    }

    const per = parsed?.perServing || {};
    const perServing = {
      calories: Number(per?.calories),
      carbs: Number(per?.carbs),
      protein: Number(per?.protein),
      fat: Number(per?.fat),
    };

    if (!Number.isFinite(perServing.calories)) {
      res.statusCode = 502;
      res.end("AI nutrition response was incomplete.");
      return;
    }

    await supabase
      .from("recipes")
      .update({
        nutrition_cache: perServing,
        nutrition_updated_at: new Date().toISOString(),
      })
      .eq("id", recipe.id);

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ perServing }));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "AI nutrition failed.");
  }
}
