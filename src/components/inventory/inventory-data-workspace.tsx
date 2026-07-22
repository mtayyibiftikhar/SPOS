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
import { normalizeBarcode } from "@/lib/catalog";
import { downloadCsv, normalizeCsvHeader, parseCsv } from "@/lib/csv";
import type { Product, Supplier } from "@/types/pos";

const HEADERS = [
  "product_id",
  "match_barcode",
  "product_name",
  "counted_stock",
  "new_cost_price",
  "reorder_level",
  "supplier",
  "additional_barcodes",
  "note"
] as const;

type InventoryCsvRow = Record<(typeof HEADERS)[number], string>;
type PreviewRow = {
  line: number;
  data: InventoryCsvRow;
  product?: Product;
  supplier?: Supplier;
  countedStock: number | null;
  costPrice?: number;
  reorderLevel?: number;
  barcodes: string[];
  errors: string[];
};

function normalizedText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function optionalNonNegativeNumber(value: string) {
  if (!value.trim()) return undefined;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function requiredNonNegativeNumber(value: string) {
  const result = Number(value);
  return value.trim() !== "" && Number.isFinite(result) && result >= 0 ? result : null;
}

function optionalNonNegativeInteger(value: string) {
  if (!value.trim()) return undefined;
  const result = Number(value);
  return Number.isInteger(result) && result >= 0 ? result : null;
}

function strictBarcode(value: string) {
  const candidate = value.trim();
  return /^\d{1,13}$/.test(candidate) ? normalizeBarcode(candidate) : undefined;
}

function productBarcodes(product: Product) {
  return Array.from(
    new Set([product.barcode, ...(product.barcodes ?? [])].filter((value): value is string => Boolean(value)))
  );
}

export function InventoryDataWorkspace() {
  const { adjustInventory, currentShopId, saveProduct, session, state } = usePosApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const isAdmin = session?.role === "shop_admin";
  const products = state.products.filter(
    (product) => product.shopId === currentShopId && product.kind === "product"
  );
  const suppliers = state.suppliers.filter((supplier) => supplier.shopId === currentShopId);
  const adjustments = state.inventoryAdjustments.filter((entry) => entry.shopId === currentShopId);
  const validRows = preview.filter((row) => row.errors.length === 0);
  const invalidRows = preview.length - validRows.length;

  const latestSupplierByProduct = new Map<string, string>();
  [...adjustments]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .forEach((entry) => {
      if (entry.supplierId && !latestSupplierByProduct.has(entry.productId)) {
        latestSupplierByProduct.set(entry.productId, entry.supplierId);
      }
    });
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

  const exportInventory = () => {
    downloadCsv("inventory.csv", [
      [...HEADERS],
      ...products.map((product) => {
        const barcodes = productBarcodes(product);
        const supplier = supplierById.get(latestSupplierByProduct.get(product.id) ?? "");
        return [
          product.id,
          barcodes[0] ?? "",
          product.name.en,
          product.stockQuantity,
          product.costPrice,
          product.reorderLevel,
          supplier?.name ?? "",
          barcodes.slice(1).join("|"),
          ""
        ];
      })
    ]);
    setMessage({ tone: "success", text: `${products.length} physical inventory records exported.` });
  };

  const downloadTemplate = () => {
    downloadCsv("inventory-import-template.csv", [
      [...HEADERS],
      ["", "6281234567890", "Sample coffee", 24, 6.5, 5, "Main supplier", "6281234567891|6281234567892", "Stock count"]
    ]);
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    setMessage(null);
    setFileName(file.name);
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      setPreview([]);
      setMessage({ tone: "error", text: "The CSV has no inventory rows." });
      return;
    }

    const headers = rows[0].map(normalizeCsvHeader);
    if (headers.length !== HEADERS.length || HEADERS.some((header, index) => headers[index] !== header)) {
      setPreview([]);
      setMessage({
        tone: "error",
        text: "The columns do not match the inventory template. Download the schema and keep its columns unchanged."
      });
      return;
    }

    const productsById = new Map(products.map((product) => [product.id, product]));
    const productsByBarcode = new Map<string, Product>();
    const productsByName = new Map<string, Product[]>();
    products.forEach((product) => {
      productBarcodes(product).forEach((barcode) => productsByBarcode.set(barcode, product));
      [product.name.en, product.name.ar, product.name.ur].filter(Boolean).forEach((name) => {
        const key = normalizedText(name);
        productsByName.set(key, [...(productsByName.get(key) ?? []), product]);
      });
    });
    const suppliersByName = new Map(suppliers.map((supplier) => [normalizedText(supplier.name), supplier]));
    const fileProductLines = new Map<string, number>();
    const fileBarcodeLines = new Map<string, { line: number; productId?: string }>();

    const parsed = rows.slice(1).map((values, rowIndex): PreviewRow => {
      const line = rowIndex + 2;
      const data = Object.fromEntries(
        HEADERS.map((header, index) => [header, values[index]?.trim() ?? ""])
      ) as InventoryCsvRow;
      const errors: string[] = [];
      if (values.length !== HEADERS.length) errors.push(`Expected ${HEADERS.length} columns but found ${values.length}.`);

      const matchBarcode = data.match_barcode ? strictBarcode(data.match_barcode) : undefined;
      if (data.match_barcode && !matchBarcode) errors.push("Match barcode must contain 1 to 13 digits only.");

      let product = data.product_id ? productsById.get(data.product_id) : undefined;
      if (data.product_id && !product) errors.push("Product ID does not match a physical product in this shop.");
      const barcodeProduct = matchBarcode ? productsByBarcode.get(matchBarcode) : undefined;
      if (!product && barcodeProduct) product = barcodeProduct;
      if (product && barcodeProduct && barcodeProduct.id !== product.id) {
        errors.push("Product ID and match barcode identify different products.");
      }

      if (!product && data.product_name) {
        const nameMatches = productsByName.get(normalizedText(data.product_name)) ?? [];
        const uniqueMatches = Array.from(new Map(nameMatches.map((entry) => [entry.id, entry])).values());
        if (uniqueMatches.length === 1) product = uniqueMatches[0];
        else if (uniqueMatches.length > 1) errors.push("Product name is ambiguous. Add the product ID or barcode.");
      }
      if (!product) errors.push("No existing physical product matches this row.");
      if (product) {
        const previousLine = fileProductLines.get(product.id);
        if (previousLine !== undefined) errors.push(`This product is already included on line ${previousLine}.`);
        else fileProductLines.set(product.id, line);
      }

      const countedStock = requiredNonNegativeNumber(data.counted_stock);
      if (countedStock === null) errors.push("Counted stock must be zero or greater.");
      const costPrice = optionalNonNegativeNumber(data.new_cost_price);
      if (costPrice === null) errors.push("New cost price must be empty or zero and greater.");
      const reorderLevel = optionalNonNegativeInteger(data.reorder_level);
      if (reorderLevel === null) errors.push("Reorder level must be empty or a whole number of zero and greater.");

      const supplier = data.supplier ? suppliersByName.get(normalizedText(data.supplier)) : undefined;
      if (data.supplier && !supplier) errors.push("Supplier was not found. Create it in Suppliers before importing.");

      const currentBarcodes = product ? productBarcodes(product) : [];
      const rawBarcodes = [data.match_barcode, ...data.additional_barcodes.split("|")]
        .map((value) => value.trim())
        .filter(Boolean);
      const importedBarcodes: string[] = [];
      rawBarcodes.forEach((rawBarcode) => {
        const barcode = strictBarcode(rawBarcode);
        if (!barcode) {
          errors.push(`Barcode ${rawBarcode} must contain 1 to 13 digits only.`);
          return;
        }
        if (importedBarcodes.includes(barcode)) {
          errors.push(`Barcode ${barcode} is repeated in this row.`);
          return;
        }
        importedBarcodes.push(barcode);
        const owner = productsByBarcode.get(barcode);
        if (owner && owner.id !== product?.id) errors.push(`Barcode ${barcode} belongs to ${owner.name.en}.`);
        const fileOwner = fileBarcodeLines.get(barcode);
        if (fileOwner && fileOwner.line !== line && fileOwner.productId !== product?.id) {
          errors.push(`Barcode ${barcode} is also used on line ${fileOwner.line}.`);
        } else {
          fileBarcodeLines.set(barcode, { line, productId: product?.id });
        }
      });
      const barcodes = Array.from(new Set([...currentBarcodes, ...importedBarcodes]));

      return {
        line,
        data,
        product,
        supplier,
        countedStock,
        costPrice: costPrice ?? undefined,
        reorderLevel: reorderLevel ?? undefined,
        barcodes,
        errors: Array.from(new Set(errors))
      };
    });

    setPreview(parsed);
    setMessage(
      parsed.some((row) => row.errors.length)
        ? { tone: "error", text: "Review the highlighted rows. No stock has been changed." }
        : { tone: "success", text: `${parsed.length} inventory rows validated and ready to import.` }
    );
  };

  const importInventory = () => {
    if (!isAdmin || preview.length === 0 || invalidRows > 0) return;

    for (const row of preview) {
      if (!row.product || row.countedStock === null) continue;
      const difference = Math.round((row.countedStock - row.product.stockQuantity) * 100) / 100;
      if (difference !== 0) {
        const result = adjustInventory({
          productId: row.product.id,
          type: difference > 0 ? "add" : "remove",
          quantity: Math.abs(difference),
          reason: row.data.note || (difference > 0 ? "Inventory CSV restock" : "Inventory CSV count correction"),
          supplierId: difference > 0 ? row.supplier?.id : undefined,
          costPrice: difference > 0 ? row.costPrice : undefined
        });
        if (!result.ok) {
          setMessage({ tone: "error", text: `Line ${row.line}: ${result.message ?? "Unable to adjust inventory."}` });
          return;
        }
      }

      const saveResult = saveProduct({
        id: row.product.id,
        kind: "product",
        categoryId: row.product.categoryId,
        barcode: row.barcodes[0],
        barcodes: row.barcodes,
        name: row.product.name,
        imageUrl: row.product.imageUrl,
        salePrice: row.product.salePrice,
        costPrice: row.costPrice ?? row.product.costPrice,
        stockQuantity: row.countedStock,
        reorderLevel: row.reorderLevel ?? row.product.reorderLevel,
        expiryDate: row.product.expiryDate,
        taxable: row.product.taxable,
        quickTab: row.product.quickTab,
        status: row.product.status
      });
      if (!saveResult.ok) {
        setMessage({ tone: "error", text: `Line ${row.line}: ${saveResult.message ?? "Unable to save inventory details."}` });
        return;
      }
    }

    const importedCount = validRows.length;
    setPreview([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
    setMessage({ tone: "success", text: `${importedCount} inventory records imported with stock audit entries.` });
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-3">
        <DataAction
          icon={Download}
          title="Export inventory"
          text="Download physical products with counted stock, cost, reorder level, supplier, and every barcode."
          action="Export inventory"
          onClick={exportInventory}
        />
        <DataAction
          icon={FileSpreadsheet}
          title="Download inventory schema"
          text="Use the exact CSV template. Match by product ID, barcode, or an unambiguous exact product name."
          action="Download schema"
          onClick={downloadTemplate}
        />
        <DataAction
          icon={Upload}
          title="Import inventory count"
          text="Preview stock, costs, suppliers, reorder levels, and additional barcodes before audited changes are saved."
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Inventory import preview</p>
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
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="p-4">Line</th>
                    <th className="p-4">Product</th>
                    <th className="p-4">Current</th>
                    <th className="p-4">Counted</th>
                    <th className="p-4">Supplier</th>
                    <th className="p-4">Barcodes</th>
                    <th className="p-4">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.line} className="border-t border-slate-100 align-top">
                      <td className="p-4 font-semibold">{row.line}</td>
                      <td className="p-4"><strong>{row.product?.name.en || row.data.product_name || "Not matched"}</strong></td>
                      <td className="p-4">{row.product?.stockQuantity ?? "-"}</td>
                      <td className="p-4 font-semibold">{row.countedStock ?? "-"}</td>
                      <td className="p-4">{row.supplier?.name ?? (row.data.supplier || "Not assigned")}</td>
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
              <Button disabled={!isAdmin || invalidRows > 0} onClick={importInventory}>
                <Upload className="mr-2 h-4 w-4" />Import {validRows.length} inventory records
              </Button>
            </div>
          </>
        ) : (
          <div className="grid min-h-48 place-items-center p-8 text-center text-slate-500">
            <div><FileSpreadsheet className="mx-auto mb-3 h-8 w-8" /><p>Choose a completed inventory CSV to validate it here.</p></div>
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
