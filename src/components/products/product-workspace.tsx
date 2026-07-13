"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Barcode,
  Check,
  Edit3,
  Grid2X2,
  ImageIcon,
  ListChecks,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { findBarcodeConflict, generateUniqueBarcode, normalizeBarcode } from "@/lib/catalog";
import { productKindLabelKeys } from "@/lib/i18n";
import { deleteImageAssetFromCloud, resizeImageFileToDataUrl, uploadImageAssetToCloud } from "@/lib/image-upload";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/pos";

type ProductView = "overview" | "editor" | "categories" | "catalog" | "quick";
type CategoryMode = "list" | "create" | "edit";
type BarcodePrintScope = "all" | "quick" | "selected" | "current";

type ProductFormState = {
  id?: string;
  kind: Product["kind"];
  categoryId: string;
  barcode: string;
  barcodes: string[];
  nameEn: string;
  nameAr: string;
  nameUr: string;
  imageUrl: string;
  salePrice: string;
  costPrice: string;
  stockQuantity: string;
  reorderLevel: string;
  taxable: boolean;
  quickTab: boolean;
  status: Product["status"];
};

type CategoryFormState = {
  id?: string;
  name: string;
  description: string;
  imageUrl: string;
};

const ADD_CATEGORY_VALUE = "__add_category__";
const ITEMS_PER_PAGE = 20;

const emptyProductForm: ProductFormState = {
  kind: "product",
  categoryId: "",
  barcode: "",
  barcodes: [],
  nameEn: "",
  nameAr: "",
  nameUr: "",
  imageUrl: "",
  salePrice: "",
  costPrice: "",
  stockQuantity: "0",
  reorderLevel: "0",
  taxable: true,
  quickTab: false,
  status: "active"
};

const emptyCategoryForm: CategoryFormState = {
  name: "",
  description: "",
  imageUrl: ""
};

function getLocalizedName(product: Product, locale: "en" | "ar" | "ur") {
  return product.name[locale] || product.name.en;
}

function getAssignedBarcodes(product: Pick<Product, "barcode" | "barcodes">) {
  return Array.from(
    new Set(
      [product.barcode, ...(product.barcodes ?? [])]
        .map((barcode) => normalizeBarcode(barcode))
        .filter((barcode): barcode is string => Boolean(barcode))
    )
  );
}

function getFormAssignedBarcodes(form: Pick<ProductFormState, "barcode" | "barcodes">) {
  return Array.from(
    new Set(
      [form.barcode, ...form.barcodes]
        .map((barcode) => normalizeBarcode(barcode))
        .filter((barcode): barcode is string => Boolean(barcode))
    )
  );
}

function createProductFormState(product?: Product, fallbackBarcode = ""): ProductFormState {
  if (!product) {
    const barcode = normalizeBarcode(fallbackBarcode) ?? fallbackBarcode;

    return {
      ...emptyProductForm,
      barcode,
      barcodes: barcode ? [barcode] : []
    };
  }

  const barcodes = getAssignedBarcodes(product);

  return {
    id: product.id,
    kind: product.kind,
    categoryId: product.categoryId ?? "",
    barcode: barcodes[0] ?? product.barcode ?? "",
    barcodes,
    nameEn: product.name.en,
    nameAr: product.name.ar,
    nameUr: product.name.ur,
    imageUrl: product.imageUrl ?? "",
    salePrice: String(product.salePrice),
    costPrice: String(product.costPrice),
    stockQuantity: String(product.stockQuantity),
    reorderLevel: String(product.reorderLevel),
    taxable: product.taxable,
    quickTab: product.quickTab,
    status: product.status
  };
}

function ImagePreview({
  className,
  imageUrl,
  label
}: {
  className?: string;
  imageUrl?: string;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[28px] border border-line bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_42%),linear-gradient(160deg,#f8fafc_0%,#eef4ef_100%)]",
        className
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="text-center text-slate-400">
          <ImageIcon className="mx-auto h-6 w-6" />
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]">{label}</p>
        </div>
      )}
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">{children}</p>;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
    </Card>
  );
}

function PaginationBar({
  page,
  pageCount,
  range,
  onPageChange
}: {
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
  range: string;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-line bg-white p-4">
      <p className="text-sm text-slate-600">{range}</p>
      <div className="flex items-center gap-2">
        <Button disabled={page <= 1} size="sm" variant="secondary" onClick={() => onPageChange(Math.max(1, page - 1))}>
          Previous
        </Button>
        <span className="text-sm font-semibold text-ink">Page {page} of {pageCount}</span>
        <Button disabled={page >= pageCount} size="sm" variant="secondary" onClick={() => onPageChange(Math.min(pageCount, page + 1))}>
          Next
        </Button>
      </div>
    </div>
  );
}

