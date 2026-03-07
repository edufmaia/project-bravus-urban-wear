import { supabase } from "./supabaseClient";

type SignedUrlCacheEntry = {
  url: string;
  expiresAt: number;
};

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

const SIGNED_URL_TTL_MS = 60 * 60 * 1000;
const SIGNED_URL_BUFFER_MS = 30 * 1000;

const getFileExtension = (file: File) => {
  const nameParts = file.name.split(".");
  const ext = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
  return ext.toLowerCase();
};

export const uploadProductImage = async (productId: string, file: File) => {
  const ext = getFileExtension(file) || "jpg";
  const path = `products/${productId}/main.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  signedUrlCache.delete(path);
  return path;
};

export const getSignedProductImageUrl = async (path: string) => {
  if (!path) return null;
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt - SIGNED_URL_BUFFER_MS > Date.now()) {
    return cached.url;
  }
  const { data, error } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_MS });
  return data.signedUrl;
};
