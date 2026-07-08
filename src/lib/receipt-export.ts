import type { Bill, BillItem, BrandProfile, POSSettings, ReceiptSettings, ReceiptSize, Shop, User } from "@/types/pos";
import { buildQrCodeImageUrl } from "@/lib/qr-code";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type TextAlign = "left" | "center" | "right";

type PdfTextElement = {
  type: "text";
  text: string;
  align?: TextAlign;
  bold?: boolean;
  size?: number;
  spacingAfter?: number;
};

type PdfPairElement = {
  type: "pair";
  label: string;
  value: string;
  labelBold?: boolean;
  valueBold?: boolean;
  size?: number;
  spacingAfter?: number;
};

type PdfRuleElement = {
  type: "rule";
  spacingAfter?: number;
  spacingBefore?: number;
};

type PdfElement = PdfTextElement | PdfPairElement | PdfRuleElement;

type PdfBinaryPart = string | Uint8Array;

type PreparedImageAsset = {
  bytes: Uint8Array;
  displayHeight: number;
  displayWidth: number;
  imageHeight: number;
  imageWidth: number;
};

export type ReceiptPdfDocument = {
  fileName: string;
  receiptSize: ReceiptSize;
  headerLines: string[];
  logoUrl?: string;
  ownerLogoUrl?: string;
  ownerImprintLines?: string[];
  qrCodeUrl?: string;
  elements: PdfElement[];
};

const paymentMethodLabels = {
  cash: "Cash",
  card: "Card",
  account: "Account / Pay later"
} as const;

const billStatusLabels = {
  draft: "Draft",
  paid: "Paid",
  due: "Due",
  cancelled: "Cancelled",
  refunded: "Refunded"
} as const;

