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

  try {
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    const recipesCount = await supabase
      .from("recipes")
      .select("id", { count: "exact", head: true });

    if (recipesCount.error) throw recipesCount.error;

    const photosCount = await supabase
      .from("recipe_photos")
      .select("id", { count: "exact", head: true });

    if (photosCount.error) throw photosCount.error;

    const tagsResult = await supabase.from("recipes").select("tags");
    if (tagsResult.error) throw tagsResult.error;

    const tagSet = new Set();
    for (const row of tagsResult.data ?? []) {
      const tags = Array.isArray(row.tags) ? row.tags : [];
      for (const t of tags) tagSet.add(t);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.end(
      JSON.stringify({
        recipes: recipesCount.count ?? 0,
        photos: photosCount.count ?? 0,
        tags: tagSet.size,
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.end("Failed to load stats.");
  }
}
