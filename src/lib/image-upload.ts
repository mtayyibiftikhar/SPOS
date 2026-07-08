type ResizeImageOptions = {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  outputType?: "image/jpeg" | "image/png" | "image/webp";
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

    const scale = Math.min(1, options.maxWidth / naturalWidth, options.maxHeight / naturalHeight);
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
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

    context.drawImage(image, 0, 0, width, height);

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
