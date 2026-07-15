import "server-only";

import sharp from "sharp";

type ImageProfile = {
  height: number;
  width: number;
};

const allowedFormats = new Set(["jpeg", "png", "webp"]);

export async function optimizePosImage(buffer: Buffer, profile: ImageProfile, maxBytes: number) {
  const image = sharp(buffer, {
    failOn: "error",
    limitInputPixels: 40_000_000
  });
  const metadata = await image.metadata();

  if (!metadata.format || !allowedFormats.has(metadata.format)) {
    throw new Error("Use a valid JPG, PNG, or WebP image.");
  }

  const optimized = await image
    .rotate()
    .resize({
      width: profile.width,
      height: profile.height,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ effort: 4, quality: 82 })
    .toBuffer();

  if (optimized.byteLength > maxBytes) {
    throw new Error(`Image must be ${Math.round(maxBytes / 1024)} KB or smaller after optimization.`);
  }

  return {
    buffer: optimized,
    contentType: "image/webp"
  };
}
