type ResizeImageOptions = {
  maxWidth: number;
  maxHeight: number;
  paddingRatio?: number;
  quality?: number;
  outputType?: "image/jpeg" | "image/png" | "image/webp";
  trimWhitespace?: boolean;
};

type UploadImageAssetInput = {
  dataUrl: string;
  fileName?: string;
  ownerEmail?: string;
  productKey?: string;
  scope: "category" | "owner-ad" | "owner-login-hero" | "owner-logo" | "product" | "shop-logo";
  shopId?: string;
  userEmail?: string;
  userId?: string;
};

type UploadImageAssetResult = {
  bucket?: string;
  path?: string;
  storedInCloud: boolean;
  url: string;
};

export async function resizeImageFileToDataUrl(file: File, options: ResizeImageOptions) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose a valid image file.");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();

      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image could not be loaded. Try a JPG or PNG file."));
      element.src = objectUrl;
    });

    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;

    if (!naturalWidth || !naturalHeight) {
      throw new Error("This image has invalid dimensions.");
    }

    let cropX = 0;
    let cropY = 0;
    let cropWidth = naturalWidth;
    let cropHeight = naturalHeight;

    if (options.trimWhitespace) {
      const sourceCanvas = document.createElement("canvas");
      const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

      if (sourceContext) {
        sourceCanvas.width = naturalWidth;
        sourceCanvas.height = naturalHeight;
        sourceContext.drawImage(image, 0, 0);

        const pixels = sourceContext.getImageData(0, 0, naturalWidth, naturalHeight).data;
        let minX = naturalWidth;
        let minY = naturalHeight;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < naturalHeight; y += 1) {
          for (let x = 0; x < naturalWidth; x += 1) {
            const index = (y * naturalWidth + x) * 4;
            const alpha = pixels[index + 3];
            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            const isVisibleInk = alpha > 12 && !(red > 246 && green > 246 && blue > 246);

            if (isVisibleInk) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }

        if (maxX >= minX && maxY >= minY) {
          const contentWidth = maxX - minX + 1;
          const contentHeight = maxY - minY + 1;
          const padding = Math.round(Math.max(contentWidth, contentHeight) * (options.paddingRatio ?? 0.08));

          cropX = Math.max(0, minX - padding);
          cropY = Math.max(0, minY - padding);
          cropWidth = Math.min(naturalWidth - cropX, contentWidth + padding * 2);
          cropHeight = Math.min(naturalHeight - cropY, contentHeight + padding * 2);
        }
      }
    }

    const scale = Math.min(1, options.maxWidth / cropWidth, options.maxHeight / cropHeight);
    const width = Math.max(1, Math.round(cropWidth * scale));
    const height = Math.max(1, Math.round(cropHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Image processing is unavailable in this browser.");
    }

    canvas.width = width;
    canvas.height = height;

    if ((options.outputType ?? "image/jpeg") === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }

    context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);

    return {
      dataUrl: canvas.toDataURL(options.outputType ?? "image/jpeg", options.quality ?? 0.88),
      width,
      height,
      originalWidth: naturalWidth,
      originalHeight: naturalHeight
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, payload] = dataUrl.split(",");
  const mimeType = /data:([^;]+)/.exec(meta)?.[1] ?? "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

export async function uploadImageAssetToCloud(input: UploadImageAssetInput): Promise<UploadImageAssetResult> {
  try {
    const formData = new FormData();
    const blob = dataUrlToBlob(input.dataUrl);

    formData.append("file", blob, input.fileName || "image.jpg");
    formData.append("scope", input.scope);

    if (input.shopId) {
      formData.append("shopId", input.shopId);
    }

    if (input.fileName) {
      formData.append("fileName", input.fileName);
    }

    const headers: Record<string, string> = {};

    if (input.ownerEmail) headers["x-owner-email"] = input.ownerEmail;
    if (input.productKey) headers["x-product-key"] = input.productKey;
    if (input.shopId) headers["x-shop-id"] = input.shopId;
    if (input.userEmail) headers["x-user-email"] = input.userEmail;
    if (input.userId) headers["x-user-id"] = input.userId;

    const response = await fetch("/api/uploads", {
      method: "POST",
      headers,
      body: formData
    });
    const result = (await response.json()) as {
      bucket?: string;
      message?: string;
      ok: boolean;
      path?: string;
      url?: string;
    };

    if (!response.ok || !result.ok || !result.url) {
      throw new Error(result.message ?? "Cloud upload failed.");
    }

    return {
      bucket: result.bucket,
      path: result.path,
      storedInCloud: true,
      url: result.url
    };
  } catch (error) {
    const hostname = typeof window === "undefined" ? "" : window.location.hostname;
    const canUseLocalFallback =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    if (!canUseLocalFallback) {
      throw error instanceof Error ? error : new Error("Cloud upload failed.");
    }

    return {
      storedInCloud: false,
      url: input.dataUrl
    };
  }
}
