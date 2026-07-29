"use client";

type NativeFilePayload = {
  base64: string;
  fileName: string;
  mimeType: string;
};

type NativePrintHtmlPayload = {
  deviceName?: string;
  fileName: string;
  html: string;
  receiptSize?: "58mm" | "80mm" | "a4";
  silent?: boolean;
};

type NativeResult = {
  ok?: boolean;
  message?: string;
  printers?: NativePrinter[];
};

export type NativePrinter = {
  description?: string;
  displayName?: string;
  isDefault?: boolean;
  name: string;
  status?: number;
};

type DesktopNativeBridge = {
  downloadFile?: (payload: NativeFilePayload) => Promise<NativeResult>;
  getPrinters?: () => Promise<NativeResult>;
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
      getPrinters: window.sposNative.getPrinters,
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

export function hasNativePrinterSupport() {
  return Boolean(getNativeBridge()?.getPrinters);
}

export async function getInstalledPrinters() {
  const bridge = getNativeBridge();

  if (!bridge?.getPrinters) {
    return [] as NativePrinter[];
  }

  const result = await bridge.getPrinters();

  return result?.ok === false ? [] : result?.printers ?? [];
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

export function buildPrintableHtmlFromElement(
  element: HTMLElement,
  title: string,
  receiptSize: "58mm" | "80mm" | "a4" = "80mm"
) {
  const direction = document.documentElement.dir || "ltr";
  const language = document.documentElement.lang || "en";
  const pageSize = receiptSize === "a4" ? "A4" : `${receiptSize} 300mm`;
  const contentWidth = receiptSize === "a4" ? "210mm" : receiptSize;

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
    @page { size: ${pageSize}; margin: 0; }
    #receipt-print-area, #printer-test-receipt {
      box-sizing: border-box;
      margin: 0 auto !important;
      max-width: ${contentWidth} !important;
      width: ${contentWidth} !important;
    }
  </style>
</head>
<body>
  ${element.outerHTML}
</body>
</html>`;
}

export async function printElementWithNative(
  selector: string,
  title: string,
  options?: {
    deviceName?: string;
    receiptSize?: "58mm" | "80mm" | "a4";
    silent?: boolean;
  }
) {
  const bridge = getNativeBridge();

  if (!bridge?.printReceiptHtml || typeof document === "undefined") {
    return false;
  }

  const element = document.querySelector(selector);

  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const result = await bridge.printReceiptHtml({
    deviceName: options?.deviceName,
    fileName: `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "receipt"}.html`,
    html: buildPrintableHtmlFromElement(element, title, options?.receiptSize),
    receiptSize: options?.receiptSize,
    silent: options?.silent
  });

  return result?.ok !== false;
}
