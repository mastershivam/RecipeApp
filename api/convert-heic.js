import { createClient } from "@supabase/supabase-js";
import { IncomingForm } from "formidable";
import fs from "node:fs/promises";
import sharp from "sharp";

export const config = {
  api: { bodyParser: false },
};

const BUCKET = "recipe-photos";

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

  const form = new IncomingForm({ multiples: false });
  let fields;
  let files;

  try {
    ({ fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, parsedFields, parsedFiles) => {
        if (err) reject(err);
        else resolve({ fields: parsedFields, files: parsedFiles });
      });
    }));
  } catch (err) {
    res.statusCode = 400;
    res.end("Failed to read upload.");
    return;
  }

  const recipeId = Array.isArray(fields.recipeId) ? fields.recipeId[0] : fields.recipeId;
  const photoId = Array.isArray(fields.photoId) ? fields.photoId[0] : fields.photoId;
  const file = Array.isArray(files.file) ? files.file[0] : files.file;

  if (!recipeId || !photoId || !file) {
    res.statusCode = 400;
    res.end("Missing upload data.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user) {
    res.statusCode = 401;
    res.end("Invalid auth token.");
    return;
  }

  const userId = authData.user.id;
  const storagePath = `${userId}/${recipeId}/${photoId}.jpg`;

  try {
    const inputBuffer = await fs.readFile(file.filepath);
    const outputBuffer = await sharp(inputBuffer).rotate().jpeg({ quality: 90 }).toBuffer();

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, outputBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

    if (uploadErr) {
      res.statusCode = 500;
      res.end(`Upload failed: ${uploadErr.message}`);
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ storagePath }));
  } catch (err) {
    res.statusCode = 500;
    res.end("HEIC conversion failed.");
  } finally {
    if (file?.filepath) {
      await fs.rm(file.filepath).catch(() => {});
    }
  }
}
