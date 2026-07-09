import type { LocalizedText, ReceiptSecondaryLanguage, ReceiptSettings, TextDirection } from "@/types/pos";

export type ReceiptItemNameLine = {
  direction: TextDirection;
  isSecondary: boolean;
  text: string;
};

function cleanName(value?: string) {
  return value?.trim() ?? "";
}

export function getReceiptSecondaryLanguage(receiptSettings?: ReceiptSettings): ReceiptSecondaryLanguage | null {
  if (!receiptSettings?.showSecondaryLanguage) {
    return null;
  }

  return receiptSettings.secondaryLanguage === "ur" ? "ur" : "ar";
}

export function getReceiptItemNameLines(
  productName: LocalizedText,
  receiptSettings?: ReceiptSettings
): ReceiptItemNameLine[] {
  const primaryName = cleanName(productName.en) || cleanName(productName.ar) || cleanName(productName.ur) || "Item";
  const secondaryLanguage = getReceiptSecondaryLanguage(receiptSettings);
  const secondaryName = secondaryLanguage ? cleanName(productName[secondaryLanguage]) : "";
  const lines: ReceiptItemNameLine[] = [
    {
      direction: "ltr",
      isSecondary: false,
      text: primaryName
    }
  ];

  if (secondaryName && secondaryName.toLocaleLowerCase() !== primaryName.toLocaleLowerCase()) {
    lines.push({
      direction: "rtl",
      isSecondary: true,
      text: secondaryName
    });
  }

  return lines;
}

export function getReceiptItemNameText(productName: LocalizedText, receiptSettings?: ReceiptSettings) {
  return getReceiptItemNameLines(productName, receiptSettings)
    .map((line) => line.text)
    .join(" / ");
}