function sanitizePdfText(value?: string) {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function mmToPoints(value: number) {
  return value * 2.8346456693;
}

function getPageWidth(receiptSize: ReceiptSize) {
  if (receiptSize === "58mm") {
    return mmToPoints(58);
  }

  if (receiptSize === "80mm") {
    return mmToPoints(80);
  }

  return 595.28;
}

function getMargins(receiptSize: ReceiptSize) {
  if (receiptSize === "a4") {
    return { horizontal: 42, vertical: 48 };
  }

  return { horizontal: 14, vertical: 18 };
}

function getMaxCharsPerLine(receiptSize: ReceiptSize, fontSize: number) {
  const pageWidth = getPageWidth(receiptSize);
  const { horizontal } = getMargins(receiptSize);
  const availableWidth = pageWidth - horizontal * 2;
  const averageCharacterWidth = fontSize * 0.54;

  return Math.max(14, Math.floor(availableWidth / averageCharacterWidth));
}

function wrapText(value: string, maxChars: number) {
  const cleaned = sanitizePdfText(value);

  if (!cleaned) {
    return [];
  }

  if (cleaned.length <= maxChars) {
    return [cleaned];
  }

  const words = cleaned.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    if (word.length <= maxChars) {
      current = word;
      continue;
    }

    let remaining = word;

    while (remaining.length > maxChars) {
      lines.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }

    current = remaining;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function formatAmount(value: number, currency: string) {
  return formatCurrency(value, currency, "en");
}

function estimateTextWidth(text: string, size: number) {
  return sanitizePdfText(text).length * size * 0.52;
}

function appendWrappedText(
  target: PdfElement[],
  value: string,
  options: Omit<PdfTextElement, "text" | "type">,
  receiptSize: ReceiptSize
) {
  const size = options.size ?? 10;
  const wrapped = wrapText(value, getMaxCharsPerLine(receiptSize, size));

  wrapped.forEach((line, index) => {
    target.push({
      type: "text",
      ...options,
      text: line,
      spacingAfter: index === wrapped.length - 1 ? options.spacingAfter : 4
    });
  });
}

function appendPair(
  target: PdfElement[],
  label: string,
  value: string,
  options: Omit<PdfPairElement, "type" | "label" | "value"> = {}
) {
  target.push({
    type: "pair",
    label,
    value,
    ...options
  });
}

function appendRule(
  target: PdfElement[],
  options: Omit<PdfRuleElement, "type"> = {}
) {
  target.push({
    type: "rule",
    spacingBefore: options.spacingBefore ?? 0,
    spacingAfter: options.spacingAfter ?? 8
  });
}

function getReceiptFontSizes(receiptSize: ReceiptSize) {
  if (receiptSize === "a4") {
    return {
      sectionTitle: 10,
      storeMeta: 11,
      storeTitle: 23
    };
  }

  return {
    sectionTitle: 10,
    storeMeta: 9.2,
    storeTitle: 18
  };
}

function getLogoDisplayBounds(receiptSize: ReceiptSize, contentWidth: number) {
  if (receiptSize === "a4") {
    return { maxHeight: 86, maxWidth: 170 };
  }

  return {
    maxHeight: 54,
    maxWidth: Math.min(contentWidth * 0.68, 118)
  };
}

function getQrDisplayBounds(receiptSize: ReceiptSize) {
  if (receiptSize === "a4") {
    return { maxHeight: 110, maxWidth: 110 };
  }

  return { maxHeight: 84, maxWidth: 84 };
}

function getOwnerLogoDisplayBounds(receiptSize: ReceiptSize, contentWidth: number) {
  if (receiptSize === "a4") {
    return { maxHeight: 48, maxWidth: 130 };
  }

  return {
    maxHeight: 28,
    maxWidth: Math.min(contentWidth * 0.48, 82)
  };
}

function base64ToUint8Array(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function loadReceiptImageAsset(
  imageUrl: string | undefined,
  bounds: {
    maxHeight: number;
    maxWidth: number;
  }
): Promise<PreparedImageAsset | null> {
  if (!imageUrl || typeof window === "undefined" || typeof Image === "undefined" || typeof document === "undefined") {
    return null;
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";

    image.onload = () => {
      const naturalWidth = image.naturalWidth || 0;
      const naturalHeight = image.naturalHeight || 0;

      if (!naturalWidth || !naturalHeight) {
        resolve(null);
        return;
      }

      const scale = Math.min(
        bounds.maxWidth / naturalWidth,
        bounds.maxHeight / naturalHeight,
        1
      );
      const scaledWidth = Math.max(1, Math.round(naturalWidth * scale));
      const scaledHeight = Math.max(1, Math.round(naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        resolve(null);
        return;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, scaledWidth, scaledHeight);
      context.drawImage(image, 0, 0, scaledWidth, scaledHeight);

      try {
        const jpegUrl = canvas.toDataURL("image/jpeg", 0.92);
        const base64 = jpegUrl.split(",")[1];

        if (!base64) {
          resolve(null);
          return;
        }

        resolve({
          bytes: base64ToUint8Array(base64),
          displayHeight: scaledHeight,
          displayWidth: scaledWidth,
          imageHeight: scaledHeight,
          imageWidth: scaledWidth
        });
      } catch {
        resolve(null);
      }
    };

    image.onerror = () => resolve(null);
    image.src = imageUrl;
  });
}

export function buildReceiptFileName(receiptNumber: string) {
  const slug = receiptNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return `${slug || "receipt"}.pdf`;
}

export function buildReceiptPdfDocument({
  bill,
  items,
  shop,
  cashier,
  posSettings,
  receiptSettings,
  brand
}: {
  bill: Bill;
  items: BillItem[];
  shop: Shop | null;
  cashier: User | null;
  posSettings: POSSettings | undefined;
  receiptSettings: ReceiptSettings | undefined;
  brand?: BrandProfile;
}) {
  const currency = shop?.currency ?? "SAR";
  const receiptSize = receiptSettings?.receiptSize ?? "80mm";
  const elements: PdfElement[] = [];

  const headerLines = [
    sanitizePdfText(posSettings?.shopName ?? shop?.name ?? "Simple POS"),
    sanitizePdfText(posSettings?.address ?? shop?.address),
    sanitizePdfText(posSettings?.phone ?? shop?.phone)
  ].filter(Boolean);

  appendRule(elements, { spacingAfter: 10 });
  appendPair(elements, "Receipt", bill.number, { valueBold: true, size: 10, spacingAfter: 4 });
  appendPair(elements, "Date", formatDateTime(bill.createdAt, "en"), { size: 9.5, spacingAfter: 4 });

  if (receiptSettings?.showCashier) {
    appendPair(
      elements,
      "Cashier",
      sanitizePdfText(cashier?.name) || "Not available",
      { size: 9.5, spacingAfter: 4 }
    );
  }

  appendPair(
    elements,
    "Payment",
    paymentMethodLabels[bill.paymentMethod],
    { size: 9.5, spacingAfter: 4 }
  );
  appendPair(elements, "Status", billStatusLabels[bill.status], { size: 9.5, spacingAfter: 8 });

  if (receiptSettings?.showVatNumber && posSettings?.vatNumber) {
    appendPair(
      elements,
      "VAT No.",
      sanitizePdfText(posSettings.vatNumber),
      { size: 9.5, spacingAfter: 8 }
    );
  }

  if (receiptSettings?.showCustomer) {
    const customerLines = [
      sanitizePdfText(bill.customerName || "Walk-in Customer"),
      sanitizePdfText(bill.customerPhone ? `Phone ${bill.customerPhone}` : undefined),
      sanitizePdfText(bill.customerEmail ? `Email ${bill.customerEmail}` : undefined),
      sanitizePdfText(bill.customerWhatsapp ? `WhatsApp ${bill.customerWhatsapp}` : undefined)
    ].filter(Boolean);

    if (customerLines.length > 0) {
      appendRule(elements, { spacingAfter: 8 });

      elements.push({
        type: "text",
        text: "Customer",
        bold: true,
        size: 10,
        spacingAfter: 4
      });

      customerLines.forEach((line, index) => {
        appendWrappedText(
          elements,
          line,
          { spacingAfter: index === customerLines.length - 1 ? 8 : 4, size: 9.5 },
          receiptSize
        );
      });
    }
  }

  appendRule(elements, { spacingAfter: 8 });
  elements.push({
    type: "text",
    text: "Items",
    bold: true,
    size: 10,
    spacingAfter: 6
  });

  items.forEach((item, index) => {
    const productName =
      sanitizePdfText(item.productName.en || item.productName.ar || item.productName.ur || "Item") || "Item";

    appendWrappedText(elements, productName, { bold: true, size: 10.2, spacingAfter: 4 }, receiptSize);
    appendPair(
      elements,
      `Qty ${item.quantity} x ${formatAmount(item.unitPrice, currency)}`,
      formatAmount(item.lineTotal, currency),
      { size: 9, spacingAfter: item.discountAmount > 0 ? 5 : 11 }
    );
    if (item.discountAmount > 0) {
      appendPair(
        elements,
        "Item discount",
        `-${formatAmount(item.discountAmount, currency)}`,
        { size: 8.5, spacingAfter: 11 }
      );
    }

    if (index < items.length - 1) {
      appendRule(elements, { spacingBefore: 1, spacingAfter: 8 });
    }
  });

  appendRule(elements, { spacingAfter: 8 });
  appendPair(elements, "Subtotal", formatAmount(bill.subtotal, currency), { size: 9.5, spacingAfter: 4 });
  if ((bill.itemDiscountAmount ?? 0) > 0) {
    appendPair(elements, "Item discounts", `-${formatAmount(bill.itemDiscountAmount ?? 0, currency)}`, { size: 9.5, spacingAfter: 4 });
  }
  appendPair(elements, "Discount", formatAmount(bill.discountAmount, currency), { size: 9.5, spacingAfter: 4 });

  if (receiptSettings?.showTax) {
    appendPair(elements, bill.taxName || "Tax", formatAmount(bill.taxAmount, currency), { size: 9.5, spacingAfter: 4 });
  }

  appendPair(elements, "Total", formatAmount(bill.total, currency), {
    size: 11,
    labelBold: true,
    valueBold: true,
    spacingAfter: 5
  });
  appendPair(elements, "Paid", formatAmount(bill.paidAmount, currency), { size: 9.5, spacingAfter: 4 });
  appendPair(elements, "Due", formatAmount(bill.dueAmount, currency), { size: 9.5, spacingAfter: 8 });

  if (receiptSettings?.footerText) {
    appendRule(elements, { spacingAfter: 8 });
    appendWrappedText(
      elements,
      receiptSettings.footerText,
      {
        align: "center",
        size: 9,
        spacingAfter: 0
      },
      receiptSize
    );
  }

  const ownerImprintLines =
    brand?.receiptImprintEnabled
      ? [
          sanitizePdfText(brand.receiptImprintText || `Powered by ${brand.companyName}`),
          sanitizePdfText(brand.companyName),
          sanitizePdfText(brand.website),
          sanitizePdfText(brand.address),
          sanitizePdfText(brand.supportPhone ? `Support ${brand.supportPhone}` : undefined)
        ].filter(Boolean)
      : [];

  return {
    fileName: buildReceiptFileName(bill.number),
    receiptSize,
    headerLines,
    logoUrl: posSettings?.logoUrl,
    ownerLogoUrl: ownerImprintLines.length > 0 ? brand?.logoUrl : undefined,
    ownerImprintLines,
    qrCodeUrl: buildQrCodeImageUrl(posSettings?.receiptQrUrl, receiptSize === "a4" ? 156 : 116),
    elements
  } satisfies ReceiptPdfDocument;
}

function getElementHeight(element: PdfElement) {
  if (element.type === "rule") {
    return (element.spacingBefore ?? 0) + 1 + (element.spacingAfter ?? 0);
  }

  return (element.size ?? 10) + (element.spacingAfter ?? 4);
}

function renderPdfText(
  commands: string[],
  text: string,
  x: number,
  y: number,
  size: number,
  font: "F1" | "F2"
) {
  commands.push(`BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`);
}

function createPdfContent(
  document: ReceiptPdfDocument,
  assets: {
    logoAsset: PreparedImageAsset | null;
    ownerLogoAsset: PreparedImageAsset | null;
    qrAsset: PreparedImageAsset | null;
  }
) {
  const pageWidth = getPageWidth(document.receiptSize);
  const margins = getMargins(document.receiptSize);
  const contentWidth = pageWidth - margins.horizontal * 2;
  const fontSizes = getReceiptFontSizes(document.receiptSize);
  const storeName = document.headerLines[0] ?? "Simple POS";
  const storeNameLines = wrapText(storeName, getMaxCharsPerLine(document.receiptSize, fontSizes.storeTitle));
  const storeMetaLines = document.headerLines
    .slice(1)
    .flatMap((line) => wrapText(line, getMaxCharsPerLine(document.receiptSize, fontSizes.storeMeta)));
  const headerHeight =
    (assets.logoAsset ? assets.logoAsset.displayHeight + 24 : 0) +
    storeNameLines.length * (fontSizes.storeTitle + 4) +
    storeMetaLines.length * (fontSizes.storeMeta + 4) +
    14;
  const sectionHeight = document.elements.reduce((sum, element) => sum + getElementHeight(element), 0);
  const qrHeight = assets.qrAsset ? assets.qrAsset.displayHeight + 26 : 0;
  const ownerImprintLineCount = document.ownerImprintLines?.length ?? 0;
  const ownerImprintHeight =
    ownerImprintLineCount > 0
      ? (assets.ownerLogoAsset ? assets.ownerLogoAsset.displayHeight + 8 : 0) + ownerImprintLineCount * 12 + 16
      : 0;
  const pageHeight = Math.max(
    document.receiptSize === "a4" ? 842 : 380,
    margins.vertical * 2 + headerHeight + sectionHeight + qrHeight + ownerImprintHeight + 18
  );

  const commands: string[] = [];
  let y = pageHeight - margins.vertical;

  if (assets.logoAsset) {
    const logoX = margins.horizontal + Math.max(0, (contentWidth - assets.logoAsset.displayWidth) / 2);
    const logoY = y - assets.logoAsset.displayHeight;
    commands.push(
      `q ${assets.logoAsset.displayWidth.toFixed(2)} 0 0 ${assets.logoAsset.displayHeight.toFixed(2)} ${logoX.toFixed(2)} ${logoY.toFixed(2)} cm /Im1 Do Q`
    );
    y = logoY - 24;
  }

  storeNameLines.forEach((line) => {
    const widthEstimate = estimateTextWidth(line, fontSizes.storeTitle);
    const x = margins.horizontal + Math.max(0, (contentWidth - widthEstimate) / 2);
    renderPdfText(commands, line, x, y, fontSizes.storeTitle, "F2");
    y -= fontSizes.storeTitle + 4;
  });

  storeMetaLines.forEach((line) => {
    const widthEstimate = estimateTextWidth(line, fontSizes.storeMeta);
    const x = margins.horizontal + Math.max(0, (contentWidth - widthEstimate) / 2);
    renderPdfText(commands, line, x, y, fontSizes.storeMeta, "F1");
    y -= fontSizes.storeMeta + 4;
  });

  if (document.headerLines.length > 0 || assets.logoAsset) {
    y -= 6;
  }

  for (const element of document.elements) {
    if (element.type === "rule") {
      y -= element.spacingBefore ?? 0;
      commands.push(
        `0.84 G 0.75 w ${margins.horizontal.toFixed(2)} ${y.toFixed(2)} m ${(pageWidth - margins.horizontal).toFixed(2)} ${y.toFixed(2)} l S 0 G`
      );
      y -= 1 + (element.spacingAfter ?? 0);
      continue;
    }

    if (element.type === "pair") {
      const size = element.size ?? 10;
      const label = sanitizePdfText(element.label);
      const value = sanitizePdfText(element.value);
      const labelWidth = estimateTextWidth(label, size);
      const valueWidth = estimateTextWidth(value, size);
      const combinedWidth = labelWidth + valueWidth + 14;

      renderPdfText(commands, label, margins.horizontal, y, size, element.labelBold ? "F2" : "F1");

      if (combinedWidth > contentWidth) {
        y -= size + 2;
        const valueX = pageWidth - margins.horizontal - valueWidth;
        renderPdfText(commands, value, valueX, y, size, element.valueBold ? "F2" : "F1");
        y -= size + (element.spacingAfter ?? 4);
        continue;
      }

      const valueX = pageWidth - margins.horizontal - valueWidth;
      renderPdfText(commands, value, valueX, y, size, element.valueBold ? "F2" : "F1");
      y -= size + (element.spacingAfter ?? 4);
      continue;
    }

    const size = element.size ?? 10;
    const font = element.bold ? "F2" : "F1";
    const widthEstimate = estimateTextWidth(element.text, size);
    let x = margins.horizontal;

    if (element.align === "center") {
      x = margins.horizontal + Math.max(0, (contentWidth - widthEstimate) / 2);
    }

    if (element.align === "right") {
      x = pageWidth - margins.horizontal - widthEstimate;
    }

    renderPdfText(commands, element.text, x, y, size, font);
    y -= size + (element.spacingAfter ?? 4);
  }

  if (assets.qrAsset) {
    const caption = "Shop QR";
    const captionWidth = estimateTextWidth(caption, 9);
    const captionX = margins.horizontal + Math.max(0, (contentWidth - captionWidth) / 2);
    renderPdfText(commands, caption, captionX, y - 2, 9, "F2");
    y -= 16;

    const qrX = margins.horizontal + Math.max(0, (contentWidth - assets.qrAsset.displayWidth) / 2);
    const qrY = y - assets.qrAsset.displayHeight;
    commands.push(
      `q ${assets.qrAsset.displayWidth.toFixed(2)} 0 0 ${assets.qrAsset.displayHeight.toFixed(2)} ${qrX.toFixed(2)} ${qrY.toFixed(2)} cm /Im2 Do Q`
    );
    y = qrY - 14;
  }

  if (document.ownerImprintLines?.length) {
    commands.push(
      `0.84 G 0.65 w ${margins.horizontal.toFixed(2)} ${y.toFixed(2)} m ${(pageWidth - margins.horizontal).toFixed(2)} ${y.toFixed(2)} l S 0 G`
    );
    y -= 12;

    if (assets.ownerLogoAsset) {
      const logoX = margins.horizontal + Math.max(0, (contentWidth - assets.ownerLogoAsset.displayWidth) / 2);
      const logoY = y - assets.ownerLogoAsset.displayHeight;
      commands.push(
        `q ${assets.ownerLogoAsset.displayWidth.toFixed(2)} 0 0 ${assets.ownerLogoAsset.displayHeight.toFixed(2)} ${logoX.toFixed(2)} ${logoY.toFixed(2)} cm /Im3 Do Q`
      );
      y = logoY - 12;
    }

    document.ownerImprintLines.forEach((line, index) => {
      const size = index === 0 ? 8.5 : 7.8;
      const widthEstimate = estimateTextWidth(line, size);
      const x = margins.horizontal + Math.max(0, (contentWidth - widthEstimate) / 2);
      renderPdfText(commands, line, x, y, size, index === 0 ? "F2" : "F1");
      y -= size + 3;
    });
  }

  return {
    content: commands.join("\n"),
    pageWidth,
    pageHeight
  };
}

function toBytes(part: PdfBinaryPart, encoder: TextEncoder) {
  return typeof part === "string" ? encoder.encode(part) : part;
}

export async function createReceiptPdfBlob(document: ReceiptPdfDocument) {
  const encoder = new TextEncoder();
  const pageWidth = getPageWidth(document.receiptSize);
  const contentWidth = pageWidth - getMargins(document.receiptSize).horizontal * 2;
  const logoAsset = await loadReceiptImageAsset(
    document.logoUrl,
    getLogoDisplayBounds(document.receiptSize, contentWidth)
  );
  const qrAsset = await loadReceiptImageAsset(
    document.qrCodeUrl,
    getQrDisplayBounds(document.receiptSize)
  );
  const ownerLogoAsset = await loadReceiptImageAsset(
    document.ownerLogoUrl,
    getOwnerLogoDisplayBounds(document.receiptSize, contentWidth)
  );
  const { content, pageHeight } = createPdfContent(document, {
    logoAsset,
    ownerLogoAsset,
    qrAsset
  });
  const contentBytes = encoder.encode(content);
  let nextImageObjectNumber = 7;
  const xObjectEntries = [
    logoAsset ? `/Im1 ${nextImageObjectNumber++} 0 R` : null,
    qrAsset ? `/Im2 ${nextImageObjectNumber++} 0 R` : null,
    ownerLogoAsset ? `/Im3 ${nextImageObjectNumber++} 0 R` : null
  ].filter(Boolean);
  const pageResources = xObjectEntries.length > 0
    ? `<< /Font << /F1 4 0 R /F2 5 0 R >> /XObject << ${xObjectEntries.join(" ")} >> >>`
    : "<< /Font << /F1 4 0 R /F2 5 0 R >> >>";
  const objects: PdfBinaryPart[][] = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources ${pageResources} /Contents 6 0 R >>`
    ],
    ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
    ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"],
    [`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes, "\nendstream"]
  ];

  if (logoAsset) {
    objects.push([
      `<< /Type /XObject /Subtype /Image /Width ${logoAsset.imageWidth} /Height ${logoAsset.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoAsset.bytes.length} >>\nstream\n`,
      logoAsset.bytes,
      "\nendstream"
    ]);
  }

  if (qrAsset) {
    objects.push([
      `<< /Type /XObject /Subtype /Image /Width ${qrAsset.imageWidth} /Height ${qrAsset.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${qrAsset.bytes.length} >>\nstream\n`,
      qrAsset.bytes,
      "\nendstream"
    ]);
  }

  if (ownerLogoAsset) {
    objects.push([
      `<< /Type /XObject /Subtype /Image /Width ${ownerLogoAsset.imageWidth} /Height ${ownerLogoAsset.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${ownerLogoAsset.bytes.length} >>\nstream\n`,
      ownerLogoAsset.bytes,
      "\nendstream"
    ]);
  }

  const chunks: Uint8Array[] = [];
  const offsets = [0];
  const fileHeader = encoder.encode("%PDF-1.4\n");
  let byteOffset = fileHeader.length;
  chunks.push(fileHeader);

  objects.forEach((object, index) => {
    offsets.push(byteOffset);

    const objectHeader = encoder.encode(`${index + 1} 0 obj\n`);
    chunks.push(objectHeader);
    byteOffset += objectHeader.length;

    object.forEach((part) => {
      const bytes = toBytes(part, encoder);
      chunks.push(bytes);
      byteOffset += bytes.length;
    });

    const objectFooter = encoder.encode("\nendobj\n");
    chunks.push(objectFooter);
    byteOffset += objectFooter.length;
  });

  const xrefOffset = byteOffset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";

  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
  }

  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encoder.encode(xref));

  const blobParts: BlobPart[] = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy;
  });

  return new Blob(blobParts, { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export async function shareBlobFile(blob: Blob, fileName: string, title: string, text: string) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof File === "undefined") {
    return false;
  }

  const file = new File([blob], fileName, {
    type: "application/pdf"
  });

  if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
    return false;
  }

  await navigator.share({
    title,
    text,
    files: [file]
  });

  return true;
}

export function buildMailtoLink({
  email,
  subject,
  body
}: {
  email: string;
  subject: string;
  body: string;
}) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildWhatsAppLink({
  phone,
  message
}: {
  phone: string;
  message: string;
}) {
  const digits = phone.replace(/\D/g, "");

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
