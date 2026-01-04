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

function normalizeList(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return [input];
}

function isRecipeType(type) {
  if (!type) return false;
  if (Array.isArray(type)) return type.includes("Recipe");
  return String(type).toLowerCase() === "recipe";
}

function findRecipeJsonLd(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeJsonLd(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  if (isRecipeType(value["@type"])) return value;
  if (value["@graph"]) return findRecipeJsonLd(value["@graph"]);
  return null;
}

function parseJsonLd(html) {
  const scripts = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    scripts.push(match[1]);
  }
  for (const raw of scripts) {
    try {
      const parsed = JSON.parse(raw.trim());
      const recipe = findRecipeJsonLd(parsed);
      if (recipe) return recipe;
    } catch {
      continue;
    }
  }
  return null;
}

function parseDurationToMinutes(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) return null;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return days * 24 * 60 + hours * 60 + minutes;
}

function normalizeTextArray(values) {
  return normalizeList(values)
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item === "object") return item.text || item.name || "";
      return String(item);
    })
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeInstructions(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    const items = [];
    for (const item of value) {
      if (!item) continue;
      if (typeof item === "string") {
        items.push(item);
        continue;
      }
      if (item.text) {
        items.push(item.text);
        continue;
      }
      if (Array.isArray(item.itemListElement)) {
        items.push(...normalizeInstructions(item.itemListElement));
      }
    }
    return normalizeTextArray(items);
  }
  if (typeof value === "string") {
    return normalizeTextArray(value.split(/\r?\n/));
  }
  if (typeof value === "object") {
    if (value.text) return normalizeTextArray(value.text.split(/\r?\n/));
    if (Array.isArray(value.itemListElement)) return normalizeInstructions(value.itemListElement);
  }
  return [];
}

function stripHtml(html) {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<(br|li|p|div|h[1-6])[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function normalizeRecipePayload(payload, fallbackUrl) {
  const ingredients = normalizeTextArray(payload.ingredients);
  const steps = normalizeTextArray(payload.steps);
  const tags = normalizeTextArray(payload.tags);
  const servings = payload.servings ? Number(payload.servings) : null;
  const prepMinutes = payload.prepMinutes ? Number(payload.prepMinutes) : null;
  const cookMinutes = payload.cookMinutes ? Number(payload.cookMinutes) : null;

  return {
    title: (payload.title || "").trim(),
    description: payload.description ? String(payload.description).trim() : null,
    tags,
    ingredients: ingredients.map((text) => ({ text })),
    steps: steps.map((text) => ({ text })),
    prep_minutes: Number.isFinite(prepMinutes) ? prepMinutes : null,
    cook_minutes: Number.isFinite(cookMinutes) ? cookMinutes : null,
    servings: Number.isFinite(servings) ? servings : null,
    source_url: fallbackUrl,
  };
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

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.statusCode = 401;
    res.end("Missing auth token.");
    return;
  }

  const payload = readJson(req.body);
  const url = String(payload?.url || "").trim();
  if (!url) {
    res.statusCode = 400;
    res.end("Missing recipe URL.");
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

    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "RecipeArchiveBot/1.0",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!pageRes.ok) {
      res.statusCode = 400;
      res.end("Failed to fetch recipe URL.");
      return;
    }

    const html = await pageRes.text();
    const jsonLd = parseJsonLd(html);
    const pageText = stripHtml(html);

    let recipePayload = null;

    if (apiKey) {
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
                "Extract a recipe and respond with JSON: {title, description, tags, ingredients, steps, prepMinutes, cookMinutes, servings}. Ingredients must be arrays of strings with quantities (no bullets). Steps must be short, imperative strings. Tags should be short single words or short phrases. Omit fields you cannot infer.",
            },
            {
              role: "user",
              content: JSON.stringify({
                sourceUrl: url,
                jsonLd,
                pageText: pageText.slice(0, 12000),
              }),
            },
          ],
        }),
      });

      if (!groqRes.ok) {
        const msg = await groqRes.text();
        res.statusCode = 502;
        res.end(msg || "AI extraction failed.");
        return;
      }

      const groqData = await groqRes.json();
      const content = groqData?.choices?.[0]?.message?.content;
      if (content) {
        recipePayload = JSON.parse(content);
      }
    }

    if (!recipePayload && jsonLd) {
      recipePayload = {
        title: jsonLd.name || jsonLd.headline,
        description: jsonLd.description,
        tags: normalizeTextArray(jsonLd.keywords || jsonLd.recipeCuisine || jsonLd.recipeCategory),
        ingredients: normalizeTextArray(jsonLd.recipeIngredient || jsonLd.ingredients),
        steps: normalizeInstructions(jsonLd.recipeInstructions),
        prepMinutes: parseDurationToMinutes(jsonLd.prepTime),
        cookMinutes: parseDurationToMinutes(jsonLd.cookTime || jsonLd.totalTime),
        servings: normalizeTextArray(jsonLd.recipeYield)[0],
      };
    }

    if (!recipePayload) {
      res.statusCode = 500;
      res.end("No recipe data found.");
      return;
    }

    const recipe = normalizeRecipePayload(recipePayload, url);
    if (!recipe.title || recipe.ingredients.length === 0 || recipe.steps.length === 0) {
      res.statusCode = 422;
      res.end("Could not extract a complete recipe.");
      return;
    }

    const { data, error } = await supabase
      .from("recipes")
      .insert({
        user_id: authData.user.id,
        title: recipe.title,
        description: recipe.description,
        tags: recipe.tags,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        prep_minutes: recipe.prep_minutes,
        cook_minutes: recipe.cook_minutes,
        servings: recipe.servings,
        source_url: recipe.source_url,
      })
      .select("id")
      .single();

    if (error || !data) {
      res.statusCode = 500;
      res.end(error?.message || "Failed to save recipe.");
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ recipeId: data.id }));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "Recipe import failed.");
  }
}
