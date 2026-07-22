"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  type LucideIcon
} from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { downloadCsv, normalizeCsvHeader, parseCsv } from "@/lib/csv";
import { normalizeBarcode } from "@/lib/catalog";
import type { Product, ProductCategory } from "@/types/pos";

const HEADERS = [
  "product_id",
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

type ProductCsvRow = Record<(typeof HEADERS)[number], string>;
type PreviewRow = {
  line: number;
  data: ProductCsvRow;
  errors: string[];
  product?: Product;
  barcodes: string[];
};

function booleanValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
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
  const candidate = value.trim();
  return /^\d{1,13}$/.test(candidate) ? normalizeBarcode(candidate) : undefined;
}

function splitBarcodes(primary: string, additional: string) {
  return [primary, ...additional.split("|")].map((value) => value.trim()).filter(Boolean);
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
        product.id,
        product.name.en,
        product.name.ar,
        product.name.ur,
        product.kind,
        product.categoryId ? categoryById.get(product.categoryId) ?? "" : "",
        product.salePrice,
        product.costPrice,
        barcodes[0] ?? "",
        barcodes.slice(1).join("|"),
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
  const { addCategory, currentShopId, saveProduct, session, state } = usePosApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const isAdmin = session?.role === "shop_admin";
  const products = state.products.filter((product) => product.shopId === currentShopId);
  const categories = state.categories.filter((category) => category.shopId === currentShopId);
  const validRows = preview.filter((row) => row.errors.length === 0);
  const invalidRows = preview.length - validRows.length;

  const downloadTemplate = () => {
    downloadCsv("product-import-template.csv", [
      [...HEADERS],
      [
        "",
        "Sample coffee",
        "",
        "",
        "product",
        "Drinks",
        12,
        6,
        "6281234567890",
        "6281234567891|6281234567892",
        20,
        5,
        true,
        true,
        "active",
        ""
      ]
    ]);
  };

  const exportProducts = () => {
    downloadCsv("products.csv", productRows(products, categories));
    setMessage({ tone: "success", text: `${products.length} product and service records exported.` });
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    setMessage(null);
    setFileName(file.name);
    const rows = parseCsv(await file.text());
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

    const existingBarcodeOwners = new Map<string, string>();
    products.forEach((product) => {
      [product.barcode, ...(product.barcodes ?? [])].forEach((value) => {
        const barcode = normalizeBarcode(value);
        if (barcode) existingBarcodeOwners.set(barcode, product.id);
      });
    });

    const fileBarcodeOwners = new Map<string, number>();
    const fileProductOwners = new Map<string, number>();
    const parsed = rows.slice(1).map((values, rowIndex): PreviewRow => {
      const data = Object.fromEntries(
        HEADERS.map((header, index) => [header, values[index]?.trim() ?? ""])
      ) as ProductCsvRow;
      const errors: string[] = [];
      const product = data.product_id ? products.find((entry) => entry.id === data.product_id) : undefined;

      if (values.length !== HEADERS.length) errors.push(`Expected ${HEADERS.length} columns but found ${values.length}.`);
      if (data.product_id && !product) errors.push("Product ID does not belong to this shop.");
      if (data.product_id) {
        const previousLine = fileProductOwners.get(data.product_id);
        if (previousLine !== undefined) errors.push(`Product ID is repeated on line ${previousLine}.`);
        else fileProductOwners.set(data.product_id, rowIndex + 2);
      }
      if (!data.english_name) errors.push("English name is required.");
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
        const existingOwner = existingBarcodeOwners.get(barcode);
        if (existingOwner && existingOwner !== product?.id) {
          errors.push(`Barcode ${barcode} already belongs to another product.`);
        }
        const previousLine = fileBarcodeOwners.get(barcode);
        if (previousLine !== undefined && previousLine !== rowIndex + 2) {
          errors.push(`Barcode ${barcode} is also used on line ${previousLine}.`);
        } else {
          fileBarcodeOwners.set(barcode, rowIndex + 2);
        }
      });

      return { line: rowIndex + 2, data, errors: Array.from(new Set(errors)), product, barcodes };
    });

    setPreview(parsed);
    setMessage(
      parsed.some((row) => row.errors.length)
        ? { tone: "error", text: "Review the highlighted rows. Nothing has been imported yet." }
        : { tone: "success", text: `${parsed.length} rows validated and ready to import.` }
    );
  };

  const importProducts = () => {
    if (!isAdmin || preview.length === 0 || invalidRows > 0) return;
    const categoryIds = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category.id]));

    for (const row of preview) {
      const categoryName = row.data.category.trim();
      let categoryId = categoryName ? categoryIds.get(categoryName.toLowerCase()) : undefined;
      if (categoryName && !categoryId) {
        const result = addCategory({ name: categoryName, description: "", imageUrl: "" });
        if (!result.ok || !result.categoryId) {
          setMessage({ tone: "error", text: result.message ?? `Unable to create category ${categoryName}.` });
          return;
        }
        categoryId = result.categoryId;
        categoryIds.set(categoryName.toLowerCase(), categoryId);
      }

      const isService = row.data.type === "service";
      const result = saveProduct({
        id: row.product?.id,
        kind: isService ? "service" : "product",
        categoryId,
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
        status: row.data.status === "inactive" ? "inactive" : "active"
      });
      if (!result.ok) {
        setMessage({ tone: "error", text: `Line ${row.line}: ${result.message ?? "Unable to import product."}` });
        return;
      }
    }

    const importedCount = validRows.length;
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
          text="Use this exact CSV structure. Separate additional barcodes with a vertical bar (|)."
          action="Download schema"
          onClick={downloadTemplate}
        />
        <DataAction
          icon={Upload}
          title="Import product list"
          text="Preview and validate every row before products, services, categories, or barcodes are saved."
          action="Choose CSV"
          disabled={!isAdmin}
          onClick={() => fileRef.current?.click()}
        />
      </section>
      <input
        ref={fileRef}
        className="hidden"
        type="file"
        accept=".csv,text/csv"
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
                    <tr key={row.line} className="border-t border-slate-100 align-top">
                      <td className="p-4 font-semibold">{row.line}</td>
                      <td className="p-4">
                        <strong>{row.data.english_name || "Unnamed"}</strong>
                        <div className="text-xs text-slate-500">{row.product ? "Update existing" : "Create new"}</div>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-slate-200 p-5">
              <Button disabled={!isAdmin || invalidRows > 0} onClick={importProducts}>
                <Upload className="mr-2 h-4 w-4" />Import {validRows.length} records
              </Button>
            </div>
          </>
        ) : (
          <div className="grid min-h-48 place-items-center p-8 text-center text-slate-500">
            <div><FileSpreadsheet className="mx-auto mb-3 h-8 w-8" /><p>Choose a completed product CSV to validate it here.</p></div>
          </div>
        )}
      </Card>
    </div>
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
