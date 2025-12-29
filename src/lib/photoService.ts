import { supabase } from "./supabaseClient";
import type { RecipePhoto } from "./types";
import heic2any from "heic2any";

const BUCKET = "recipe-photos";

function isHeic(file: File) {
    const name = file.name.toLowerCase();
    return file.type === "image/heic" || file.type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
  }
  
  async function convertHeicToJpeg(file: File): Promise<File> {
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });
  
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  
    return new File([blob as BlobPart], newName, { type: "image/jpeg" });
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
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const storagePath = `${userId}/${recipeId}/${photoId}.${ext}`;

  //Convert from HEIC
  let uploadFile = file;
    if (isHeic(file)) {
  uploadFile = await convertHeicToJpeg(file);
}
  // Upload to storage

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, uploadFile, {
  contentType: uploadFile.type,
  upsert: true,
});
  if (upErr) throw new Error(upErr.message);

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
      const { data: s, error: sErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(p.storage_path, 60 * 60); // 1 hour
      if (sErr) return p;
      return { ...p, signed_url: s.signedUrl };
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