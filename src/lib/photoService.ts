import { supabase } from "./supabaseClient";
import type { RecipePhoto } from "./types";
const BUCKET = "recipe-photos";
const SIGNED_URL_TTL_MS = 55 * 60 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const photoCache = new Map<string, RecipePhoto>();

function isHeic(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}
  
async function uploadHeicViaServer(file: File, recipeId: string, photoId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const form = new FormData();
  form.append("file", file, file.name);
  form.append("recipeId", recipeId);
  form.append("photoId", photoId);

  const res = await fetch("/api/convert-heic", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "HEIC conversion failed.");
  }

  return (await res.json()) as { storagePath: string };
}

async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function addPhoto(recipeId: string, file: File): Promise<RecipePhoto> {
  const userId = await getUserId();

  // Create a DB row first to get a UUID photo id
  const { data: meta, error: metaErr } = await supabase
    .from("recipe_photos")
    .insert({ user_id: userId, recipe_id: recipeId, storage_path: "" })
    .select("*")
    .single();

  if (metaErr) throw new Error(metaErr.message);

  const photoId = meta.id as string;
  
  let storagePath = "";

  if (isHeic(file)) {
    try {
      const converted = await uploadHeicViaServer(file, recipeId, photoId);
      storagePath = converted.storagePath;
    } catch (err) {
      await supabase.from("recipe_photos").delete().eq("id", photoId);
      throw err;
    }
  } else {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    storagePath = `${userId}/${recipeId}/${photoId}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
    });

    if (upErr) {
      console.error("Storage upload failed", {
        message: upErr.message,
        name: upErr.name,
        status: (upErr as any).status,
        bucket: BUCKET,
        path: storagePath,
      });

      // cleanup the metadata row so you don't get orphan rows
      await supabase.from("recipe_photos").delete().eq("id", photoId);

      throw new Error(`Failed to upload file: ${upErr.message}`);
    }
  }

  // Update metadata row with final storage_path
  const { data: updated, error: updErr } = await supabase
    .from("recipe_photos")
    .update({ storage_path: storagePath })
    .eq("id", photoId)
    .select("*")
    .single();

  if (updErr) throw new Error(updErr.message);

  return updated as RecipePhoto;
}

export async function listPhotos(recipeId: string): Promise<RecipePhoto[]> {
  const { data, error } = await supabase
    .from("recipe_photos")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const photos = (data ?? []) as RecipePhoto[];

  // Create signed URLs for display (bucket is private)
  const signed = await Promise.all(
    photos.map(async (p) => {
      if (!p.storage_path) return p;
      const signedUrl = await getSignedUrlCached(p.storage_path);
      return signedUrl ? { ...p, signed_url: signedUrl } : p;
    })
  );

  return signed;
}

export async function deletePhoto(photo: RecipePhoto) {
  // Delete object (if exists)
  if (photo.storage_path) {
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    if (sErr) throw new Error(sErr.message);
  }

  // Delete metadata row
  const { error } = await supabase.from("recipe_photos").delete().eq("id", photo.id);
  if (error) throw new Error(error.message);
}

export async function getCoverUrlByPhotoId(photoId: string): Promise<string | undefined> {
  const cached = photoCache.get(photoId);
  if (cached?.storage_path) {
    const signedUrl = await getSignedUrlCached(cached.storage_path);
    return signedUrl ?? undefined;
  }

  const { data, error } = await supabase.from("recipe_photos").select("*").eq("id", photoId).single();
  if (error) throw new Error(error.message);
  const photo = data as RecipePhoto;
  photoCache.set(photoId, photo);
  if (!photo.storage_path) return undefined;
  return (await getSignedUrlCached(photo.storage_path)) ?? undefined;
}

export function invalidatePhotoCache(photoId: string) {
  const cached = photoCache.get(photoId);
  if (cached?.storage_path) signedUrlCache.delete(cached.storage_path);
  photoCache.delete(photoId);
}

async function getSignedUrlCached(storagePath: string): Promise<string | null> {
  const now = Date.now();
  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAt > now) return cached.url;

  const { data: s, error: sErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (sErr || !s?.signedUrl) return null;

  signedUrlCache.set(storagePath, { url: s.signedUrl, expiresAt: now + SIGNED_URL_TTL_MS });
  return s.signedUrl;
}
