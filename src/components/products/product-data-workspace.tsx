"use client";

import { Fragment, useRef, useState, type InputHTMLAttributes } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Pencil,
  Upload,
  type LucideIcon
} from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { downloadCsv, normalizeCsvHeader, parseCsv } from "@/lib/csv";
import { normalizeBarcode, normalizeSpreadsheetBarcode, unwrapSpreadsheetText } from "@/lib/catalog";
import { hasShopPermission } from "@/lib/access-control";
import {
  applyProductImportDefaults,
  downloadProductImportWorkbook,
  PRODUCT_IMPORT_HEADERS,
  type ProductImportWorkbookRow,
  readProductImportWorkbook
} from "@/lib/product-import-workbook";
import type { Product, ProductCategory } from "@/types/pos";

const HEADERS = PRODUCT_IMPORT_HEADERS;

type ProductCsvRow = ProductImportWorkbookRow;
type PreviewRow = {
  line: number;
  data: ProductCsvRow;
  errors: string[];
  barcodes: string[];
};

type PreviewDraft = Pick<PreviewRow, "line" | "data">;

function booleanValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function nonNegativeNumber(value: string) {
  const result = Number(value);
  return value.trim() !== "" && Number.isFinite(result) && result >= 0 ? result : null;
}

function nonNegativeInteger(value: string) {
  const result = Number(value);
  return value.trim() !== "" && Number.isInteger(result) && result >= 0 ? result : null;
}

function strictBarcode(value: string) {
  return normalizeSpreadsheetBarcode(value);
}

function splitBarcodes(primary: string, additional: string) {
  return [unwrapSpreadsheetText(primary), ...unwrapSpreadsheetText(additional).split("|")]
    .map((value) => value.trim())
    .filter(Boolean);
}

function validatePreviewRows(rows: PreviewDraft[], products: Product[]): PreviewRow[] {
  const existingBarcodeOwners = new Set<string>();
  products.forEach((product) => {
    [product.barcode, ...(product.barcodes ?? [])].forEach((value) => {
      const barcode = normalizeBarcode(value);
      if (barcode) existingBarcodeOwners.add(barcode);
    });
  });

  const fileBarcodeOwners = new Map<string, number>();
  return rows.map((row) => {
    const data = applyProductImportDefaults(row.data);
    const errors: string[] = [];
    if (!data.english_name.trim()) errors.push("English name is required.");
    if (!(data.type === "product" || data.type === "service")) errors.push("Type must be product or service.");
    if (nonNegativeNumber(data.sale_price) === null) errors.push("Sale price must be zero or greater.");
    if (nonNegativeNumber(data.cost_price) === null) errors.push("Cost price must be zero or greater.");
    if (nonNegativeInteger(data.stock_quantity) === null) errors.push("Stock quantity must be a whole number of zero or greater.");
    if (nonNegativeInteger(data.reorder_level) === null) errors.push("Reorder level must be a whole number of zero or greater.");
    if (booleanValue(data.taxable) === null) errors.push("Taxable must be true or false.");
    if (booleanValue(data.quick_tab) === null) errors.push("Quick tab must be true or false.");
    if (!(data.status === "active" || data.status === "inactive")) errors.push("Status must be active or inactive.");

    const rawBarcodes = splitBarcodes(data.primary_barcode, data.additional_barcodes);
    const barcodes: string[] = [];
    rawBarcodes.forEach((rawBarcode) => {
      const barcode = strictBarcode(rawBarcode);
      if (!barcode) {
        errors.push(`Barcode ${rawBarcode} must contain 1 to 13 digits only.`);
        return;
      }
      if (barcodes.includes(barcode)) {
        errors.push(`Barcode ${barcode} is repeated in this row.`);
        return;
      }
      barcodes.push(barcode);
      if (existingBarcodeOwners.has(barcode)) errors.push(`Barcode ${barcode} already belongs to another product.`);
      const previousLine = fileBarcodeOwners.get(barcode);
      if (previousLine !== undefined && previousLine !== row.line) {
        errors.push(`Barcode ${barcode} is also used on line ${previousLine}.`);
      } else {
        fileBarcodeOwners.set(barcode, row.line);
      }
    });

    return { line: row.line, data, errors: Array.from(new Set(errors)), barcodes };
  });
}

