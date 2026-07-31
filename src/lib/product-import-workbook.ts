import { strToU8, unzipSync, zipSync } from "fflate";
import { toExactArrayBuffer } from "@/lib/binary-upload";

export const PRODUCT_IMPORT_HEADERS = [
  "english_name",
  "arabic_name",
  "urdu_name",
  "type",
  "category",
  "sale_price",
  "cost_price",
  "primary_barcode",
  "additional_barcodes",
  "stock_quantity",
  "reorder_level",
  "taxable",
  "quick_tab",
  "status",
  "image_url"
] as const;

const SAMPLE_ROW = [
  "Sample coffee", "", "", "product", "Drinks", "12", "6", "6281234567890",
  "6281234567891|6281234567892", "20", "5", "true", "true", "active", ""
];

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  return letters.split("").reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function inlineCell(reference: string, value: string, style = 0) {
  return `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t>${escapeXml(value)}</t></is></c>`;
}

function workbookFiles() {
  const headerCells = PRODUCT_IMPORT_HEADERS.map((header, index) => inlineCell(`${columnName(index)}1`, header, 1)).join("");
  const sampleCells = SAMPLE_ROW.map((value, index) => inlineCell(`${columnName(index)}2`, value, index === 7 || index === 8 ? 2 : 0)).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols><col min="1" max="3" width="20" customWidth="1"/><col min="4" max="5" width="16" customWidth="1"/><col min="6" max="7" width="14" customWidth="1"/><col min="8" max="9" width="24" style="2" customWidth="1"/><col min="10" max="15" width="16" customWidth="1"/></cols>
  <sheetData><row r="1">${headerCells}</row><row r="2">${sampleCells}</row></sheetData>
  <autoFilter ref="A1:O1001"/>
  <dataValidations count="4">
    <dataValidation type="list" allowBlank="0" showErrorMessage="1" errorStyle="stop" errorTitle="Invalid product type" error="Choose product or service from the list." sqref="D2:D1001"><formula1>&quot;product,service&quot;</formula1></dataValidation>
    <dataValidation type="list" allowBlank="0" showErrorMessage="1" errorStyle="stop" errorTitle="Invalid taxable value" error="Choose true or false from the list." sqref="L2:L1001"><formula1>&quot;true,false&quot;</formula1></dataValidation>
    <dataValidation type="list" allowBlank="0" showErrorMessage="1" errorStyle="stop" errorTitle="Invalid quick tab value" error="Choose true or false from the list." sqref="M2:M1001"><formula1>&quot;true,false&quot;</formula1></dataValidation>
    <dataValidation type="list" allowBlank="0" showErrorMessage="1" errorStyle="stop" errorTitle="Invalid status" error="Choose active or inactive from the list." sqref="N2:N1001"><formula1>&quot;active,inactive&quot;</formula1></dataValidation>
  </dataValidations>
</worksheet>`;

  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": sheet
  };
}

export function createProductImportWorkbook() {
  return zipSync(
    Object.fromEntries(Object.entries(workbookFiles()).map(([path, contents]) => [path, strToU8(contents)])),
    { level: 6 }
  );
}

function textFromXmlRuns(xml: string) {
  return Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), (match) => decodeXml(match[1])).join("");
}

export function readProductImportWorkbook(contents: Uint8Array) {
  const files = unzipSync(contents);
  const decoder = new TextDecoder();
  const sheetFile = files["xl/worksheets/sheet1.xml"];
  if (!sheetFile) throw new Error("The workbook does not contain a Products sheet.");

  const sharedStringsFile = files["xl/sharedStrings.xml"];
  const sharedStrings = sharedStringsFile
    ? Array.from(decoder.decode(sharedStringsFile).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g), (match) => textFromXmlRuns(match[1]))
    : [];
  const sheet = decoder.decode(sheetFile);
  const rows: string[][] = [];

  for (const rowMatch of sheet.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(rowMatch[1]);
    const row: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = attributes.match(/\br="([A-Z]+\d+)"/i)?.[1];
      if (!reference) continue;
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const value = type === "inlineStr"
        ? textFromXmlRuns(body)
        : type === "s"
          ? sharedStrings[Number(rawValue)] ?? ""
          : type === "b"
            ? rawValue === "1" ? "true" : "false"
            : decodeXml(rawValue);
      row[columnIndex(reference)] = value;
    }
    rows[rowNumber - 1] = row;
  }

  return rows.map((row) => Array.from({ length: PRODUCT_IMPORT_HEADERS.length }, (_, index) => row?.[index] ?? ""));
}

export function downloadProductImportWorkbook() {
  const blob = new Blob([toExactArrayBuffer(createProductImportWorkbook())], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "product-import-template.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}
