"use client";

type NativeFilePayload = {
  base64: string;
  fileName: string;
  mimeType: string;
};

type NativePrintHtmlPayload = {
  fileName: string;
  html: string;
};

type NativeResult = {
  ok?: boolean;
  message?: string;
};

type DesktopNativeBridge = {
  downloadFile?: (payload: NativeFilePayload) => Promise<NativeResult>;
  platform?: string;
  printReceiptHtml?: (payload: NativePrintHtmlPayload) => Promise<NativeResult>;
};

type CapacitorNativeBridge = {
  Plugins?: {
    SposNative?: {
      downloadFile?: (payload: NativeFilePayload) => Promise<NativeResult>;
      printReceiptHtml?: (payload: NativePrintHtmlPayload) => Promise<NativeResult>;
    };
  };
};

declare global {
  interface Window {
    Capacitor?: CapacitorNativeBridge;
    sposNative?: DesktopNativeBridge;
  }
}

function getNativeBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.sposNative) {
    return {
      downloadFile: window.sposNative.downloadFile,
      printReceiptHtml: window.sposNative.printReceiptHtml
    };
  }

  const capacitorPlugin = window.Capacitor?.Plugins?.SposNative;

  if (capacitorPlugin) {
    return {
      downloadFile: capacitorPlugin.downloadFile,
      printReceiptHtml: capacitorPlugin.printReceiptHtml
    };
  }

  return null;
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}

export function hasNativeDownloadSupport() {
  return Boolean(getNativeBridge()?.downloadFile);
}

export async function saveBlobWithNative(blob: Blob, fileName: string) {
  const bridge = getNativeBridge();

  if (!bridge?.downloadFile) {
    return false;
  }

  const result = await bridge.downloadFile({
    base64: await blobToBase64(blob),
    fileName,
    mimeType: blob.type || "application/octet-stream"
  });

  return result?.ok !== false;
}

function getDocumentHeadMarkup() {
  if (typeof document === "undefined") {
    return "";
  }

  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => {
      if (node instanceof HTMLLinkElement) {
        return `<link rel="stylesheet" href="${node.href}">`;
      }

      return node instanceof HTMLStyleElement ? `<style>${node.textContent ?? ""}</style>` : "";
    })
    .join("\n");
}

export function buildPrintableHtmlFromElement(element: HTMLElement, title: string) {
  const direction = document.documentElement.dir || "ltr";
  const language = document.documentElement.lang || "en";

  return `<!doctype html>
<html lang="${language}" dir="${direction}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  ${getDocumentHeadMarkup()}
  <style>
    html, body { margin: 0; background: #ffffff; }
    body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; }
  </style>
</head>
<body>
  ${element.outerHTML}
</body>
</html>`;
}

export async function printElementWithNative(selector: string, title: string) {
  const bridge = getNativeBridge();

  if (!bridge?.printReceiptHtml || typeof document === "undefined") {
    return false;
  }

  const element = document.querySelector(selector);

  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const result = await bridge.printReceiptHtml({
    fileName: `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "receipt"}.html`,
    html: buildPrintableHtmlFromElement(element, title)
  });

  return result?.ok !== false;
}