function excelText(value: string) {
  return value ? `="${value.replace(/"/g, '""')}"` : "";
}

function productRows(products: Product[], categories: ProductCategory[]) {
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  return [
    [...HEADERS],
    ...products.map((product) => {
      const barcodes = Array.from(
        new Set([product.barcode, ...(product.barcodes ?? [])].filter((value): value is string => Boolean(value)))
      );
      return [
        product.name.en,
        product.name.ar,
        product.name.ur,
        product.kind,
        product.categoryId ? categoryById.get(product.categoryId) ?? "" : "",
        product.salePrice,
        product.costPrice,
        excelText(barcodes[0] ?? ""),
        excelText(barcodes.slice(1).join("|")),
        product.stockQuantity,
        product.reorderLevel,
        product.taxable,
        product.quickTab,
        product.status,
        product.imageUrl ?? ""
      ];
    })
  ];
}

export function ProductDataWorkspace() {
  const { currentSettings, currentShopId, importProducts: importProductBatch, session, state } = usePosApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const isAdmin = hasShopPermission(session, currentSettings?.pos, "products");
  const products = state.products.filter((product) => product.shopId === currentShopId);
  const categories = state.categories.filter((category) => category.shopId === currentShopId);
  const validRows = preview.filter((row) => row.errors.length === 0);
  const invalidRows = preview.length - validRows.length;

  const downloadTemplate = () => {
    downloadProductImportWorkbook();
  };

  const exportProducts = () => {
    downloadCsv("products.csv", productRows(products, categories));
    setMessage({ tone: "success", text: `${products.length} product and service records exported.` });
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    setMessage(null);
    setFileName(file.name);
    let rows: string[][];
    try {
      rows = file.name.toLowerCase().endsWith(".xlsx")
        ? readProductImportWorkbook(new Uint8Array(await file.arrayBuffer()))
        : parseCsv(await file.text());
    } catch (error) {
      setPreview([]);
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to read this product spreadsheet."
      });
      return;
    }
    if (rows.length < 2) {
      setPreview([]);
      setMessage({ tone: "error", text: "The CSV has no product rows." });
      return;
    }

    const headers = rows[0].map(normalizeCsvHeader);
    if (headers.length !== HEADERS.length || HEADERS.some((header, index) => headers[index] !== header)) {
      setPreview([]);
      setMessage({
        tone: "error",
        text: "The columns do not match the product template. Download the schema and keep its columns unchanged."
      });
      return;
    }

    const populatedRows = rows.slice(1).filter((values) => values.some((value) => value.trim() !== ""));
    if (!populatedRows.length) {
      setPreview([]);
      setMessage({ tone: "error", text: "The spreadsheet has no product rows." });
      return;
    }
    const drafts = populatedRows.map((values, rowIndex): PreviewDraft => {
      const data = Object.fromEntries(
        HEADERS.map((header, index) => [header, values[index]?.trim() ?? ""])
      ) as ProductCsvRow;
      return { line: rowIndex + 2, data };
    });
    const parsed = validatePreviewRows(drafts, products);

    setPreview(parsed);
    setMessage(
      parsed.some((row) => row.errors.length)
        ? { tone: "error", text: "Review the highlighted rows. Nothing has been imported yet." }
        : { tone: "success", text: `${parsed.length} rows validated and ready to import.` }
    );
  };

  const updatePreviewField = (line: number, field: keyof ProductCsvRow, value: string) => {
    const next = validatePreviewRows(
      preview.map((row) => ({
        line: row.line,
        data: row.line === line ? { ...row.data, [field]: value } : row.data
      })),
      products
    );
    setPreview(next);
    setMessage(
      next.some((row) => row.errors.length)
        ? { tone: "error", text: "Review the highlighted rows. Nothing has been imported yet." }
        : { tone: "success", text: `${next.length} rows validated and ready to import.` }
    );
  };

  const importProducts = () => {
    if (!isAdmin || preview.length === 0 || invalidRows > 0) return;
    const result = importProductBatch(preview.map((row) => {
      const isService = row.data.type === "service";
      return {
        line: row.line,
        categoryName: row.data.category,
        product: {
          kind: isService ? "service" as const : "product" as const,
          barcode: row.barcodes[0],
          barcodes: row.barcodes,
          name: { en: row.data.english_name, ar: row.data.arabic_name, ur: row.data.urdu_name },
          imageUrl: row.data.image_url,
          salePrice: Number(row.data.sale_price),
          costPrice: Number(row.data.cost_price),
          stockQuantity: isService ? 0 : Number(row.data.stock_quantity),
          reorderLevel: isService ? 0 : Number(row.data.reorder_level),
          taxable: booleanValue(row.data.taxable) ?? false,
          quickTab: booleanValue(row.data.quick_tab) ?? false,
          status: row.data.status === "inactive" ? "inactive" as const : "active" as const
        }
      };
    }));
    if (!result.ok) {
      setMessage({ tone: "error", text: `${result.message ?? "Unable to import products."} Nothing was imported.` });
      return;
    }

    const importedCount = result.importedCount ?? validRows.length;
    setPreview([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
    setMessage({ tone: "success", text: `${importedCount} product and service records imported successfully.` });
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-3">
        <DataAction
          icon={Download}
          title="Export product list"
          text="Download every product, service, category, price, status, and assigned barcode."
          action="Export products"
          onClick={exportProducts}
        />
        <DataAction
          icon={FileSpreadsheet}
          title="Download import schema"
        text="Excel dropdowns enforce product/service, true/false tax and quick-tab values, and active/inactive status. The POS assigns product IDs."
          action="Download schema"
          onClick={downloadTemplate}
        />
        <DataAction
          icon={Upload}
          title="Import product list"
          text="Preview and validate every row before products, services, categories, or barcodes are saved."
          action="Choose file"
          disabled={!isAdmin}
          onClick={() => fileRef.current?.click()}
        />
      </section>
      <input
        ref={fileRef}
        className="hidden"
        type="file"
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={(event) => void readFile(event.target.files?.[0])}
      />

      {message ? (
        <div
          className={`rounded-[22px] border px-4 py-3 text-sm font-semibold ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Product data preview</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">{fileName || "No file selected"}</h2>
          </div>
          {preview.length ? (
            <div className="flex gap-2 text-sm">
              <span className="rounded-full bg-emerald-50 px-3 py-2 font-semibold text-emerald-700">{validRows.length} ready</span>
              <span className="rounded-full bg-rose-50 px-3 py-2 font-semibold text-rose-700">{invalidRows} errors</span>
            </div>
          ) : null}
        </div>
        {preview.length ? (
          <>
            <div className="max-h-[430px] overflow-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="p-4">Line</th>
                    <th className="p-4">Product</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Barcodes</th>
                    <th className="p-4">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <Fragment key={row.line}>
                    <tr className="border-t border-slate-100 align-top">
                      <td className="p-4 font-semibold">{row.line}</td>
                      <td className="p-4">
                        <strong>{row.data.english_name || "Unnamed"}</strong>
                        <div className="text-xs text-slate-500">Create new - POS assigns the product ID</div>
                      </td>
                      <td className="p-4 capitalize">{row.data.type}</td>
                      <td className="p-4">{row.data.category || "No category"}</td>
                      <td className="p-4">{row.barcodes.length}</td>
                      <td className="p-4">
                        {row.errors.length ? (
                          <div className="space-y-1 text-rose-700">
                            {row.errors.map((error) => (
                              <div key={error} className="flex gap-2">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                {error}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-2 font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />Ready
                          </span>
                        )}
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingLine((current) => current === row.line ? null : row.line)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {editingLine === row.line ? "Close editor" : "Edit row"}
                        </Button>
                      </td>
                    </tr>
                    {editingLine === row.line ? (
                      <tr className="border-t border-emerald-100 bg-emerald-50/40">
                        <td colSpan={6} className="p-5">
                          <ProductImportRowEditor row={row} onChange={updatePreviewField} />
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-slate-200 p-5">
              <Button disabled={!isAdmin || invalidRows > 0} onClick={importProducts}>
                <Upload className="mr-2 h-4 w-4" />
                {invalidRows > 0 ? `Fix all ${invalidRows} invalid rows before import` : `Import all ${validRows.length} records`}
              </Button>
            </div>
          </>
        ) : (
          <div className="grid min-h-48 place-items-center p-8 text-center text-slate-500">
            <div><FileSpreadsheet className="mx-auto mb-3 h-8 w-8" /><p>Choose a completed product Excel or CSV file to validate every row here.</p></div>
          </div>
        )}
      </Card>
    </div>
  );
}

function ProductImportRowEditor({
  onChange,
  row
}: {
  onChange: (line: number, field: keyof ProductCsvRow, value: string) => void;
  row: PreviewRow;
}) {
  const field = (name: keyof ProductCsvRow, label: string, props?: InputHTMLAttributes<HTMLInputElement>) => (
    <label className="space-y-1.5 text-xs font-semibold text-slate-600">
      <span>{label}</span>
      <Input
        {...props}
        value={row.data[name]}
        onChange={(event) => onChange(row.line, name, event.target.value)}
      />
    </label>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-950">Edit spreadsheet line {row.line}</h3>
          <p className="text-xs text-slate-500">Changes are validated immediately and apply only to this import preview.</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${row.errors.length ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
          {row.errors.length ? `${row.errors.length} issue${row.errors.length === 1 ? "" : "s"} remaining` : "Ready to import"}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {field("english_name", "English name")}
        {field("arabic_name", "Arabic name (optional)", { dir: "rtl" })}
        {field("urdu_name", "Urdu name (optional)", { dir: "rtl" })}
        <label className="space-y-1.5 text-xs font-semibold text-slate-600">
          <span>Type</span>
          <Select value={row.data.type} onChange={(event) => onChange(row.line, "type", event.target.value)}>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </Select>
        </label>
        {field("category", "Category (defaults to General)")}
        {field("sale_price", "Sale price", { inputMode: "decimal" })}
        {field("cost_price", "Cost price", { inputMode: "decimal" })}
        {field("primary_barcode", "Primary barcode (optional)")}
        {field("additional_barcodes", "Additional barcodes (separate with |)")}
        {field("stock_quantity", "Stock quantity", { inputMode: "numeric" })}
        {field("reorder_level", "Reorder level", { inputMode: "numeric" })}
        <ImportSelect label="Taxable" value={row.data.taxable} onChange={(value) => onChange(row.line, "taxable", value)} options={["true", "false"]} />
        <ImportSelect label="Quick tab" value={row.data.quick_tab} onChange={(value) => onChange(row.line, "quick_tab", value)} options={["true", "false"]} />
        <ImportSelect label="Status" value={row.data.status} onChange={(value) => onChange(row.line, "status", value)} options={["active", "inactive"]} />
        {field("image_url", "Image URL (optional)")}
      </div>
    </div>
  );
}

function ImportSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="space-y-1.5 text-xs font-semibold text-slate-600">
      <span>{label}</span>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {!options.includes(value) ? <option value={value}>Select a value</option> : null}
        {options.map((option) => <option key={option} value={option} className="capitalize">{option}</option>)}
      </Select>
    </label>
  );
}

function DataAction({
  action,
  disabled,
  icon: Icon,
  onClick,
  text,
  title
}: {
  action: string;
  disabled?: boolean;
  icon: LucideIcon;
  onClick: () => void;
  text: string;
  title: string;
}) {
  return (
    <Card className="flex min-h-56 flex-col p-5">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></div>
      <h2 className="mt-5 text-xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{text}</p>
      <Button className="mt-5 w-full" variant="secondary" disabled={disabled} onClick={onClick}>{action}</Button>
    </Card>
  );
}
