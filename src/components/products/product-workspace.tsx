"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Edit3, FolderPlus, ImageIcon, RefreshCw, Search, Trash2, UploadCloud, X } from "lucide-react";
import { generateUniqueBarcode } from "@/lib/catalog";
import { productKindLabelKeys } from "@/lib/i18n";
import { resizeImageFileToDataUrl, uploadImageAssetToCloud } from "@/lib/image-upload";
import { usePosApp } from "@/components/providers/app-provider";
import { ProductQuickTabGrid } from "@/components/products/product-quick-tab-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceSectionsNav } from "@/components/ui/workspace-sections-nav";
import { cn, formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/pos";

type ProductView = "overview" | "editor" | "categories" | "catalog";

type ProductFormState = {
  id?: string;
  kind: Product["kind"];
  categoryId: string;
  barcode: string;
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

const emptyProductForm: ProductFormState = {
  kind: "product",
  categoryId: "",
  barcode: "",
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

const ITEMS_PER_PAGE = 20;

function getLocalizedName(product: Product, locale: "en" | "ar" | "ur") {
  return product.name[locale] || product.name.en;
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
    <div className={cn("flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[28px] border border-line bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_42%),linear-gradient(160deg,#f8fafc_0%,#eef4ef_100%)]", className)}>
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

function createProductFormState(product?: Product): ProductFormState {
  if (!product) {
    return emptyProductForm;
  }

  return {
    id: product.id,
    kind: product.kind,
    categoryId: product.categoryId ?? "",
    barcode: product.barcode ?? "",
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

export function ProductWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    currentShopId,
    locale,
    session,
    addCategory,
    deleteCategory,
    deleteProduct,
    saveProduct,
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
  const quickTabProducts = shopProducts.filter((product) => product.quickTab);
  const buildEmptyProductForm = (): ProductFormState => ({
    ...emptyProductForm,
    barcode: generateUniqueBarcode(shopProducts, currentShopId)
  });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [productForm, setProductForm] = useState<ProductFormState>(() => buildEmptyProductForm());
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const [catalogFeedback, setCatalogFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [categoryFeedback, setCategoryFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const deferredSearch = useDeferredValue(search);
  const requestedView = searchParams.get("view");
  const activeView: ProductView =
    requestedView === "editor" ||
    requestedView === "categories" ||
    requestedView === "catalog"
      ? requestedView
      : "overview";

  const filteredProducts = useMemo(() => {
    const loweredQuery = deferredSearch.trim().toLowerCase();

    return shopProducts.filter((product) => {
      const matchesCategory = categoryFilter === "all" ? true : product.categoryId === categoryFilter;
      const matchesSearch =
        loweredQuery.length === 0
          ? true
          : [product.name.en, product.name.ar, product.name.ur].some((name) =>
              name.toLowerCase().includes(loweredQuery)
            );

      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, deferredSearch, shopProducts]);
  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const totalCategoryPages = Math.max(1, Math.ceil(shopCategories.length / ITEMS_PER_PAGE));
  const currentProductPage = Math.min(productPage, totalProductPages);
  const currentCategoryPage = Math.min(categoryPage, totalCategoryPages);
  const paginatedProducts = useMemo(
    () =>
      filteredProducts.slice(
        (currentProductPage - 1) * ITEMS_PER_PAGE,
        currentProductPage * ITEMS_PER_PAGE
      ),
    [currentProductPage, filteredProducts]
  );
  const paginatedCategories = useMemo(
    () =>
      shopCategories.slice(
        (currentCategoryPage - 1) * ITEMS_PER_PAGE,
        currentCategoryPage * ITEMS_PER_PAGE
      ),
    [currentCategoryPage, shopCategories]
  );
  const lowStockProducts = useMemo(
    () =>
      shopProducts.filter(
        (product) => product.kind === "product" && product.stockQuantity <= product.reorderLevel
      ),
    [shopProducts]
  );
  const productRangeStart = filteredProducts.length === 0 ? 0 : (currentProductPage - 1) * ITEMS_PER_PAGE + 1;
  const productRangeEnd = Math.min(filteredProducts.length, currentProductPage * ITEMS_PER_PAGE);
  const categoryRangeStart = shopCategories.length === 0 ? 0 : (currentCategoryPage - 1) * ITEMS_PER_PAGE + 1;
  const categoryRangeEnd = Math.min(shopCategories.length, currentCategoryPage * ITEMS_PER_PAGE);

  const startEditProduct = (product: Product) => {
    setCatalogFeedback(null);
    setProductForm(createProductFormState(product));
    router.push("/products?view=editor");
  };

  const resetProductForm = () => {
    setProductForm(buildEmptyProductForm());
  };

  const saveProductForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isAdmin) {
      return;
    }

    startTransition(() => {
      const result = saveProduct({
        id: productForm.id,
        kind: productForm.kind,
        categoryId: productForm.categoryId || undefined,
        barcode: productForm.barcode.trim() || undefined,
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
        setCatalogFeedback({
          tone: "error",
          message: result.message ?? t("products.saveError")
        });
        return;
      }

      setCatalogFeedback({
        tone: "success",
        message: productForm.id ? t("products.updateSuccess") : t("products.saveSuccess")
      });
      resetProductForm();
    });
  };

  const saveCategoryForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isAdmin || !categoryForm.name.trim()) {
      return;
    }

    startTransition(() => {
      const result = categoryForm.id
        ? updateCategory(categoryForm.id, {
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim(),
          imageUrl: categoryForm.imageUrl.trim() || undefined
        })
        : addCategory({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim(),
          imageUrl: categoryForm.imageUrl.trim() || undefined
        });

      if (!result.ok) {
        setCategoryFeedback({
          tone: "error",
          message: result.message ?? t("products.categorySaveError")
        });
        return;
      }

      setCategoryFeedback({
        tone: "success",
        message: categoryForm.id ? t("products.categoryUpdateSuccess") : t("products.categorySaveSuccess")
      });
      setCategoryForm(emptyCategoryForm);
    });
  };

  const removeCategory = (categoryId: string) => {
    const result = deleteCategory(categoryId);

    if (!result.ok) {
      setCategoryFeedback({
        tone: "error",
        message: result.message ?? t("products.categoryRemoveError")
      });
      return;
    }

    setCategoryFeedback({
      tone: "success",
      message: t("products.categoryRemoveSuccess")
    });

    if (categoryForm.id === categoryId) {
      setCategoryForm(emptyCategoryForm);
    }
  };

  const uploadProductImage = async (file?: File | null) => {
    if (!file) {
      return;
    }

    try {
      const result = await resizeImageFileToDataUrl(file, {
        maxWidth: 640,
        maxHeight: 460,
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

  const uploadCategoryImage = async (file?: File | null) => {
    if (!file) {
      return;
    }

    try {
      const result = await resizeImageFileToDataUrl(file, {
        maxWidth: 640,
        maxHeight: 460,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("products.title")}
        subtitle={t("products.subtitle")}
        eyebrow={t("nav.products")}
      />

      <WorkspaceSectionsNav
        items={[
          {
            href: "/products?view=overview",
            active: activeView === "overview",
            label: t("products.sectionsOverview"),
            description: t("products.sectionsOverviewDesc")
          },
          {
            href: "/products?view=editor",
            active: activeView === "editor",
            label: t("products.catalogEditor"),
            description: t("products.addProductOrService")
          },
          {
            href: "/products?view=categories",
            active: activeView === "categories",
            label: t("products.categoryManager"),
            description: t("products.statsCategoriesDesc")
          },
          {
            href: "/products?view=catalog",
            active: activeView === "catalog",
            label: t("products.catalogBrowser"),
            description: t("products.browseCatalog")
          },
        ]}
      />

      {activeView === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="p-5">
              <p className="text-sm text-slate-500">{t("products.statsCatalog")}</p>
              <p className="mt-3 font-display text-3xl font-semibold text-ink">{shopProducts.length}</p>
              <p className="mt-2 text-sm text-slate-500">{t("products.statsCatalogDesc")}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-500">{t("products.statsQuickTab")}</p>
              <p className="mt-3 font-display text-3xl font-semibold text-ink">{quickTabProducts.length}</p>
              <p className="mt-2 text-sm text-slate-500">{t("products.statsQuickTabDesc")}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-500">{t("products.statsCategories")}</p>
              <p className="mt-3 font-display text-3xl font-semibold text-ink">{shopCategories.length}</p>
              <p className="mt-2 text-sm text-slate-500">{t("products.statsCategoriesDesc")}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-500">{t("products.inventoryLowStock")}</p>
              <p className="mt-3 font-display text-3xl font-semibold text-ink">{lowStockProducts.length}</p>
              <p className="mt-2 text-sm text-slate-500">{t("products.inventoryLowStockDesc")}</p>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("products.inventoryTitle")}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("products.inventoryOverviewTitle")}</h2>
              <div className="mt-6 space-y-3">
                {shopProducts
                  .filter((product) => product.kind === "product")
                  .slice(0, 6)
                  .map((product) => (
                    <div key={product.id} className="rounded-3xl border border-line bg-shell px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{getLocalizedName(product, locale)}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {t("products.inventoryStockLine", {
                              stock: product.stockQuantity,
                              reorder: product.reorderLevel
                            })}
                          </p>
                        </div>
                        <Badge variant={product.stockQuantity <= product.reorderLevel ? "warning" : "success"}>
                          {product.stockQuantity <= product.reorderLevel ? t("products.reorderNeeded") : t("products.stockHealthy")}
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>

            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("products.orderInventoryTitle")}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("products.orderInventoryTitle")}</h2>
              <div className="mt-6 space-y-3">
                {lowStockProducts.length > 0 ? (
                  lowStockProducts.map((product) => (
                    <div key={product.id} className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4">
                      <p className="text-sm font-semibold text-ink">{getLocalizedName(product, locale)}</p>
                      <p className="mt-2 text-sm text-slate-700">
                        {t("products.reorderSuggestion", {
                          quantity: Math.max(product.reorderLevel * 2 - product.stockQuantity, product.reorderLevel || 1)
                        })}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-line bg-shell/70 px-5 py-8 text-sm leading-6 text-slate-600">
                    {t("products.noInventoryWarnings")}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {!isAdmin ? (
        <Card className="border-dashed border-accent bg-accentSoft/60 p-5">
          <p className="text-sm font-medium text-ink">{t("products.readOnlyBanner")}</p>
        </Card>
      ) : null}

      {activeView === "editor" || activeView === "categories" || activeView === "catalog" ? (
        <div
          className={cn(
            "grid gap-6",
            activeView === "catalog" ? "xl:grid-cols-1" : "xl:grid-cols-1"
          )}
        >
          <div className={cn("space-y-6", activeView === "catalog" && "hidden")}>
            {activeView === "editor" ? (
              <Card className="scroll-mt-24 p-4 xl:max-h-[calc(100dvh-230px)] xl:overflow-y-auto" id="products-editor">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-olive">{t("products.catalogEditor")}</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-ink">
                  {productForm.id ? t("products.editProduct") : t("products.addProductOrService")}
                </h2>
              </div>
              {productForm.id ? (
                <Badge variant="warning">{t("products.editingBadge")}</Badge>
              ) : (
                <Badge variant="success">{t("products.newItemBadge")}</Badge>
              )}
            </div>

            {catalogFeedback ? (
              <div
                className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${
                  catalogFeedback.tone === "success"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {catalogFeedback.message}
              </div>
            ) : null}

            <form className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6" onSubmit={saveProductForm}>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.type")}</label>
                <Select
                  disabled={!isAdmin}
                  value={productForm.kind}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      kind: event.target.value as Product["kind"]
                    }))
                  }
                >
                  <option value="product">{t("productKind.product")}</option>
                  <option value="service">{t("productKind.service")}</option>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.category")}</label>
                <Select
                  disabled={!isAdmin}
                  value={productForm.categoryId}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      categoryId: event.target.value
                    }))
                  }
                >
                  <option value="">{t("common.noCategory")}</option>
                  {shopCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="md:col-span-2 xl:col-span-2">
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.barcode")}</label>
                <div className="flex gap-3">
                  <Input
                    disabled={!isAdmin}
                    readOnly
                    value={productForm.barcode}
                  />
                  <Button
                    disabled={!isAdmin}
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setProductForm((current) => ({
                        ...current,
                        barcode: generateUniqueBarcode(shopProducts, currentShopId)
                      }))
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {t("products.generateBarcode")}
                    </span>
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-500">{t("products.autoBarcodeHelp")}</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.nameEnglish")}</label>
                <Input
                  disabled={!isAdmin}
                  required
                  value={productForm.nameEn}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      nameEn: event.target.value
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.nameArabic")}</label>
                <Input
                  dir="rtl"
                  disabled={!isAdmin}
                  required
                  value={productForm.nameAr}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      nameAr: event.target.value
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.nameUrdu")}</label>
                <Input
                  dir="rtl"
                  disabled={!isAdmin}
                  required
                  value={productForm.nameUr}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      nameUr: event.target.value
                    }))
                  }
                />
              </div>

              <div className="md:col-span-3 xl:col-span-3 rounded-[24px] border border-line bg-shell/70 p-3">
                <div className="grid gap-3 md:grid-cols-[88px_minmax(0,1fr)] md:items-center">
                  <ImagePreview className="h-20 w-20 rounded-[22px]" imageUrl={productForm.imageUrl} label={t("products.productImage")} />
                  <div className="space-y-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-ink">{t("products.productImage")}</label>
                      <Input
                        disabled={!isAdmin}
                        placeholder={t("products.imageUrlPlaceholder")}
                        value={productForm.imageUrl}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            imageUrl: event.target.value
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className={cn(
                        "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:bg-slate-50",
                        !isAdmin && "pointer-events-none opacity-60"
                      )}>
                        <UploadCloud className="h-4 w-4" />
                        {t("products.uploadImage")}
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
                        <Button
                          disabled={!isAdmin}
                          type="button"
                          variant="secondary"
                          onClick={() => setProductForm((current) => ({ ...current, imageUrl: "" }))}
                        >
                          <span className="inline-flex items-center gap-2">
                            <X className="h-4 w-4" />
                            {t("products.removeImage")}
                          </span>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.salePrice")}</label>
                <Input
                  disabled={!isAdmin}
                  inputMode="decimal"
                  required
                  value={productForm.salePrice}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      salePrice: event.target.value
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.costPrice")}</label>
                <Input
                  disabled={!isAdmin}
                  inputMode="decimal"
                  required
                  value={productForm.costPrice}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      costPrice: event.target.value
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("products.stockQuantity")}</label>
                <Input
                  disabled={!isAdmin || productForm.kind === "service"}
                  inputMode="numeric"
                  value={productForm.kind === "service" ? "0" : productForm.stockQuantity}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      stockQuantity: event.target.value.replace(/[^\d]/g, "")
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("products.reorderLevel")}</label>
                <Input
                  disabled={!isAdmin || productForm.kind === "service"}
                  inputMode="numeric"
                  value={productForm.kind === "service" ? "0" : productForm.reorderLevel}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      reorderLevel: event.target.value.replace(/[^\d]/g, "")
                    }))
                  }
                />
              </div>

              <div className="rounded-[22px] border border-line bg-shell p-3">
                <label className="flex items-center gap-3 text-sm font-medium text-ink">
                  <input
                    checked={productForm.quickTab}
                    className="h-4 w-4"
                    disabled={!isAdmin}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        quickTab: event.target.checked
                      }))
                    }
                    type="checkbox"
                  />
                  {t("products.showOnQuickTab")}
                </label>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {t("products.currentProfitPreview", {
                    amount: formatCurrency(
                      Number(productForm.salePrice || 0) - Number(productForm.costPrice || 0),
                      "SAR",
                      locale
                    )
                  })}
                </p>
              </div>

              <div className="rounded-[22px] border border-line bg-shell p-3">
                <label className="flex items-center gap-3 text-sm font-medium text-ink">
                  <input
                    checked={productForm.taxable}
                    className="h-4 w-4"
                    disabled={!isAdmin}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        taxable: event.target.checked
                      }))
                    }
                    type="checkbox"
                  />
                  {t("products.applyTaxToItem")}
                </label>
                <p className="mt-2 text-xs leading-5 text-slate-600">{t("products.applyTaxToItemDesc")}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.status")}</label>
                <Select
                  disabled={!isAdmin}
                  value={productForm.status}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      status: event.target.value as Product["status"]
                    }))
                  }
                >
                  <option value="active">{t("common.active")}</option>
                  <option value="inactive">{t("common.inactive")}</option>
                </Select>
              </div>

              <div className="flex flex-wrap gap-3 md:col-span-3 xl:col-span-6">
                <Button
                  disabled={
                    !isAdmin ||
                    !productForm.nameEn.trim() ||
                    !productForm.nameAr.trim() ||
                    !productForm.nameUr.trim()
                  }
                  type="submit"
                >
                  {productForm.id ? t("products.updateProduct") : t("products.addProduct")}
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
                  {t("common.clearForm")}
                </Button>
              </div>
            </form>
              </Card>
            ) : null}

            {activeView === "categories" ? (
              <Card className="p-6 scroll-mt-24" id="products-categories">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("products.categoryManager")}</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
                  {categoryForm.id ? t("products.editCategory") : t("products.addCategory")}
                </h2>
              </div>
              <FolderPlus className="h-5 w-5 text-ink" />
            </div>

            {categoryFeedback ? (
              <div
                className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${
                  categoryFeedback.tone === "success"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {categoryFeedback.message}
              </div>
            ) : null}

            <form className="mt-6 space-y-4" onSubmit={saveCategoryForm}>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("products.categoryName")}</label>
                <Input
                  disabled={!isAdmin}
                  value={categoryForm.name}
                  onChange={(event) =>
                    setCategoryForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.description")}</label>
                <Textarea
                  disabled={!isAdmin}
                  value={categoryForm.description}
                  onChange={(event) =>
                    setCategoryForm((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                />
              </div>
              <div className="rounded-[30px] border border-line bg-shell/70 p-4">
                <div className="grid gap-4 md:grid-cols-[128px_minmax(0,1fr)] md:items-center">
                  <ImagePreview className="h-28 w-28" imageUrl={categoryForm.imageUrl} label={t("products.categoryImage")} />
                  <div className="space-y-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-ink">{t("products.categoryImage")}</label>
                      <Input
                        disabled={!isAdmin}
                        placeholder={t("products.imageUrlPlaceholder")}
                        value={categoryForm.imageUrl}
                        onChange={(event) =>
                          setCategoryForm((current) => ({
                            ...current,
                            imageUrl: event.target.value
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <label className={cn(
                        "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50",
                        !isAdmin && "pointer-events-none opacity-60"
                      )}>
                        <UploadCloud className="h-4 w-4" />
                        {t("products.uploadImage")}
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
                        <Button
                          disabled={!isAdmin}
                          type="button"
                          variant="secondary"
                          onClick={() => setCategoryForm((current) => ({ ...current, imageUrl: "" }))}
                        >
                          <span className="inline-flex items-center gap-2">
                            <X className="h-4 w-4" />
                            {t("products.removeImage")}
                          </span>
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{t("products.categoryImageHelp")}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button disabled={!isAdmin || !categoryForm.name.trim()} type="submit">
                  {categoryForm.id ? t("products.updateCategory") : t("products.addCategoryAction")}
                </Button>
                <Button
                  disabled={!isAdmin}
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCategoryFeedback(null);
                    setCategoryForm(emptyCategoryForm);
                  }}
                >
                  {t("common.clearForm")}
                </Button>
              </div>
            </form>

            <div className="mt-6 space-y-3">
              {paginatedCategories.map((category) => (
                <div
                  key={category.id}
                  className="rounded-3xl border border-line bg-shell p-4 transition hover:shadow-card"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <ImagePreview className="h-16 w-16 rounded-[20px]" imageUrl={category.imageUrl} label={category.name.slice(0, 2).toUpperCase()} />
                        <div>
                          <p className="text-sm font-semibold text-ink">{category.name}</p>
                          <p className="mt-1 text-sm text-slate-600">{category.description || t("common.noDescriptionYet")}</p>
                        </div>
                      </div>
                    </div>
                    <Badge variant="neutral">
                      {t("products.categoryItems", {
                        count: shopProducts.filter((product) => product.categoryId === category.id).length
                      })}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setCategoryFeedback(null);
                        setCategoryForm({
                          id: category.id,
                          name: category.name,
                          description: category.description ?? "",
                          imageUrl: category.imageUrl ?? ""
                        });
                      }}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Edit3 className="h-4 w-4" />
                        {t("common.edit")}
                      </span>
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => removeCategory(category.id)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Trash2 className="h-4 w-4" />
                        {t("products.removeCategory")}
                      </span>
                    </Button>
                  </div>
                </div>
              ))}

              {shopCategories.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600">
                    {t("common.showingItemsRange", {
                      from: String(categoryRangeStart),
                      to: String(categoryRangeEnd),
                      total: String(shopCategories.length)
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={currentCategoryPage <= 1}
                      onClick={() => setCategoryPage((current) => Math.max(1, current - 1))}
                    >
                      {t("common.previous")}
                    </Button>
                    <span className="text-sm font-medium text-ink">
                      {t("common.page")} {currentCategoryPage} {t("common.of")} {totalCategoryPages}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={currentCategoryPage >= totalCategoryPages}
                      onClick={() => setCategoryPage((current) => Math.min(totalCategoryPages, current + 1))}
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
              </Card>
            ) : null}
          </div>

          <div className={cn("space-y-6", activeView !== "catalog" && "hidden")}>
            {activeView === "catalog" ? (
              <Card className="p-6 scroll-mt-24" id="products-browser">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("products.catalogBrowser")}</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("products.browseCatalog")}</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-11"
                    placeholder={t("common.searchInAnyLanguage")}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setProductPage(1);
                    }}
                  />
                </label>
                <Select
                  value={categoryFilter}
                  onChange={(event) => {
                    setCategoryFilter(event.target.value);
                    setProductPage(1);
                  }}
                >
                  <option value="all">{t("common.allCategories")}</option>
                  {shopCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {paginatedProducts.map((product) => {
                const category = shopCategories.find((item) => item.id === product.categoryId);

                return (
                  <Card key={product.id} className="p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <ImagePreview
                          className="hidden h-20 w-20 rounded-[22px] sm:flex"
                          imageUrl={product.imageUrl}
                          label={getLocalizedName(product, locale).slice(0, 2).toUpperCase()}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-ink">{getLocalizedName(product, locale)}</p>
                            <Badge variant={product.kind === "service" ? "warning" : "neutral"}>
                              {t(productKindLabelKeys[product.kind])}
                            </Badge>
                            {product.quickTab ? <Badge variant="success">{t("products.quickTabBadge")}</Badge> : null}
                            <Badge variant={product.taxable ? "success" : "warning"}>
                              {product.taxable ? t("products.taxApplied") : t("products.taxExempt")}
                            </Badge>
                            {category ? <Badge variant="neutral">{category.name}</Badge> : null}
                          </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                          <p>
                            <span className="font-medium text-ink">{t("products.localizedEn")}:</span> {product.name.en}
                          </p>
                          <p>
                            <span className="font-medium text-ink">{t("products.localizedAr")}:</span> {product.name.ar}
                          </p>
                          <p>
                            <span className="font-medium text-ink">{t("products.localizedUr")}:</span> {product.name.ur}
                          </p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-600">
                          {product.barcode ? (
                            <p>
                              <span className="font-medium text-ink">{t("common.barcode")}:</span> {product.barcode}
                            </p>
                          ) : null}
                          <p>
                            <span className="font-medium text-ink">{t("common.salePrice")}:</span>{" "}
                            {formatCurrency(product.salePrice, "SAR", locale)}
                          </p>
                          <p>
                            <span className="font-medium text-ink">{t("common.costPrice")}:</span>{" "}
                            {formatCurrency(product.costPrice, "SAR", locale)}
                          </p>
                          <p>
                            <span className="font-medium text-ink">{t("common.profit")}:</span>{" "}
                            {formatCurrency(product.salePrice - product.costPrice, "SAR", locale)}
                          </p>
                          <p>
                            <span className="font-medium text-ink">{t("products.inventoryShort")}:</span>{" "}
                            {product.stockQuantity}
                          </p>
                        </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button size="sm" variant="secondary" onClick={() => startEditProduct(product)}>
                          <span className="inline-flex items-center gap-2">
                            <Edit3 className="h-4 w-4" />
                            {isAdmin ? t("common.edit") : t("common.view")}
                          </span>
                        </Button>
                        {isAdmin ? (
                          <Button size="sm" variant="danger" onClick={() => setDeleteTarget(product)}>
                            <span className="inline-flex items-center gap-2">
                              <Trash2 className="h-4 w-4" />
                              {t("common.moveToTrash")}
                            </span>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              })}

              {filteredProducts.length === 0 ? (
                <Card className="p-5">
                  <p className="text-sm leading-6 text-slate-600">{t("products.noFilterResults")}</p>
                </Card>
              ) : null}

              {filteredProducts.length > 0 ? (
                <Card className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-600">
                      {t("common.showingItemsRange", {
                        from: String(productRangeStart),
                        to: String(productRangeEnd),
                        total: String(filteredProducts.length)
                      })}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={currentProductPage <= 1}
                        onClick={() => setProductPage((current) => Math.max(1, current - 1))}
                      >
                        {t("common.previous")}
                      </Button>
                      <span className="text-sm font-medium text-ink">
                        {t("common.page")} {currentProductPage} {t("common.of")} {totalProductPages}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={currentProductPage >= totalProductPages}
                        onClick={() => setProductPage((current) => Math.min(totalProductPages, current + 1))}
                      >
                        {t("common.next")}
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
              </Card>
            ) : null}

            {activeView === "catalog" ? (
              <Card className="p-6 scroll-mt-24" id="products-quick-tab">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("products.quickBillingPreview")}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("products.preparedForBilling")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("products.preparedForBillingDesc")}</p>

            <div className="mt-6">
              <ProductQuickTabGrid products={quickTabProducts} />
            </div>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 p-4">
          <Card className="w-full max-w-xl p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("products.moveToTrashTitle")}</p>
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
