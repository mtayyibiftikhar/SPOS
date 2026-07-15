import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { optimizePosImage } from "@/lib/server/optimize-pos-image";

export const POS_ASSETS_BUCKET = "pos-assets";
export const SIGNED_IMAGE_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;
export const MAX_POS_ASSET_BYTES = 900 * 1024;

type UploadPosAssetInput = {
  buffer: Buffer;
  contentType: string;
  fileName?: string;
  folder: string;
};

function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

function safeSegment(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "asset"
  );
}

export function parseDataUrlImage(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/i.exec(dataUrl.trim());

  if (!match) {
    return null;
  }

  return {
    buffer: Buffer.from(match[2], "base64"),
    contentType: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase()
  };
}

export async function ensurePosAssetsBucket(supabase: SupabaseClient) {
  const { error } = await supabase.storage.createBucket(POS_ASSETS_BUCKET, {
    public: false
  });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error;
  }
}

export async function uploadPrivatePosAsset(supabase: SupabaseClient, input: UploadPosAssetInput) {
  await ensurePosAssetsBucket(supabase);

  if (!input.contentType.startsWith("image/")) {
    throw new Error("Only image uploads are allowed.");
  }

  if (input.buffer.byteLength > MAX_POS_ASSET_BYTES) {
    throw new Error("Image is too large for POS storage. Compress it and try again.");
  }

  const extension = extensionForContentType(input.contentType);
  const baseName = safeSegment(input.fileName?.replace(/\.[^.]+$/, "") ?? "image");
  const safeFolder = input.folder
    .split("/")
    .map((segment) => safeSegment(segment))
    .filter(Boolean)
    .join("/");
  const path = `${safeFolder}/${Date.now()}-${baseName}.${extension}`;
  const { error } = await supabase.storage.from(POS_ASSETS_BUCKET).upload(path, input.buffer, {
    contentType: input.contentType,
    upsert: false
  });

  if (error) {
    throw error;
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(POS_ASSETS_BUCKET)
    .createSignedUrl(path, SIGNED_IMAGE_URL_TTL_SECONDS);

  if (signedUrlError || !data?.signedUrl) {
    throw signedUrlError ?? new Error("Unable to create a signed image URL.");
  }

  return {
    bucket: POS_ASSETS_BUCKET,
    path,
    url: data.signedUrl
  };
}

export function getPrivatePosAssetPathFromUrl(urlOrPath: string) {
  const value = urlOrPath.trim();

  if (!value) {
    return null;
  }

  if (!/^https?:\/\//i.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const marker = `/storage/v1/object/sign/${POS_ASSETS_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

export async function deletePrivatePosAsset(supabase: SupabaseClient, urlOrPath: string) {
  const path = getPrivatePosAssetPathFromUrl(urlOrPath);

  if (!path) {
    return { deleted: false, path: null };
  }

  const { error } = await supabase.storage.from(POS_ASSETS_BUCKET).remove([path]);

  if (error) {
    throw error;
  }

  return { deleted: true, path };
}

export async function uploadDataUrlPosAsset(
  supabase: SupabaseClient,
  dataUrl: string | undefined,
  input: Omit<UploadPosAssetInput, "buffer" | "contentType">
) {
  if (!dataUrl?.startsWith("data:image/")) {
    return dataUrl?.trim() || undefined;
  }

  const parsed = parseDataUrlImage(dataUrl);

  if (!parsed) {
    return dataUrl;
  }

  const optimized = await optimizePosImage(parsed.buffer, { width: 800, height: 800 }, 220 * 1024);

  const uploaded = await uploadPrivatePosAsset(supabase, {
    ...input,
    buffer: optimized.buffer,
    contentType: optimized.contentType
  });

  return uploaded.url;
}
