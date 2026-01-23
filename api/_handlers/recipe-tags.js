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

function normalizeTextList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => (typeof item === "string" ? item : ""))
    .map((text) => text.trim())
    .filter(Boolean);
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
    res.end("AI tags are not configured.");
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
  const title = String(payload?.title || "").trim();
  const description = String(payload?.description || "").trim();
  const ingredients = normalizeTextList(payload?.ingredients);
  const steps = normalizeTextList(payload?.steps);
  const existingTags = normalizeTextList(payload?.existingTags);

  if (!title) {
    res.statusCode = 400;
    res.end("Missing recipe title.");
    return;
  }

  if (ingredients.length === 0 && steps.length === 0) {
    res.statusCode = 400;
    res.end("Ingredients or steps are required.");
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
              "Return a JSON object with a single key \"tags\" whose value is an array of 2-4 strings. Prefer selecting from existingTags when relevant, then add new tags if needed. Tags should be short phrases, no hashtags, no duplicates, and cover cuisine, course, technique, or dietary cues when relevant. Example response: {\"tags\":[\"Vegetarian\",\"Mushroom\",\"Pastry\"]}. Do not include any other keys or text.",
          },
          {
            role: "user",
            content: JSON.stringify({
              title,
              description,
              ingredients,
              steps,
              existingTags,
            }),
          },
        ],
      }),
    });

    if (!groqRes.ok) {
      const msg = await groqRes.text();
      res.statusCode = 502;
      res.end(msg || "AI tag request failed.");
      return;
    }

    const groqData = await groqRes.json();
    const content = groqData?.choices?.[0]?.message?.content;
    if (!content) {
      res.statusCode = 502;
      res.end("AI tag response was empty.");
      return;
    }

    let tags = [];
    try {
      const parsed = JSON.parse(content);
      tags = normalizeTextList(parsed?.tags);
    } catch {
      res.statusCode = 502;
      res.end("AI tag response could not be parsed.");
      return;
    }

    const limited = Array.from(new Set(tags)).slice(0, 4);
    if (limited.length === 0) {
      res.statusCode = 502;
      res.end("AI tags were empty.");
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ tags: limited }));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : "AI tags failed.");
  }
}
