import type { SalesReportSummary } from "@/lib/refunds";
import { hasNativeDownloadSupport, saveBlobWithNative } from "@/lib/native-bridge";
import { formatCurrency } from "@/lib/utils";

type PdfBinaryPart = string | Uint8Array;

type PreparedImageAsset = {
  bytes: Uint8Array;
  displayHeight: number;
  displayWidth: number;
  imageHeight: number;
  imageWidth: number;
};

export type ProfitLossPdfLabels = {
  title: string;
  subtitle: string;
  shopName: string;
  businessDate: string;
  generatedAt: string;
  currency: string;
  summarySection: string;
  salesSection: string;
  profitSection: string;
  paymentSection: string;
  volumeSection: string;
  grossSales: string;
  refunds: string;
  returnsFromPreviousDays: string;
  sameDayReturns: string;
  netSales: string;
  expenses: string;
  grossProfit: string;
  profitAdjustments: string;
  netProfit: string;
  cashSales: string;
  cardSales: string;
  accountSales: string;
  cashRefunds: string;
  cardRefunds: string;
  accountRefunds: string;
  billCount: string;
  refundCount: string;
};

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

function estimateTextWidth(text: string, size: number) {
  return sanitizePdfText(text).length * size * 0.52;
}

function base64ToUint8Array(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function loadImageAsset(
  imageUrl: string | undefined,
  maxWidth: number,
  maxHeight: number
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

      const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
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

function slugifyFilePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toAmount(value: number, currency: string) {
  return formatCurrency(value, currency, "en");
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

function renderCenteredText(
  commands: string[],
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  font: "F1" | "F2"
) {
  const textWidth = estimateTextWidth(text, size);
  const textX = x + Math.max(0, (width - textWidth) / 2);
  renderPdfText(commands, text, textX, y, size, font);
}

function drawFilledRect(commands: string[], x: number, y: number, width: number, height: number, rgb: [number, number, number]) {
  commands.push(`q ${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`);
}

function drawStrokedRect(commands: string[], x: number, y: number, width: number, height: number, rgb: [number, number, number], lineWidth = 1) {
  commands.push(`q ${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} RG ${lineWidth.toFixed(2)} w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S Q`);
}

function drawSummaryCard(
  commands: string[],
  {
    label,
    value,
    x,
    y,
    width,
    height
  }: {
    label: string;
    value: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }
) {
  drawFilledRect(commands, x, y, width, height, [0.965, 0.98, 0.972]);
  drawStrokedRect(commands, x, y, width, height, [0.80, 0.91, 0.84], 0.9);
  drawFilledRect(commands, x, y + height - 6, width, 6, [0.063, 0.725, 0.506]);
  renderPdfText(commands, sanitizePdfText(label), x + 14, y + height - 22, 10, "F1");
  renderPdfText(commands, sanitizePdfText(value), x + 14, y + 18, 19, "F2");
}

function drawSection(
  commands: string[],
  {
    title,
    rows,
    x,
    y,
    width,
    height
  }: {
    title: string;
    rows: StructuredReportRow[];
    x: number;
    y: number;
    width: number;
    height: number;
  }
) {
  drawFilledRect(commands, x, y, width, height, [1, 1, 1]);
  drawStrokedRect(commands, x, y, width, height, [0.82, 0.87, 0.90], 0.9);
  drawFilledRect(commands, x, y + height - 36, width, 36, [0.91, 0.98, 0.95]);
  drawFilledRect(commands, x, y + height - 36, 5, 36, [0.063, 0.725, 0.506]);
  renderPdfText(commands, sanitizePdfText(title), x + 18, y + height - 24, 13.5, "F2");

  let rowY = y + height - 48;

  rows.forEach((row, index) => {
    const isLast = index === rows.length - 1;
    const rowStep = row.detail ? 32 : 24;

    renderPdfText(commands, sanitizePdfText(row.label), x + 18, rowY, 10.5, "F1");
    const valueWidth = estimateTextWidth(row.value, 10.8);
    renderPdfText(commands, sanitizePdfText(row.value), x + width - 18 - valueWidth, rowY, 10.8, "F2");

    if (row.detail) {
      renderPdfText(commands, sanitizePdfText(row.detail), x + 18, rowY - 13, 8.7, "F1");
    }

    if (!isLast) {
      const dividerY = rowY - (row.detail ? 18 : 8);
      commands.push(`0.90 G 0.55 w ${(x + 18).toFixed(2)} ${dividerY.toFixed(2)} m ${(x + width - 18).toFixed(2)} ${dividerY.toFixed(2)} l S 0 G`);
    }

    rowY -= rowStep;
  });
}

function toBytes(part: PdfBinaryPart, encoder: TextEncoder) {
  return typeof part === "string" ? encoder.encode(part) : part;
}

export function buildProfitLossFileName(shopName: string, businessDate: string) {
  const slug = slugifyFilePart(shopName) || "shop";
  return `profit-loss-${businessDate}-${slug}.pdf`;
}

export async function createProfitLossPdfBlob({
  businessDate,
  currency,
  generatedAt,
  labels,
  logoUrl,
  shopName,
  summary
}: {
  businessDate: string;
  currency: string;
  generatedAt: string;
  labels: ProfitLossPdfLabels;
  logoUrl?: string;
  shopName: string;
  summary: SalesReportSummary;
}) {
  const encoder = new TextEncoder();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const logoAsset = await loadImageAsset(logoUrl, 164, 72);
  const commands: string[] = [];

  drawFilledRect(commands, 0, 0, pageWidth, pageHeight, [1, 1, 1]);

  let cursorY = pageHeight - 56;

  if (logoAsset) {
    const logoX = margin + (contentWidth - logoAsset.displayWidth) / 2;
    const logoY = cursorY - logoAsset.displayHeight;
    commands.push(
      `q ${logoAsset.displayWidth.toFixed(2)} 0 0 ${logoAsset.displayHeight.toFixed(2)} ${logoX.toFixed(2)} ${logoY.toFixed(2)} cm /Im1 Do Q`
    );
    cursorY = logoY - 30;
  }

  renderCenteredText(commands, sanitizePdfText(shopName) || "Simple POS", margin, cursorY, contentWidth, 24, "F2");
  cursorY -= 24;
  renderCenteredText(commands, sanitizePdfText(labels.title), margin, cursorY, contentWidth, 16, "F2");
  cursorY -= 20;
  renderCenteredText(commands, sanitizePdfText(labels.subtitle), margin, cursorY, contentWidth, 10.5, "F1");
  cursorY -= 22;
  renderCenteredText(
    commands,
    `${sanitizePdfText(labels.businessDate)}: ${sanitizePdfText(businessDate)}`,
    margin,
    cursorY,
    contentWidth,
    10,
    "F1"
  );
  cursorY -= 16;
  renderCenteredText(
    commands,
    `${sanitizePdfText(labels.generatedAt)}: ${sanitizePdfText(generatedAt)}    ${sanitizePdfText(labels.currency)}: ${sanitizePdfText(currency)}`,
    margin,
    cursorY,
    contentWidth,
    10,
    "F1"
  );

  cursorY -= 36;

  const cardGap = 14;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cardHeight = 72;
  const firstRowY = cursorY - cardHeight;
  const secondRowY = firstRowY - 12 - cardHeight;

  drawSummaryCard(commands, {
    label: labels.grossSales,
    value: toAmount(summary.grossSales, currency),
    x: margin,
    y: firstRowY,
    width: cardWidth,
    height: cardHeight
  });
  drawSummaryCard(commands, {
    label: labels.netSales,
    value: toAmount(summary.netSales, currency),
    x: margin + cardWidth + cardGap,
    y: firstRowY,
    width: cardWidth,
    height: cardHeight
  });
  drawSummaryCard(commands, {
    label: labels.grossProfit,
    value: toAmount(summary.grossProfit, currency),
    x: margin,
    y: secondRowY,
    width: cardWidth,
    height: cardHeight
  });
  drawSummaryCard(commands, {
    label: labels.netProfit,
    value: toAmount(summary.netProfit, currency),
    x: margin + cardWidth + cardGap,
    y: secondRowY,
    width: cardWidth,
    height: cardHeight
  });

  cursorY = secondRowY - 24;

  const topSectionHeight = 138;
  const fullSectionGap = 16;

  drawSection(commands, {
    title: labels.salesSection,
    x: margin,
    y: cursorY - topSectionHeight,
    width: cardWidth,
    height: topSectionHeight,
    rows: [
      { label: labels.grossSales, value: toAmount(summary.grossSales, currency) },
      { label: labels.refunds, value: toAmount(-summary.refunds, currency) },
      { label: labels.netSales, value: toAmount(summary.netSales, currency) }
    ]
  });
  drawSection(commands, {
    title: labels.profitSection,
    x: margin + cardWidth + cardGap,
    y: cursorY - topSectionHeight,
    width: cardWidth,
    height: topSectionHeight,
    rows: [
      { label: labels.grossProfit, value: toAmount(summary.grossProfit, currency) },
      { label: labels.profitAdjustments, value: toAmount(-summary.profitAdjustments, currency) },
      { label: labels.expenses, value: toAmount(-summary.expenses, currency) },
      { label: labels.netProfit, value: toAmount(summary.netProfit, currency) }
    ]
  });

  cursorY -= topSectionHeight + fullSectionGap;

  drawSection(commands, {
    title: labels.paymentSection,
    x: margin,
    y: cursorY - 176,
    width: contentWidth,
    height: 176,
    rows: [
      { label: labels.cashSales, value: toAmount(summary.cashSales, currency) },
      { label: labels.cardSales, value: toAmount(summary.cardSales, currency) },
      { label: labels.accountSales, value: toAmount(summary.accountSales, currency) },
      { label: labels.cashRefunds, value: toAmount(-summary.cashRefunds, currency) },
      { label: labels.cardRefunds, value: toAmount(-summary.cardRefunds, currency) },
      { label: labels.accountRefunds, value: toAmount(-summary.accountRefunds, currency) }
    ]
  });

  cursorY -= 176 + fullSectionGap;

  drawSection(commands, {
    title: labels.volumeSection,
    x: margin,
    y: cursorY - 132,
    width: contentWidth,
    height: 132,
    rows: [
      { label: labels.billCount, value: String(summary.billCount) },
      { label: labels.refundCount, value: String(summary.refundCount) },
      { label: labels.returnsFromPreviousDays, value: toAmount(-summary.returnsFromPreviousDays, currency) },
      { label: labels.sameDayReturns, value: toAmount(-summary.sameDayReturns, currency) }
    ]
  });

  const content = commands.join("\n");
  const contentBytes = encoder.encode(content);
  const pageResources = logoAsset
    ? "<< /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 7 0 R >> >>"
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

export type StructuredReportRow = {
  detail?: string;
  label: string;
  value: string;
};

export type StructuredReportSection = {
  title: string;
  rows: StructuredReportRow[];
};

function getStructuredSectionHeight(rows: StructuredReportRow[]) {
  return Math.max(82, 48 + rows.reduce((sum, row) => sum + (row.detail ? 32 : 24), 0));
}

export async function createStructuredReportPdfBlob({
  generatedAt,
  logoUrl,
  period,
  sections,
  shopName,
  subtitle,
  title
}: {
  generatedAt: string;
  logoUrl?: string;
  period: string;
  sections: StructuredReportSection[];
  shopName: string;
  subtitle: string;
  title: string;
}) {
  const encoder = new TextEncoder();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const logoAsset = await loadImageAsset(logoUrl, 118, 58);
  const pages: string[][] = [];
  let commands: string[] = [];
  let cursorY = pageHeight - 52;

  const beginPage = (isFirstPage: boolean) => {
    commands = [];
    drawFilledRect(commands, 0, 0, pageWidth, pageHeight, [0.963, 0.973, 0.968]);
    drawFilledRect(commands, 0, pageHeight - 18, pageWidth, 18, [0.063, 0.725, 0.506]);

    const headerHeight = isFirstPage ? 118 : 88;
    const headerY = pageHeight - 34 - headerHeight;
    drawFilledRect(commands, margin, headerY, contentWidth, headerHeight, [1, 1, 1]);
    drawStrokedRect(commands, margin, headerY, contentWidth, headerHeight, [0.82, 0.87, 0.90], 0.9);
    drawFilledRect(commands, margin, headerY + headerHeight - 8, contentWidth, 8, [0.91, 0.98, 0.95]);

    const textStartX = logoAsset ? margin + 20 + logoAsset.displayWidth + 18 : margin + 22;
    const headerTextY = headerY + headerHeight - 38;

    if (logoAsset) {
      const logoX = margin + 20;
      const logoY = headerY + headerHeight - 24 - logoAsset.displayHeight;
      commands.push(
        `q ${logoAsset.displayWidth.toFixed(2)} 0 0 ${logoAsset.displayHeight.toFixed(2)} ${logoX.toFixed(2)} ${logoY.toFixed(2)} cm /Im1 Do Q`
      );
    }

    renderPdfText(commands, sanitizePdfText(shopName) || "Simple POS", textStartX, headerTextY, isFirstPage ? 19 : 15, "F2");
    renderPdfText(commands, sanitizePdfText(title), textStartX, headerTextY - (isFirstPage ? 22 : 18), isFirstPage ? 13.5 : 11.5, "F2");

    if (isFirstPage) {
      renderPdfText(commands, sanitizePdfText(subtitle), textStartX, headerTextY - 40, 9.5, "F1");
    }

    const metaX = margin + contentWidth - 188;
    renderPdfText(
      commands,
      "REPORT PERIOD",
      metaX,
      headerY + headerHeight - 36,
      8,
      "F2"
    );
    renderPdfText(
      commands,
      sanitizePdfText(period),
      metaX,
      headerY + headerHeight - 50,
      9.5,
      "F1"
    );
    renderPdfText(
      commands,
      "GENERATED",
      metaX,
      headerY + headerHeight - 70,
      8,
      "F2"
    );
    renderPdfText(
      commands,
      sanitizePdfText(generatedAt),
      metaX,
      headerY + headerHeight - 84,
      9.5,
      "F1"
    );

    cursorY = headerY - 24;
  };

  const commitPage = () => {
    pages.push(commands);
  };

  beginPage(true);

  sections.forEach((section) => {
    let remainingRows = section.rows.length > 0 ? [...section.rows] : [{ label: "-", value: "-" }];
    let sectionPart = 0;

    while (remainingRows.length > 0) {
      const chunk: StructuredReportRow[] = [];

      while (remainingRows.length > 0 && chunk.length < 12) {
        const candidate = [...chunk, remainingRows[0]];
        const candidateHeight = getStructuredSectionHeight(candidate);

        if (chunk.length > 0 && cursorY - candidateHeight < 54) {
          break;
        }

        chunk.push(remainingRows.shift()!);
      }

      const sectionHeight = getStructuredSectionHeight(chunk);

      if (cursorY - sectionHeight < 54) {
        remainingRows = [...chunk, ...remainingRows];
        commitPage();
        beginPage(false);
        continue;
      }

      drawSection(commands, {
        title: sectionPart === 0 ? section.title : `${section.title} (continued)`,
        rows: chunk,
        x: margin,
        y: cursorY - sectionHeight,
        width: contentWidth,
        height: sectionHeight
      });

      sectionPart += 1;
      cursorY -= sectionHeight + 14;
    }
  });

  commitPage();

  pages.forEach((pageCommands, index) => {
    const footer = `Page ${index + 1} of ${pages.length}`;
    renderPdfText(pageCommands, sanitizePdfText(footer), margin, 26, 9, "F1");
    const rightText = sanitizePdfText("Generated by Simple POS");
    renderPdfText(pageCommands, rightText, pageWidth - margin - estimateTextWidth(rightText, 9), 26, 9, "F1");
  });

  const pageContents = pages.map((pageCommands) => encoder.encode(pageCommands.join("\n")));
  const pageCount = pageContents.length;
  const fontRegularObjectId = 3 + pageCount;
  const fontBoldObjectId = 4 + pageCount;
  const contentStartObjectId = 5 + pageCount;
  const imageObjectId = logoAsset ? 5 + pageCount * 2 : null;
  const pageResources = logoAsset
    ? `<< /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> /XObject << /Im1 ${imageObjectId} 0 R >> >>`
    : `<< /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> >>`;
  const pageKids = Array.from({ length: pageCount }, (_, index) => `${3 + index} 0 R`).join(" ");
  const objects: PdfBinaryPart[][] = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    [`<< /Type /Pages /Kids [${pageKids}] /Count ${pageCount} >>`]
  ];

  pageContents.forEach((_, index) => {
    objects.push([
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources ${pageResources} /Contents ${contentStartObjectId + index} 0 R >>`
    ]);
  });

  objects.push(["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]);
  objects.push(["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"]);

  pageContents.forEach((contentBytes) => {
    objects.push([`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes, "\nendstream"]);
  });

  if (logoAsset) {
    objects.push([
      `<< /Type /XObject /Subtype /Image /Width ${logoAsset.imageWidth} /Height ${logoAsset.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoAsset.bytes.length} >>\nstream\n`,
      logoAsset.bytes,
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
  if (hasNativeDownloadSupport()) {
    void saveBlobWithNative(blob, fileName);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
