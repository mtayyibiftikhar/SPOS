"use client";

import { useRef, useState } from "react";
import { Cloud, Download, FileSpreadsheet, Upload } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Product } from "@/types/pos";

const productCsvColumns = [
  "kind",
  "category",
  "barcode",
  "name_en",
  "name_ar",
  "name_ur",
  "sale_price",
  "cost_price",
  "stock_quantity",
  "reorder_level",
  "expiry_date",
  "taxable",
  "quick_tab",
  "status"
] as const;

function downloadTextFile(content: string, fileName: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string | number | boolean | undefined) {
  const raw = String(value ?? "");

  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }

  return raw;
}

function buildCsv(rows: Array<Array<string | number | boolean | undefined>>) {
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(value.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value.trim());

  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function parseMoney(value: string | undefined) {
  const parsed = Number(value || 0);

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

function parseQuantity(value: string | undefined) {
  const parsed = Number(value || 0);

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

export default function BackupPage() {
  const { addCategory, currentShop, exportDataBackup, importDataBackup, saveProduct, state, t } = usePosApp();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const productImportRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const exportBackup = () => {
    const shopSlug =
      currentShop?.slug ||
      currentShop?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      "shop";
    const stamp = new Date().toISOString().slice(0, 10);

    downloadTextFile(exportDataBackup(), `simple-pos-backup-${shopSlug}-${stamp}.json`);
    setFeedback({ tone: "success", message: t("backup.exportSuccess") });
  };

  const exportProductsCsv = () => {
    if (!currentShop) {
      setFeedback({ tone: "error", message: "No active shop found." });
      return;
    }

    const shopProducts = state.products.filter((product) => product.shopId === currentShop.id);
    const categoryById = new Map(state.categories.filter((category) => category.shopId === currentShop.id).map((category) => [category.id, category.name]));
    const rows = [
      [...productCsvColumns],
      ...shopProducts.map((product) => [
        product.kind,
        product.categoryId ? categoryById.get(product.categoryId) ?? "" : "",
        product.barcode ?? "",
        product.name.en,
        product.name.ar,
        product.name.ur,
        product.salePrice,
        product.costPrice,
        product.stockQuantity,
        product.reorderLevel,
        product.expiryDate ?? "",
        product.taxable,
        product.quickTab,
        product.status
      ])
    ];
    const stamp = new Date().toISOString().slice(0, 10);

    downloadTextFile(buildCsv(rows), `simple-pos-products-${currentShop.slug || currentShop.id}-${stamp}.csv`, "text/csv");
    setFeedback({ tone: "success", message: `${shopProducts.length} products exported.` });
  };

  const downloadProductSchema = () => {
    const exampleRows = [
      [...productCsvColumns],
      ["product", "Drinks", "AUTO-OR-ENTER-BARCODE", "Karak Tea", "شاي كرك", "کڑک چائے", 5, 2, 100, 10, "2026-12-31", true, true, "active"],
      ["service", "Services", "", "Phone Setup", "إعداد الهاتف", "فون سیٹ اپ", 60, 0, 0, 0, "", true, true, "active"]
    ];

    downloadTextFile(buildCsv(exampleRows), "simple-pos-product-import-template.csv", "text/csv");
    setFeedback({ tone: "success", message: "Product import template downloaded." });
  };

  const importBackup = async (file: File | null) => {
    if (!file) {
      return;
    }

    const raw = await file.text();
    const result = importDataBackup(raw);

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.ok ? t("backup.importSuccess") : result.message ?? t("backup.importError")
    });

    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const importProductsCsv = async (file: File | null) => {
    if (!file || !currentShop) {
      return;
    }

    const raw = await file.text();
    const rows = parseCsv(raw);

    if (rows.length < 2) {
      setFeedback({ tone: "error", message: "This product CSV does not contain product rows." });
      return;
    }

    const headers = rows[0].map((header) => header.trim().toLowerCase());
    const headerIndex = (column: (typeof productCsvColumns)[number]) => headers.indexOf(column);
    const categoryByName = new Map(
      state.categories
        .filter((category) => category.shopId === currentShop.id)
        .map((category) => [category.name.trim().toLowerCase(), category.id])
    );
    let importedCount = 0;
    const errors: string[] = [];

    rows.slice(1).forEach((row, index) => {
      const get = (column: (typeof productCsvColumns)[number]) => {
        const columnIndex = headerIndex(column);

        return columnIndex >= 0 ? row[columnIndex]?.trim() ?? "" : "";
      };
      const kind = get("kind").toLowerCase() === "service" ? "service" : "product";
      const status = get("status").toLowerCase() === "inactive" ? "inactive" : "active";
      const nameEn = get("name_en");
      const nameAr = get("name_ar") || nameEn;
      const nameUr = get("name_ur") || nameEn;

      if (!nameEn) {
        errors.push(`Row ${index + 2}: English name is required.`);
        return;
      }

      const categoryName = get("category");
      let categoryId: string | undefined;

      if (categoryName) {
        const categoryKey = categoryName.toLowerCase();
        categoryId = categoryByName.get(categoryKey);

        if (!categoryId) {
          const result = addCategory({ name: categoryName, description: "Imported from product CSV." });

          if (result.ok && result.categoryId) {
            categoryId = result.categoryId;
            categoryByName.set(categoryKey, result.categoryId);
          }
        }
      }

      const product: Omit<Product, "id" | "shopId" | "createdAt" | "updatedAt"> = {
        kind,
        categoryId,
        barcode: get("barcode") || undefined,
        name: {
          en: nameEn,
          ar: nameAr,
          ur: nameUr
        },
        salePrice: parseMoney(get("sale_price")),
        costPrice: parseMoney(get("cost_price")),
        stockQuantity: kind === "product" ? parseQuantity(get("stock_quantity")) : 0,
        reorderLevel: kind === "product" ? parseQuantity(get("reorder_level")) : 0,
        expiryDate: kind === "product" ? get("expiry_date") || undefined : undefined,
        taxable: parseBoolean(get("taxable"), true),
        quickTab: parseBoolean(get("quick_tab"), false),
        status
      };
      const result = saveProduct(product);

      if (result.ok) {
        importedCount += 1;
      } else {
        errors.push(`Row ${index + 2}: ${result.message ?? "Could not import product."}`);
      }
    });

    setFeedback({
      tone: errors.length > 0 ? "error" : "success",
      message:
        errors.length > 0
          ? `${importedCount} products imported. ${errors.slice(0, 3).join(" ")}`
          : `${importedCount} products imported successfully.`
    });

    if (productImportRef.current) {
      productImportRef.current.value = "";
    }
  };

  return (
    <SettingsFormShell title={t("settings.backup")} subtitle={t("settings.backupPageSubtitle")}>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="p-6">
          <Download className="h-6 w-6 text-ink" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">{t("backup.exportTitle")}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("backup.exportDesc")}</p>
          <Button className="mt-6" onClick={exportBackup}>
            {t("backup.exportAction")}
          </Button>
        </Card>

        <Card className="p-6">
          <Upload className="h-6 w-6 text-ink" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">{t("backup.importTitle")}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("backup.importDesc")}</p>
          <Input
            ref={fileRef}
            accept="application/json,.json"
            className="mt-6 h-auto py-3"
            type="file"
            onChange={(event) => void importBackup(event.target.files?.[0] ?? null)}
          />
        </Card>

        <Card className="p-6">
          <Cloud className="h-6 w-6 text-ink" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">{t("backup.cloudTitle")}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("backup.cloudDesc")}</p>
          <div className="mt-6 rounded-3xl border border-dashed border-line bg-shell/70 p-4 text-sm font-medium text-slate-600">
            {t("backup.cloudStatus")}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="p-6">
          <FileSpreadsheet className="h-6 w-6 text-ink" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Product CSV schema</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Download the exact CSV columns needed to import products, services, categories, barcodes, prices, stock, tax, quick tab, and status.
          </p>
          <Button className="mt-6" onClick={downloadProductSchema} variant="secondary">
            Download product template
          </Button>
        </Card>

        <Card className="p-6">
          <Download className="h-6 w-6 text-ink" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Export products</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Export this shop's catalog as CSV for editing, migration, or onboarding another branch.
          </p>
          <Button className="mt-6" onClick={exportProductsCsv} variant="secondary">
            Export product CSV
          </Button>
        </Card>

        <Card className="p-6">
          <Upload className="h-6 w-6 text-ink" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Import products</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Import the CSV template. Duplicate barcodes are blocked, and missing categories are created automatically.
          </p>
          <Input
            ref={productImportRef}
            accept="text/csv,.csv"
            className="mt-6 h-auto py-3"
            type="file"
            onChange={(event) => void importProductsCsv(event.target.files?.[0] ?? null)}
          />
        </Card>
      </div>

      {feedback ? (
        <div
          className={
            feedback.tone === "success"
              ? "rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800"
              : "rounded-3xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-medium text-rose-800"
          }
        >
          {feedback.message}
        </div>
      ) : null}
    </SettingsFormShell>
  );
}
