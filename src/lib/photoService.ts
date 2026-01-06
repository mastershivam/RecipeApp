import { supabase, supabaseUrl } from "./supabaseClient";
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

async function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    return await createImageBitmap(file);
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image."));
    };
    img.src = url;
  });
}

async function resizeImage(file: File, maxSize: number, quality: number): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await loadImageBitmap(file);
  const width = "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
  const height = "height" in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;

  if (!width || !height) return file;
  if (Math.max(width, height) <= maxSize) return file;

  const scale = maxSize / Math.max(width, height);
  const nextWidth = Math.round(width * scale);
  const nextHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = nextWidth;
  canvas.height = nextHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, nextWidth, nextHeight);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) return file;

  const baseName = file.name.replace(/\.\w+$/, "");
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

async function uploadWithProgress(
  storagePath: string,
  file: File,
  onProgress?: (value: number) => void
) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const url = `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress(percent);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(xhr.responseText || `Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.send(file);
  });
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

export async function addPhoto(
  recipeId: string,
  file: File,
  onProgress?: (value: number) => void
): Promise<RecipePhoto> {
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
  let uploadFile = file;

  if (isHeic(file)) {
    try {
      onProgress?.(10);
      const converted = await uploadHeicViaServer(file, recipeId, photoId);
      onProgress?.(100);
      storagePath = converted.storagePath;
    } catch (err) {
      await supabase.from("recipe_photos").delete().eq("id", photoId);
      throw err;
    }
  } else {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const optimized = await resizeImage(file, 1600, 0.82);
    uploadFile = optimized;
    const uploadExt = (optimized.name.split(".").pop() || ext).toLowerCase();
    storagePath = `${userId}/${recipeId}/${photoId}.${uploadExt}`;

    try {
      await uploadWithProgress(storagePath, uploadFile, onProgress);
    } catch (err: unknown ) {
      console.error("Storage upload failed", {
        message: (err as Error).message,
        bucket: BUCKET,
        path: storagePath,
      });
      await supabase.from("recipe_photos").delete().eq("id", photoId);
      throw new Error(err instanceof Error ? err.message : "Failed to upload file.");
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

async function attachSignedUrls(photos: RecipePhoto[]) {
  return await Promise.all(
    photos.map(async (p) => {
      if (!p.storage_path) return p;
      const signedUrl = await getSignedUrlCached(p.storage_path);
      return signedUrl ? { ...p, signed_url: signedUrl } : p;
    })
  );
}

export async function listPhotos(recipeId: string): Promise<RecipePhoto[]> {
  const { data, error } = await supabase
    .from("recipe_photos")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  const photos = (data ?? []) as RecipePhoto[];
  return await attachSignedUrls(photos);
}

export async function listPhotosPage(
  recipeId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: RecipePhoto[]; hasMore: boolean }> {
  const page = options?.page ?? 0;
  const pageSize = options?.pageSize ?? 0;
  let query = supabase
    .from("recipe_photos")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: true });

  if (pageSize > 0) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const photos = (data ?? []) as RecipePhoto[];
  const signed = await attachSignedUrls(photos);
  return { data: signed, hasMore: pageSize > 0 ? photos.length === pageSize : false };
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

  const { data, error } = await supabase.from("recipe_photos").select("*").eq("id", photoId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
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