function productMatches(product: Product, query: string) {
  if (!query) {
    return true;
  }

  return [
    product.name.en,
    product.name.ar,
    product.name.ur,
    product.barcode ?? "",
    ...(product.barcodes ?? [])
  ].some((value) => value.toLowerCase().includes(query));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function ProductWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    addCategory,
    currentShopId,
    deleteCategory,
    deleteProduct,
    locale,
    saveProduct,
    session,
    state,
    t,
    updateCategory
  } = usePosApp();
  const isAdmin = session?.role === "shop_admin";
  const shopProducts = state.products.filter((product) => product.shopId === currentShopId);
  const shopCategories = state.categories.filter((category) => category.shopId === currentShopId);
  const activeProductKey = state.productKeys.find(
    (productKey) => productKey.shopId === currentShopId && productKey.key.trim().length >= 30
  )?.key;
  const requestedView = searchParams.get("view");
  const activeView: ProductView =
    requestedView === "editor" ||
    requestedView === "categories" ||
    requestedView === "catalog" ||
    requestedView === "quick"
      ? requestedView
      : "overview";
  const buildEmptyProductForm = () => createProductFormState(undefined, generateUniqueBarcode(shopProducts, currentShopId));

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [productForm, setProductForm] = useState<ProductFormState>(() => buildEmptyProductForm());
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("list");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const [catalogSubView, setCatalogSubView] = useState<"list" | "quick">("list");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [barcodePanelOpen, setBarcodePanelOpen] = useState(false);
  const [barcodePrintOpen, setBarcodePrintOpen] = useState(false);
  const [barcodePrintScope, setBarcodePrintScope] = useState<BarcodePrintScope>("all");
  const [printAllBarcodes, setPrintAllBarcodes] = useState(false);
  const [labelWidth, setLabelWidth] = useState("50");
  const [labelHeight, setLabelHeight] = useState("25");
  const [labelRows, setLabelRows] = useState("10");
  const [labelColumns, setLabelColumns] = useState("3");
  const [inlineCategoryOpen, setInlineCategoryOpen] = useState(false);
  const [catalogFeedback, setCatalogFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [categoryFeedback, setCategoryFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const deferredSearch = useDeferredValue(search);

  const quickTabProducts = useMemo(() => shopProducts.filter((product) => product.quickTab), [shopProducts]);
  const lowStockProducts = useMemo(
    () => shopProducts.filter((product) => product.kind === "product" && product.stockQuantity <= product.reorderLevel),
    [shopProducts]
  );
  const filteredProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return shopProducts.filter((product) => {
      const matchesCategory = categoryFilter === "all" ? true : product.categoryId === categoryFilter;

      return matchesCategory && productMatches(product, query);
    });
  }, [categoryFilter, deferredSearch, shopProducts]);
  const filteredQuickProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return shopProducts.filter((product) => productMatches(product, query));
  }, [deferredSearch, shopProducts]);
  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const currentProductPage = Math.min(productPage, totalProductPages);
  const paginatedProducts = filteredProducts.slice(
    (currentProductPage - 1) * ITEMS_PER_PAGE,
    currentProductPage * ITEMS_PER_PAGE
  );
  const totalCategoryPages = Math.max(1, Math.ceil(shopCategories.length / ITEMS_PER_PAGE));
  const currentCategoryPage = Math.min(categoryPage, totalCategoryPages);
  const paginatedCategories = shopCategories.slice(
    (currentCategoryPage - 1) * ITEMS_PER_PAGE,
    currentCategoryPage * ITEMS_PER_PAGE
  );
  const productRange = filteredProducts.length
    ? `${(currentProductPage - 1) * ITEMS_PER_PAGE + 1}-${Math.min(filteredProducts.length, currentProductPage * ITEMS_PER_PAGE)} of ${filteredProducts.length}`
    : "0 products";
  const categoryRange = shopCategories.length
    ? `${(currentCategoryPage - 1) * ITEMS_PER_PAGE + 1}-${Math.min(shopCategories.length, currentCategoryPage * ITEMS_PER_PAGE)} of ${shopCategories.length}`
    : "0 categories";
  const selectedProduct = productForm.id ? shopProducts.find((product) => product.id === productForm.id) : null;

  useEffect(() => {
    setProductPage(1);
  }, [categoryFilter, deferredSearch]);

  const resetProductForm = () => {
    setProductForm(buildEmptyProductForm());
    setBarcodePanelOpen(false);
  };

  const setAssignedBarcodes = (barcodes: string[]) => {
    const normalized = Array.from(
      new Set(barcodes.map((barcode) => normalizeBarcode(barcode)).filter((barcode): barcode is string => Boolean(barcode)))
    );
    const fallback = normalized[0] ?? generateUniqueBarcode(shopProducts, currentShopId);

    setProductForm((current) => ({
      ...current,
      barcode: fallback,
      barcodes: normalized.length ? normalized : [fallback]
    }));
  };

  const addFormBarcode = (barcode: string) => {
    const normalized = normalizeBarcode(barcode);

    if (!normalized) {
      setCatalogFeedback({ tone: "error", message: "Enter or scan a valid barcode before adding it." });
      return;
    }

    const conflict = findBarcodeConflict(shopProducts, currentShopId ?? "", normalized, productForm.id);

    if (conflict) {
      setCatalogFeedback({ tone: "error", message: "Another product already uses this barcode." });
      return;
    }

    setAssignedBarcodes([...getFormAssignedBarcodes(productForm), normalized]);
    setCatalogFeedback({ tone: "success", message: "Barcode assigned to this product." });
  };

  const startEditProduct = (product: Product) => {
    setCatalogFeedback(null);
    setProductForm(createProductFormState(product));
    router.push("/products?view=editor");
  };

  const saveProductForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isAdmin) {
      return;
    }

    const assignedBarcodes = getFormAssignedBarcodes(productForm);
    const primaryBarcode = assignedBarcodes[0] ?? generateUniqueBarcode(shopProducts, currentShopId);

    startTransition(() => {
      const result = saveProduct({
        id: productForm.id,
        kind: productForm.kind,
        categoryId: productForm.categoryId || undefined,
        barcode: primaryBarcode,
        barcodes: assignedBarcodes.length ? assignedBarcodes : [primaryBarcode],
        name: {
          en: productForm.nameEn.trim(),
          ar: productForm.nameAr.trim(),
          ur: productForm.nameUr.trim()
        },
        imageUrl: productForm.imageUrl.trim() || undefined,
        salePrice: Number(productForm.salePrice),
        costPrice: Number(productForm.costPrice),
        stockQuantity: productForm.kind === "service" ? 0 : Number(productForm.stockQuantity || 0),
        reorderLevel: productForm.kind === "service" ? 0 : Number(productForm.reorderLevel || 0),
        taxable: productForm.taxable,
        quickTab: productForm.quickTab,
        status: productForm.status
      });

      if (!result.ok) {
        setCatalogFeedback({ tone: "error", message: result.message ?? t("products.saveError") });
        return;
      }

      setCatalogFeedback({
        tone: "success",
        message: productForm.id ? t("products.updateSuccess") : t("products.saveSuccess")
      });
      resetProductForm();
    });
  };

  const saveCategoryFromForm = (form: CategoryFormState, options?: { assignToProduct?: boolean; stayOpen?: boolean }) => {
    if (!isAdmin || !form.name.trim()) {
      return;
    }

    startTransition(() => {
      const result: { ok: boolean; message?: string; categoryId?: string } = form.id
        ? updateCategory(form.id, {
            name: form.name.trim(),
            description: form.description.trim(),
            imageUrl: form.imageUrl.trim() || undefined
          })
        : addCategory({
            name: form.name.trim(),
            description: form.description.trim(),
            imageUrl: form.imageUrl.trim() || undefined
          });

      if (!result.ok) {
        setCategoryFeedback({ tone: "error", message: result.message ?? t("products.categorySaveError") });
        return;
      }

      if (options?.assignToProduct && result.categoryId) {
        setProductForm((current) => ({ ...current, categoryId: result.categoryId ?? "" }));
      }

      setCategoryFeedback({
        tone: "success",
        message: form.id ? t("products.categoryUpdateSuccess") : t("products.categorySaveSuccess")
      });
      setCategoryForm(emptyCategoryForm);
      setCategoryMode("list");
      if (!options?.stayOpen) {
        setInlineCategoryOpen(false);
      }
    });
  };

  const saveCategoryForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveCategoryFromForm(categoryForm, { stayOpen: true });
  };

  const removeCategory = (categoryId: string) => {
    const result = deleteCategory(categoryId);

    if (!result.ok) {
      setCategoryFeedback({ tone: "error", message: result.message ?? t("products.categoryRemoveError") });
      return;
    }

    setCategoryFeedback({ tone: "success", message: t("products.categoryRemoveSuccess") });
    if (categoryForm.id === categoryId) {
      setCategoryForm(emptyCategoryForm);
      setCategoryMode("list");
    }
  };

  const toggleQuickTab = (product: Product, quickTab: boolean) => {
    if (!isAdmin) {
      return;
    }

    const result = saveProduct({
      id: product.id,
      kind: product.kind,
      categoryId: product.categoryId,
      barcode: product.barcode,
      barcodes: getAssignedBarcodes(product),
      name: product.name,
      imageUrl: product.imageUrl,
      salePrice: product.salePrice,
      costPrice: product.costPrice,
      stockQuantity: product.stockQuantity,
      reorderLevel: product.reorderLevel,
      taxable: product.taxable,
      quickTab,
      status: product.status
    });

    setCatalogFeedback({
      tone: result.ok ? "success" : "error",
      message: result.ok ? "Quick billing setting updated." : result.message ?? t("products.saveError")
    });
  };

  const deleteShopImageAsset = (imageUrl: string) =>
    deleteImageAssetFromCloud({
      productKey: activeProductKey,
      shopId: currentShopId ?? undefined,
      url: imageUrl,
      userEmail: session?.email,
      userId: session?.id
    });

  const uploadProductImage = async (file?: File | null) => {
    if (!file) {
      return;
    }

    try {
      const previousImageUrl = productForm.imageUrl.trim();
      const result = await resizeImageFileToDataUrl(file, {
        maxBytes: 300 * 1024,
        maxWidth: 640,
        maxHeight: 460,
        minQuality: 0.58,
        quality: 0.76,
        outputType: "image/jpeg"
      });
      const upload = await uploadImageAssetToCloud({
        dataUrl: result.dataUrl,
        fileName: file.name,
        productKey: activeProductKey,
        scope: "product",
        shopId: currentShopId ?? undefined,
        userEmail: session?.email,
        userId: session?.id
      });

      setProductForm((current) => ({ ...current, imageUrl: upload.url }));
      if (previousImageUrl && previousImageUrl !== upload.url) {
        void deleteShopImageAsset(previousImageUrl).catch(() => undefined);
      }
      setCatalogFeedback({
        tone: "success",
        message: upload.storedInCloud
          ? "Image saved securely in Supabase Storage."
          : `${t("products.imageUploadSuccess")} Cloud upload fallback was used.`
      });
    } catch (error) {
      setCatalogFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : t("products.imageUploadError")
      });
    }
  };

  const removeProductImage = async () => {
    const imageUrl = productForm.imageUrl.trim();

    setProductForm((current) => ({ ...current, imageUrl: "" }));

    if (!imageUrl) {
      return;
    }

    try {
      const result = await deleteShopImageAsset(imageUrl);

      setCatalogFeedback({
        tone: "success",
        message: result.deleted ? "Product image removed from Supabase Storage." : "Product image removed."
      });
    } catch (error) {
      setCatalogFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Product image was removed from the form, but cloud cleanup failed."
      });
    }
  };

  const uploadCategoryImage = async (file?: File | null) => {
    if (!file) {
      return;
    }

    try {
      const previousImageUrl = categoryForm.imageUrl.trim();
      const result = await resizeImageFileToDataUrl(file, {
        maxBytes: 300 * 1024,
        maxWidth: 640,
        maxHeight: 460,
        minQuality: 0.58,
        quality: 0.76,
        outputType: "image/jpeg"
      });
      const upload = await uploadImageAssetToCloud({
        dataUrl: result.dataUrl,
        fileName: file.name,
        productKey: activeProductKey,
        scope: "category",
        shopId: currentShopId ?? undefined,
        userEmail: session?.email,
        userId: session?.id
      });

      setCategoryForm((current) => ({ ...current, imageUrl: upload.url }));
      if (previousImageUrl && previousImageUrl !== upload.url) {
        void deleteShopImageAsset(previousImageUrl).catch(() => undefined);
      }
      setCategoryFeedback({
        tone: "success",
        message: upload.storedInCloud
          ? "Image saved securely in Supabase Storage."
          : `${t("products.imageUploadSuccess")} Cloud upload fallback was used.`
      });
    } catch (error) {
      setCategoryFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : t("products.imageUploadError")
      });
    }
  };

  const removeCategoryImage = async () => {
    const imageUrl = categoryForm.imageUrl.trim();

    setCategoryForm((current) => ({ ...current, imageUrl: "" }));

    if (!imageUrl) {
      return;
    }

    try {
      const result = await deleteShopImageAsset(imageUrl);

      setCategoryFeedback({
        tone: "success",
        message: result.deleted ? "Category image removed from Supabase Storage." : "Category image removed."
      });
    } catch (error) {
      setCategoryFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Category image was removed from the form, but cloud cleanup failed."
      });
    }
  };

  const productsForBarcodePrint = () => {
    if (barcodePrintScope === "quick") {
      return quickTabProducts;
    }

    if (barcodePrintScope === "selected") {
      const selected = new Set(selectedProductIds);
      return shopProducts.filter((product) => selected.has(product.id));
    }

    if (barcodePrintScope === "current") {
      if (selectedProduct) {
        return [selectedProduct];
      }

      return [{
        id: "draft",
        shopId: currentShopId ?? "shop",
        kind: productForm.kind,
        categoryId: productForm.categoryId || undefined,
        barcode: productForm.barcode,
        barcodes: getFormAssignedBarcodes(productForm),
        name: { en: productForm.nameEn || "New product", ar: productForm.nameAr, ur: productForm.nameUr },
        imageUrl: productForm.imageUrl || undefined,
        salePrice: Number(productForm.salePrice || 0),
        costPrice: Number(productForm.costPrice || 0),
        stockQuantity: Number(productForm.stockQuantity || 0),
        reorderLevel: Number(productForm.reorderLevel || 0),
        taxable: productForm.taxable,
        quickTab: productForm.quickTab,
        status: productForm.status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } satisfies Product];
    }

    return shopProducts;
  };

  const printBarcodeLabels = () => {
    const width = Math.max(20, Number(labelWidth || 50));
    const height = Math.max(10, Number(labelHeight || 25));
    const rows = Math.max(1, Number(labelRows || 10));
    const columns = Math.max(1, Number(labelColumns || 3));
    const labels = productsForBarcodePrint().flatMap((product) => {
      const barcodes = printAllBarcodes ? getAssignedBarcodes(product) : ([product.barcode].filter(Boolean) as string[]);

      return barcodes.map((barcode) => ({
        barcode,
        name: product.name.en || getLocalizedName(product, locale),
        price: formatCurrency(product.salePrice, "SAR", locale)
      }));
    });

    if (!labels.length) {
      setCatalogFeedback({ tone: "error", message: "No barcodes available to print." });
      return;
    }

    const html = `<!doctype html>
      <html>
        <head>
          <title>Barcode labels</title>
          <style>
            @page { size: A4; margin: 8mm; }
            body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
            .sheet { display: grid; grid-template-columns: repeat(${columns}, ${width}mm); grid-auto-rows: ${height}mm; gap: 3mm; }
            .label { border: 1px dashed #94a3b8; border-radius: 3mm; padding: 2mm; display: flex; flex-direction: column; justify-content: center; align-items: center; overflow: hidden; text-align: center; }
            .name { font-size: ${height > 20 ? 11 : 8}px; font-weight: 700; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .bars { margin-top: 2mm; font-family: "Libre Barcode 39", "Courier New", monospace; font-size: ${Math.max(18, Math.min(34, height * 0.9))}px; letter-spacing: 1px; line-height: 1; }
            .code { font-size: ${height > 20 ? 10 : 7}px; letter-spacing: 0.08em; }
            .price { margin-top: 1mm; font-size: ${height > 20 ? 10 : 7}px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="sheet">
            ${labels.slice(0, rows * columns).map((label) => `
              <div class="label">
                <div class="name">${escapeHtml(label.name)}</div>
                <div class="bars">*${escapeHtml(label.barcode)}*</div>
                <div class="code">${escapeHtml(label.barcode)}</div>
                <div class="price">${escapeHtml(label.price)}</div>
              </div>
            `).join("")}
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>`;
    const popup = window.open("", "_blank", "width=900,height=700");

    if (!popup) {
      setCatalogFeedback({ tone: "error", message: "Allow popups to print barcode labels." });
      return;
    }

    popup.document.write(html);
    popup.document.close();
  };

  const navItems = [
    { href: "/products?view=overview", active: activeView === "overview", icon: Grid2X2, label: "Overview" },
    { href: "/products?view=editor", active: activeView === "editor", icon: Package, label: "Product editor" },
    { href: "/products?view=categories", active: activeView === "categories", icon: Tags, label: "Categories" },
    { href: "/products?view=catalog", active: activeView === "catalog", icon: ListChecks, label: "Product list" },
    { href: "/products?view=quick", active: activeView === "quick", icon: Sparkles, label: "Quick billing" }
  ];

  const renderProductImageField = () => (
    <div className="rounded-[28px] border border-line bg-shell/70 p-4">
      <div className="grid gap-4 md:grid-cols-[112px_minmax(0,1fr)] md:items-center">
        <ImagePreview imageUrl={productForm.imageUrl} label="Product image" />
        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink">Product picture</label>
          <Input
            disabled={!isAdmin}
            placeholder="Paste image URL or upload"
            value={productForm.imageUrl}
            onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))}
          />
          <div className="flex flex-wrap gap-2">
            <label
              className={cn(
                "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50",
                !isAdmin && "pointer-events-none opacity-60"
              )}
            >
              <UploadCloud className="h-4 w-4" />
              Upload image
              <input
                accept="image/*"
                className="hidden"
                disabled={!isAdmin}
                type="file"
                onChange={(event) => {
                  void uploadProductImage(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {productForm.imageUrl ? (
              <Button disabled={!isAdmin} type="button" variant="secondary" onClick={() => void removeProductImage()}>
                <X className="mr-2 h-4 w-4" />
                Remove image
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  const renderCategoryForm = (submitLabel = "Save category", assignToProduct = false) => (
    <form
      className="grid gap-4 xl:grid-cols-[1fr_1.1fr]"
      onSubmit={(event) => {
        event.preventDefault();
        saveCategoryFromForm(categoryForm, { assignToProduct, stayOpen: !assignToProduct });
      }}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">Category name</label>
          <Input
            disabled={!isAdmin}
            value={categoryForm.name}
            onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">Description</label>
          <Textarea
            className="min-h-[120px]"
            disabled={!isAdmin}
            value={categoryForm.description}
            onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
          />
        </div>
      </div>
      <div className="rounded-[28px] border border-line bg-shell/70 p-4">
        <div className="grid gap-4 md:grid-cols-[112px_minmax(0,1fr)] md:items-center">
          <ImagePreview imageUrl={categoryForm.imageUrl} label="Category image" />
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">Category image</label>
            <Input
              disabled={!isAdmin}
              placeholder="Paste image URL or upload"
              value={categoryForm.imageUrl}
              onChange={(event) => setCategoryForm((current) => ({ ...current, imageUrl: event.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              <label
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50",
                  !isAdmin && "pointer-events-none opacity-60"
                )}
              >
                <UploadCloud className="h-4 w-4" />
                Upload image
                <input
                  accept="image/*"
                  className="hidden"
                  disabled={!isAdmin}
                  type="file"
                  onChange={(event) => {
                    void uploadCategoryImage(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {categoryForm.imageUrl ? (
                <Button disabled={!isAdmin} type="button" variant="secondary" onClick={() => void removeCategoryImage()}>
                  <X className="mr-2 h-4 w-4" />
                  Remove image
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 xl:col-span-2">
        <Button disabled={!isAdmin || !categoryForm.name.trim()} type="submit">
          {submitLabel}
        </Button>
        <Button
          disabled={!isAdmin}
          type="button"
          variant="secondary"
          onClick={() => {
            setCategoryForm(emptyCategoryForm);
            setCategoryMode("list");
            setInlineCategoryOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      <nav className="grid max-w-6xl grid-cols-2 gap-2 rounded-[24px] border border-slate-200 bg-white/88 p-2 shadow-[0_18px_45px_rgba(15,23,42,0.05)] backdrop-blur md:grid-cols-5">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              className={cn(
                "inline-flex h-12 items-center justify-center gap-2 rounded-[18px] px-4 text-sm font-semibold transition",
                item.active
                  ? "bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]"
                  : "text-slate-600 hover:bg-emerald-50 hover:text-slate-950"
              )}
              href={item.href}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {catalogFeedback ? (
        <div
          className={cn(
            "rounded-[22px] border px-4 py-3 text-sm font-semibold",
            catalogFeedback.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {catalogFeedback.message}
        </div>
      ) : null}

      {!isAdmin ? (
        <Card className="border-dashed border-accent bg-accentSoft/60 p-5">
          <p className="text-sm font-medium text-ink">{t("products.readOnlyBanner")}</p>
        </Card>
      ) : null}

      {activeView === "overview" ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Products and services" value={shopProducts.length} />
          <MetricCard label="Quick billing items" value={quickTabProducts.length} />
          <MetricCard label="Categories" value={shopCategories.length} />
          <MetricCard label="Low stock" value={lowStockProducts.length} />
        </section>
      ) : null}

      {activeView === "editor" ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionEyebrow>Product editor</SectionEyebrow>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                {productForm.id ? "Edit product" : "Add product or service"}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setBarcodePrintOpen(true)}>
                <Printer className="mr-2 h-4 w-4" />
                Print barcode
              </Button>
              <Badge variant={productForm.id ? "warning" : "success"}>
                {productForm.id ? "Editing" : "New item"}
              </Badge>
            </div>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={saveProductForm}>
            <section className="grid gap-4 lg:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">English name</label>
                <Input
                  disabled={!isAdmin}
                  required
                  value={productForm.nameEn}
                  onChange={(event) => setProductForm((current) => ({ ...current, nameEn: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Arabic name</label>
                <Input
                  dir="rtl"
                  disabled={!isAdmin}
                  required
                  value={productForm.nameAr}
                  onChange={(event) => setProductForm((current) => ({ ...current, nameAr: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Urdu name</label>
                <Input
                  dir="rtl"
                  disabled={!isAdmin}
                  required
                  value={productForm.nameUr}
                  onChange={(event) => setProductForm((current) => ({ ...current, nameUr: event.target.value }))}
                />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Product type</label>
                <Select
                  disabled={!isAdmin}
                  value={productForm.kind}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      kind: event.target.value as Product["kind"],
                      stockQuantity: event.target.value === "service" ? "0" : current.stockQuantity,
                      reorderLevel: event.target.value === "service" ? "0" : current.reorderLevel
                    }))
                  }
                >
                  <option value="product">{t("productKind.product")}</option>
                  <option value="service">{t("productKind.service")}</option>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Category</label>
                <Select
                  disabled={!isAdmin}
                  value={productForm.categoryId}
                  onChange={(event) => {
                    if (event.target.value === ADD_CATEGORY_VALUE) {
                      setCategoryForm(emptyCategoryForm);
                      setInlineCategoryOpen(true);
                      return;
                    }

                    setProductForm((current) => ({ ...current, categoryId: event.target.value }));
                  }}
                >
                  <option value="">{t("common.noCategory")}</option>
                  {shopCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                  <option value={ADD_CATEGORY_VALUE}>+ Add new category</option>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Sale price</label>
                <Input
                  disabled={!isAdmin}
                  inputMode="decimal"
                  required
                  value={productForm.salePrice}
                  onChange={(event) => setProductForm((current) => ({ ...current, salePrice: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Cost price</label>
                <Input
                  disabled={!isAdmin}
                  inputMode="decimal"
                  required
                  value={productForm.costPrice}
                  onChange={(event) => setProductForm((current) => ({ ...current, costPrice: event.target.value }))}
                />
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
              <div className="rounded-[28px] border border-line bg-white p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-ink">Barcode</label>
                    <Input
                      disabled={!isAdmin}
                      inputMode="numeric"
                      value={productForm.barcode}
                      onChange={(event) => setProductForm((current) => ({ ...current, barcode: event.target.value.replace(/\D/g, "") }))}
                    />
                  </div>
                  <Button
                    disabled={!isAdmin}
                    type="button"
                    variant="secondary"
                    onClick={() => setProductForm((current) => ({ ...current, barcode: generateUniqueBarcode(shopProducts, currentShopId) }))}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Generate
                  </Button>
                  <Button disabled={!isAdmin} type="button" variant="secondary" onClick={() => addFormBarcode(productForm.barcode)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Assign
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" onClick={() => setBarcodePanelOpen(true)}>
                    <Barcode className="mr-2 h-4 w-4" />
                    Assigned barcodes ({getFormAssignedBarcodes(productForm).length})
                  </Button>
                  <Button
                    disabled={!isAdmin}
                    type="button"
                    variant="secondary"
                    onClick={() => addFormBarcode(generateUniqueBarcode(shopProducts, currentShopId))}
                  >
                    Generate extra barcode
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-ink">Stock quantity</label>
                  <Input
                    disabled={!isAdmin || productForm.kind === "service"}
                    inputMode="numeric"
                    value={productForm.kind === "service" ? "0" : productForm.stockQuantity}
                    onChange={(event) => setProductForm((current) => ({ ...current, stockQuantity: event.target.value.replace(/[^\d]/g, "") }))}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-ink">Reorder level</label>
                  <Input
                    disabled={!isAdmin || productForm.kind === "service"}
                    inputMode="numeric"
                    value={productForm.kind === "service" ? "0" : productForm.reorderLevel}
                    onChange={(event) => setProductForm((current) => ({ ...current, reorderLevel: event.target.value.replace(/[^\d]/g, "") }))}
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              {renderProductImageField()}
              <div className="grid gap-3">
                <label className="flex min-h-[72px] items-center gap-3 rounded-[24px] border border-line bg-shell p-4 text-sm font-medium text-ink">
                  <input
                    checked={productForm.quickTab}
                    className="h-4 w-4"
                    disabled={!isAdmin}
                    type="checkbox"
                    onChange={(event) => setProductForm((current) => ({ ...current, quickTab: event.target.checked }))}
                  />
                  Show on billing quick tab
                </label>
                <label className="flex min-h-[72px] items-center gap-3 rounded-[24px] border border-line bg-shell p-4 text-sm font-medium text-ink">
                  <input
                    checked={productForm.taxable}
                    className="h-4 w-4"
                    disabled={!isAdmin}
                    type="checkbox"
                    onChange={(event) => setProductForm((current) => ({ ...current, taxable: event.target.checked }))}
                  />
                  Apply shop tax
                </label>
                <Select
                  disabled={!isAdmin}
                  value={productForm.status}
                  onChange={(event) => setProductForm((current) => ({ ...current, status: event.target.value as Product["status"] }))}
                >
                  <option value="active">{t("common.active")}</option>
                  <option value="inactive">{t("common.inactive")}</option>
                </Select>
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!isAdmin || !productForm.nameEn.trim() || !productForm.nameAr.trim() || !productForm.nameUr.trim()}
                type="submit"
              >
                {productForm.id ? "Update product" : "Add product"}
              </Button>
              <Button
                disabled={!isAdmin}
                type="button"
                variant="secondary"
                onClick={() => {
                  setCatalogFeedback(null);
                  resetProductForm();
                }}
              >
                Clear form
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {activeView === "categories" ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionEyebrow>Categories</SectionEyebrow>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                {categoryMode === "edit" ? "Edit category" : categoryMode === "create" ? "Create category" : "Category list"}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-[20px] border border-line bg-shell p-1">
              <Button
                variant={categoryMode === "list" ? "primary" : "ghost"}
                onClick={() => {
                  setCategoryMode("list");
                  setCategoryForm(emptyCategoryForm);
                }}
              >
                Category list
              </Button>
              <Button
                variant={categoryMode === "create" ? "primary" : "ghost"}
                onClick={() => {
                  setCategoryMode("create");
                  setCategoryForm(emptyCategoryForm);
                }}
              >
                Create category
              </Button>
            </div>
          </div>

          {categoryFeedback ? (
            <div
              className={cn(
                "mt-4 rounded-[20px] border px-4 py-3 text-sm font-semibold",
                categoryFeedback.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              )}
            >
              {categoryFeedback.message}
            </div>
          ) : null}

          {categoryMode === "create" || categoryMode === "edit" ? (
            <div className="mt-5">{renderCategoryForm(categoryForm.id ? "Update category" : "Add category")}</div>
          ) : (
            <div className="mt-5 space-y-3">
              {paginatedCategories.length > 0 ? (
                paginatedCategories.map((category) => (
                  <div key={category.id} className="rounded-[28px] border border-line bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-3">
                        <ImagePreview className="h-16 w-16 rounded-[20px]" imageUrl={category.imageUrl} label={category.name.slice(0, 2).toUpperCase()} />
                        <div>
                          <p className="text-lg font-semibold text-ink">{category.name}</p>
                          <p className="mt-1 text-sm text-slate-600">{category.description || t("common.noDescriptionYet")}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="neutral">
                          {shopProducts.filter((product) => product.categoryId === category.id).length} items
                        </Badge>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setCategoryForm({
                              id: category.id,
                              name: category.name,
                              description: category.description ?? "",
                              imageUrl: category.imageUrl ?? ""
                            });
                            setCategoryMode("edit");
                          }}
                        >
                          <Edit3 className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => removeCategory(category.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-line bg-shell/70 p-6 text-sm text-slate-600">
                  No categories yet. Create one from this screen or directly inside Product editor.
                </div>
              )}
              <PaginationBar page={currentCategoryPage} pageCount={totalCategoryPages} range={categoryRange} onPageChange={setCategoryPage} />
            </div>
          )}
        </Card>
      ) : null}

      {activeView === "catalog" ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionEyebrow>Product</SectionEyebrow>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                {catalogSubView === "list" ? "Product list" : "Quick billing preview"}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setBarcodePrintOpen(true)}>
                <Printer className="mr-2 h-4 w-4" />
                Print barcodes
              </Button>
              <div className="grid grid-cols-2 gap-2 rounded-[20px] border border-line bg-shell p-1">
                <Button variant={catalogSubView === "list" ? "primary" : "ghost"} onClick={() => setCatalogSubView("list")}>
                  Product list
                </Button>
                <Button variant={catalogSubView === "quick" ? "primary" : "ghost"} onClick={() => setCatalogSubView("quick")}>
                  Quick billing
                </Button>
              </div>
            </div>
          </div>

          {catalogSubView === "list" ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-11"
                    placeholder="Search product name or barcode"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">{t("common.allCategories")}</option>
                  {shopCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>

              {paginatedProducts.length > 0 ? (
                paginatedProducts.map((product) => {
                  const category = shopCategories.find((item) => item.id === product.categoryId);
                  const selected = selectedProductIds.includes(product.id);

                  return (
                    <div key={product.id} className="rounded-[28px] border border-line bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.04)]">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 gap-4">
                          <label className="mt-2">
                            <input
                              checked={selected}
                              className="h-4 w-4"
                              type="checkbox"
                              onChange={(event) =>
                                setSelectedProductIds((current) =>
                                  event.target.checked
                                    ? [...current, product.id]
                                    : current.filter((id) => id !== product.id)
                                )
                              }
                            />
                          </label>
                          <ImagePreview className="hidden h-20 w-20 rounded-[22px] sm:flex" imageUrl={product.imageUrl} label={getLocalizedName(product, locale).slice(0, 2).toUpperCase()} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-lg font-semibold text-ink">{getLocalizedName(product, locale)}</p>
                              <Badge variant={product.kind === "service" ? "warning" : "neutral"}>{t(productKindLabelKeys[product.kind])}</Badge>
                              {product.quickTab ? <Badge variant="success">Quick tab</Badge> : null}
                              {category ? <Badge variant="neutral">{category.name}</Badge> : null}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-5 text-sm text-slate-600">
                              <span>Sale {formatCurrency(product.salePrice, "SAR", locale)}</span>
                              <span>Cost {formatCurrency(product.costPrice, "SAR", locale)}</span>
                              <span>Stock {product.kind === "service" ? "-" : product.stockQuantity}</span>
                              <span>Barcodes {getAssignedBarcodes(product).length}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => startEditProduct(product)}>
                            <Edit3 className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => toggleQuickTab(product, !product.quickTab)}>
                            <Sparkles className="mr-2 h-4 w-4" />
                            {product.quickTab ? "Remove quick" : "Make quick"}
                          </Button>
                          {isAdmin ? (
                            <Button size="sm" variant="danger" onClick={() => setDeleteTarget(product)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Trash
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[24px] border border-dashed border-line bg-shell/70 p-6 text-sm text-slate-600">
                  No products matched the current search or category filter.
                </div>
              )}
              <PaginationBar page={currentProductPage} pageCount={totalProductPages} range={productRange} onPageChange={setProductPage} />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-11"
                  placeholder="Search any product and mark it for quick billing"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredQuickProducts.map((product) => (
                  <button
                    key={product.id}
                    className={cn(
                      "rounded-[26px] border p-4 text-left transition hover:-translate-y-0.5",
                      product.quickTab
                        ? "border-emerald-300 bg-emerald-50 shadow-[0_18px_40px_rgba(16,185,129,0.10)]"
                        : "border-line bg-white hover:border-emerald-200"
                    )}
                    type="button"
                    onClick={() => toggleQuickTab(product, !product.quickTab)}
                  >
                    <div className="flex gap-3">
                      <ImagePreview className="h-16 w-16 rounded-[20px]" imageUrl={product.imageUrl} label={getLocalizedName(product, locale).slice(0, 2).toUpperCase()} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{getLocalizedName(product, locale)}</p>
                        <p className="mt-1 text-sm text-slate-600">{product.barcode ?? t("common.notAvailable")}</p>
                        <p className="mt-2 font-semibold text-slate-950">{formatCurrency(product.salePrice, "SAR", locale)}</p>
                      </div>
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", product.quickTab ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500")}>
                        {product.quickTab ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {activeView === "quick" ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionEyebrow>Quick billing</SectionEyebrow>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Products prepared for fast checkout</h2>
            </div>
            <Button asChild variant="secondary">
              <Link href="/products?view=catalog">Manage quick items</Link>
            </Button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {quickTabProducts.length > 0 ? (
              quickTabProducts.map((product) => (
                <Card key={product.id} className="overflow-hidden p-0">
                  <ImagePreview className="h-36 w-full rounded-none border-0" imageUrl={product.imageUrl} label={getLocalizedName(product, locale).slice(0, 2).toUpperCase()} />
                  <div className="p-4">
                    <p className="font-semibold text-ink">{getLocalizedName(product, locale)}</p>
                    <p className="mt-2 text-sm text-slate-600">{formatCurrency(product.salePrice, "SAR", locale)}</p>
                    <Button className="mt-4 w-full" size="sm" variant="secondary" onClick={() => toggleQuickTab(product, false)}>
                      Remove from quick tab
                    </Button>
                  </div>
                </Card>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-line bg-shell/70 p-6 text-sm text-slate-600 md:col-span-2 xl:col-span-4">
                No quick-tab products are marked yet.
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {inlineCategoryOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-4xl p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <SectionEyebrow>New category</SectionEyebrow>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Create and assign category</h2>
              </div>
              <Button className="h-10 w-10 rounded-full p-0" variant="secondary" onClick={() => setInlineCategoryOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {renderCategoryForm("Add and use category", true)}
          </Card>
        </div>
      ) : null}

      {barcodePanelOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionEyebrow>Assigned barcodes</SectionEyebrow>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Barcode list</h2>
              </div>
              <Button className="h-10 w-10 rounded-full p-0" variant="secondary" onClick={() => setBarcodePanelOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-5 space-y-3">
              {getFormAssignedBarcodes(productForm).map((barcode, index, all) => (
                <div key={barcode} className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-line bg-shell px-4 py-3">
                  <div>
                    <p className="font-mono text-lg font-semibold tracking-[0.08em] text-ink">{barcode}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{index === 0 ? "Primary barcode" : "Extra barcode"}</p>
                  </div>
                  <Button
                    disabled={!isAdmin || all.length <= 1}
                    size="sm"
                    variant="danger"
                    onClick={() => setAssignedBarcodes(all.filter((entry) => entry !== barcode))}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {barcodePrintOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-3xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionEyebrow>Barcode printing</SectionEyebrow>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Print product stickers</h2>
              </div>
              <Button className="h-10 w-10 rounded-full p-0" variant="secondary" onClick={() => setBarcodePrintOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">What to print</label>
                <Select value={barcodePrintScope} onChange={(event) => setBarcodePrintScope(event.target.value as BarcodePrintScope)}>
                  <option value="all">All products</option>
                  <option value="quick">Quick billing products</option>
                  <option value="selected">Selected products</option>
                  <option value="current">Current product form</option>
                </Select>
              </div>
              <label className="flex items-center gap-3 rounded-[18px] border border-line bg-shell px-4 py-3 text-sm font-medium text-ink">
                <input checked={printAllBarcodes} className="h-4 w-4" type="checkbox" onChange={(event) => setPrintAllBarcodes(event.target.checked)} />
                Print every assigned barcode for each product
              </label>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Sticker width (mm)</label>
                <Input inputMode="decimal" value={labelWidth} onChange={(event) => setLabelWidth(event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Sticker height (mm)</label>
                <Input inputMode="decimal" value={labelHeight} onChange={(event) => setLabelHeight(event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">A4 rows</label>
                <Input inputMode="numeric" value={labelRows} onChange={(event) => setLabelRows(event.target.value.replace(/[^\d]/g, ""))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">A4 columns</label>
                <Input inputMode="numeric" value={labelColumns} onChange={(event) => setLabelColumns(event.target.value.replace(/[^\d]/g, ""))} />
              </div>
            </div>
            <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Use sticker width and height for small or long labels. For A4 sheets, set rows and columns to match the paper layout.
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={printBarcodeLabels}>
                <Printer className="mr-2 h-4 w-4" />
                Print stickers
              </Button>
              <Button variant="secondary" onClick={() => setBarcodePrintOpen(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 p-4">
          <Card className="w-full max-w-xl p-6">
            <SectionEyebrow>Move product to trash</SectionEyebrow>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{deleteTarget.name[locale] || deleteTarget.name.en}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{t("products.moveToTrashDesc")}</p>
            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-ink">{t("common.deleteReason")}</label>
              <Textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                disabled={!deleteReason.trim()}
                variant="danger"
                onClick={() => {
                  deleteProduct(deleteTarget.id, deleteReason.trim());
                  setDeleteTarget(null);
                  setDeleteReason("");
                  if (productForm.id === deleteTarget.id) {
                    resetProductForm();
                  }
                }}
              >
                {t("common.confirmMoveToTrash")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteReason("");
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
