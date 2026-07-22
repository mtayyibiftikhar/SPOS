"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Barcode,
  Check,
  ClipboardList,
  Database,
  Edit3,
  FileText,
  History,
  PackageCheck,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingBasket,
  Trash2,
  Truck,
  Warehouse,
  X
} from "lucide-react";
import { InventoryDataWorkspace } from "@/components/inventory/inventory-data-workspace";
import { useRouter, useSearchParams } from "next/navigation";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createStructuredReportPdfBlob, downloadBlob } from "@/lib/report-export";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import type { Product, PurchaseOrder, PurchaseOrderItem, PurchasePaymentStatus, Supplier, SupplierPaymentMethod } from "@/types/pos";

type InventoryView = "overview" | "add" | "adjust" | "order" | "suppliers" | "data";
type AdjustMode = "item" | "supplier" | "category";
type PurchaseOrderStep = "items" | "supplier";
type PurchaseOrderTab = "create" | "history" | "reorder";
type PurchaseOrderFilter = "open" | "completed" | "cancelled";
type SupplierView = "list" | "form" | "detail";

type RestockLine = {
  costPrice: string;
  lineId: string;
  productId: string;
  quantity: string;
  supplierId: string;
};

type HeldRestockCart = {
  createdAt: string;
  id: string;
  items: RestockLine[];
  label: string;
};

type PurchaseOrderDraftItem = {
  costPrice: string;
  productId: string;
  quantity: string;
};

type PurchaseOrderReceiveItem = {
  costPrice: string;
  quantity: string;
};

type StockDraft = {
  costPrice: string;
  quantity: string;
  reason: string;
  reorderLevel: string;
  supplierId: string;
};

const ITEMS_PER_PAGE = 12;
const GENERAL_SUPPLIER_KEY = "__general_supplier__";
const GENERAL_SUPPLIER_NAME = "General supplier";

function getProductName(product: Product, locale: "en" | "ar" | "ur") {
  return product.name[locale] || product.name.en;
}

function createPoNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `PO-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function buildSuggestedOrderQuantity(product: Product) {
  return Math.max(product.reorderLevel * 2 - product.stockQuantity, product.reorderLevel || 1);
}

function getProductBarcodes(product: Product) {
  return Array.from(new Set([product.barcode, ...(product.barcodes ?? [])].filter(Boolean) as string[]));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productMatches(product: Product, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [
    product.name.en,
    product.name.ar,
    product.name.ur,
    product.barcode ?? "",
    ...(product.barcodes ?? [])
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function SectionEyebrow({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">{children}</p>;
}

function MetricCard({ label, value, tone = "plain" }: { label: string; tone?: "green" | "plain" | "warm"; value: string | number }) {
  return (
    <Card
      className={cn(
        "min-h-32 p-5",
        tone === "green" ? "border-emerald-200 bg-emerald-50" : tone === "warm" ? "border-amber-200 bg-amber-50" : "bg-white"
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
    </Card>
  );
}

function EmptyBox({ children }: { children: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm leading-6 text-slate-600">
      {children}
    </div>
  );
}

export function InventoryWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    adjustInventory,
    cancelPurchaseOrder,
    createPurchaseOrder,
    currentShop,
    currentShopId,
    deleteSupplier,
    locale,
    receivePurchaseOrder,
    saveProduct,
    saveSupplier,
    session,
    state,
    t
  } = usePosApp();
  const requestedView = searchParams.get("view");
  const activeView: InventoryView =
    requestedView === "add" ||
    requestedView === "adjust" ||
    requestedView === "order" ||
    requestedView === "suppliers" ||
    requestedView === "data"
      ? requestedView
      : "overview";
  const currency = currentShop?.currency ?? "SAR";
  const isManager = session?.role === "shop_admin";
  const shopProducts = useMemo(
    () => state.products.filter((product) => product.shopId === currentShopId),
    [currentShopId, state.products]
  );
  const categories = useMemo(
    () =>
      state.categories
        .filter((category) => category.shopId === currentShopId)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [currentShopId, state.categories]
  );
  const physicalProducts = useMemo(
    () =>
      shopProducts
        .filter((product) => product.kind === "product")
        .sort((left, right) => getProductName(left, locale).localeCompare(getProductName(right, locale))),
    [locale, shopProducts]
  );
  const productById = useMemo(
    () =>
      physicalProducts.reduce<Record<string, Product>>((accumulator, product) => {
        accumulator[product.id] = product;
        return accumulator;
      }, {}),
    [physicalProducts]
  );
  const suppliers = useMemo(
    () =>
      state.suppliers
        .filter((supplier) => supplier.shopId === currentShopId)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [currentShopId, state.suppliers]
  );
  const supplierById = useMemo(
    () =>
      suppliers.reduce<Record<string, Supplier>>((accumulator, supplier) => {
        accumulator[supplier.id] = supplier;
        return accumulator;
      }, {}),
    [suppliers]
  );
  const categoryById = useMemo(
    () =>
      categories.reduce<Record<string, string>>((accumulator, category) => {
        accumulator[category.id] = category.name;
        return accumulator;
      }, {}),
    [categories]
  );
  const purchaseOrders = useMemo(
    () =>
      state.purchaseOrders
        .filter((order) => order.shopId === currentShopId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShopId, state.purchaseOrders]
  );
  const purchaseOrderItemsByOrderId = useMemo(
    () =>
      state.purchaseOrderItems.reduce<Record<string, PurchaseOrderItem[]>>((accumulator, item) => {
        accumulator[item.purchaseOrderId] = [...(accumulator[item.purchaseOrderId] ?? []), item];
        return accumulator;
      }, {}),
    [state.purchaseOrderItems]
  );
  const lowStockProducts = useMemo(
    () => physicalProducts.filter((product) => product.stockQuantity <= product.reorderLevel),
    [physicalProducts]
  );
  const stockValue = physicalProducts.reduce((sum, product) => sum + product.stockQuantity * product.costPrice, 0);
  const productSupplierIds = useMemo(() => {
    const map = physicalProducts.reduce<Record<string, string[]>>((accumulator, product) => {
      accumulator[product.id] = [];
      return accumulator;
    }, {});

    state.inventoryBatches
      .filter((batch) => batch.shopId === currentShopId && batch.supplierId && map[batch.productId])
      .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime())
      .forEach((batch) => {
        const supplierId = batch.supplierId;

        if (!supplierId || !supplierById[supplierId]) {
          return;
        }

        map[batch.productId] = Array.from(new Set([supplierId, ...(map[batch.productId] ?? [])]));
      });

    return map;
  }, [currentShopId, physicalProducts, state.inventoryBatches, supplierById]);
  const productPrimarySupplierId = useMemo(
    () =>
      physicalProducts.reduce<Record<string, string | undefined>>((accumulator, product) => {
        accumulator[product.id] = productSupplierIds[product.id]?.[0];
        return accumulator;
      }, {}),
    [physicalProducts, productSupplierIds]
  );
  const lowStockGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; products: Product[]; supplierId?: string }>();

    lowStockProducts.forEach((product) => {
      const supplierId = productPrimarySupplierId[product.id];
      const key = supplierId ?? GENERAL_SUPPLIER_KEY;
      const existing = groups.get(key);

      groups.set(key, {
        key,
        label: supplierId ? supplierById[supplierId]?.name ?? GENERAL_SUPPLIER_NAME : GENERAL_SUPPLIER_NAME,
        products: [...(existing?.products ?? []), product],
        supplierId
      });
    });

    return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [lowStockProducts, productPrimarySupplierId, supplierById]);

  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const [overviewSearch, setOverviewSearch] = useState("");
  const [overviewCategoryId, setOverviewCategoryId] = useState("");
  const [overviewSupplierId, setOverviewSupplierId] = useState("");
  const [overviewPage, setOverviewPage] = useState(1);
  const [addInventorySearch, setAddInventorySearch] = useState("");
  const [restockLines, setRestockLines] = useState<RestockLine[]>([]);
  const [heldRestocks, setHeldRestocks] = useState<HeldRestockCart[]>([]);
  const [showHeldRestocks, setShowHeldRestocks] = useState(false);
  const [adjustMode, setAdjustMode] = useState<AdjustMode>("item");
  const [adjustSearch, setAdjustSearch] = useState("");
  const [adjustSupplierId, setAdjustSupplierId] = useState("");
  const [adjustCategoryId, setAdjustCategoryId] = useState("");
  const [editingStockProductId, setEditingStockProductId] = useState("");
  const [stockDraft, setStockDraft] = useState<StockDraft>({
    costPrice: "",
    quantity: "",
    reason: "",
    reorderLevel: "",
    supplierId: ""
  });
  const [orderTab, setOrderTab] = useState<PurchaseOrderTab>("create");
  const [orderStep, setOrderStep] = useState<PurchaseOrderStep>("items");
  const [orderSupplierId, setOrderSupplierId] = useState("");
  const [orderSupplierName, setOrderSupplierName] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderItems, setOrderItems] = useState<PurchaseOrderDraftItem[]>([]);
  const [orderPaymentMethod, setOrderPaymentMethod] = useState<SupplierPaymentMethod>("credit");
  const [orderPaidAmount, setOrderPaidAmount] = useState("");
  const [poNumber, setPoNumber] = useState(createPoNumber);
  const [poExpectedAt, setPoExpectedAt] = useState("");
  const [poNote, setPoNote] = useState("");
  const [poFilter, setPoFilter] = useState<PurchaseOrderFilter>("open");
  const [reorderSearch, setReorderSearch] = useState("");
  const [receivingOrderId, setReceivingOrderId] = useState("");
  const [receiveItems, setReceiveItems] = useState<Record<string, PurchaseOrderReceiveItem>>({});
  const [receivePaymentMethod, setReceivePaymentMethod] = useState<SupplierPaymentMethod>("credit");
  const [receivePaidAmount, setReceivePaidAmount] = useState("");
  const [supplierView, setSupplierView] = useState<SupplierView>("list");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplierDetailId, setSelectedSupplierDetailId] = useState("");
  const [supplierForm, setSupplierForm] = useState({
    accountBalance: "",
    address: "",
    contactPerson: "",
    defaultPaymentMethod: "credit" as SupplierPaymentMethod,
    email: "",
    id: "",
    name: "",
    phone: "",
    vatNumber: ""
  });

  const holdStorageKey = `spos-held-inventory-${currentShopId ?? "no-shop"}`;
  const addInventoryQuery = addInventorySearch.trim().toLowerCase();
  const exactBarcodeProduct = shopProducts.find((product) =>
    getProductBarcodes(product).some((barcode) => barcode.trim() === addInventorySearch.trim())
  );
  const addInventoryResults = physicalProducts
    .filter((product) => !restockLines.some((line) => line.productId === product.id))
    .filter((product) => productMatches(product, addInventoryQuery))
    .slice(0, addInventoryQuery ? 8 : 6);
  const selectedStockProduct = physicalProducts.find((product) => product.id === editingStockProductId) ?? null;
  const overviewFilteredProducts = physicalProducts.filter((product) => {
    const matchesSearch = productMatches(product, overviewSearch);
    const matchesCategory = !overviewCategoryId || product.categoryId === overviewCategoryId;
    const supplierIds = productSupplierIds[product.id] ?? [];
    const matchesSupplier =
      !overviewSupplierId ||
      (overviewSupplierId === GENERAL_SUPPLIER_KEY ? supplierIds.length === 0 : supplierIds.includes(overviewSupplierId));

    return matchesSearch && matchesCategory && matchesSupplier;
  });
  const overviewPageCount = Math.max(1, Math.ceil(overviewFilteredProducts.length / ITEMS_PER_PAGE));
  const safeOverviewPage = Math.min(overviewPage, overviewPageCount);
  const overviewPageProducts = overviewFilteredProducts.slice((safeOverviewPage - 1) * ITEMS_PER_PAGE, safeOverviewPage * ITEMS_PER_PAGE);
  const adjustModeProducts = physicalProducts.filter((product) => {
    const matchesSearch = productMatches(product, adjustSearch);

    if (adjustMode === "supplier") {
      if (!adjustSupplierId) {
        return matchesSearch;
      }

      const supplierIds = productSupplierIds[product.id] ?? [];
      return matchesSearch && (adjustSupplierId === GENERAL_SUPPLIER_KEY ? supplierIds.length === 0 : supplierIds.includes(adjustSupplierId));
    }

    if (adjustMode === "category") {
      return matchesSearch && (!adjustCategoryId || product.categoryId === adjustCategoryId);
    }

    return matchesSearch;
  });
  const filteredStockProducts = adjustModeProducts.slice(0, ITEMS_PER_PAGE);
  const orderProductIds = new Set(orderItems.map((item) => item.productId));
  const orderSearchResults = physicalProducts
    .filter((product) => !orderProductIds.has(product.id))
    .filter((product) => productMatches(product, orderSearch))
    .slice(0, orderSearch.trim() ? 8 : 6);
  const orderSupplier = suppliers.find((supplier) => supplier.id === orderSupplierId);
  const orderTotal = orderItems.reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity || 0));
    const cost = Math.max(0, Number(item.costPrice || 0));
    return sum + quantity * cost;
  }, 0);
  const orderPaidAmountNumber = Math.min(orderTotal, Math.max(0, Number(orderPaidAmount || 0)));
  const orderDueAmount = Math.max(0, orderTotal - orderPaidAmountNumber);
  const orderPaymentStatus: PurchasePaymentStatus =
    orderPaidAmountNumber >= orderTotal && orderTotal > 0
      ? "paid"
      : orderPaidAmountNumber > 0
        ? "partial"
        : "unpaid";
  const filteredPurchaseOrders = purchaseOrders.filter((order) => {
    if (poFilter === "completed") {
      return order.status === "received";
    }

    if (poFilter === "cancelled") {
      return order.status === "cancelled";
    }

    return order.status === "ordered" || order.status === "partially_received";
  });
  const reorderOrders = purchaseOrders.filter((order) => {
    const query = reorderSearch.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return [order.number, order.supplierName].some((value) => value.toLowerCase().includes(query));
  });
  const filteredSuppliers = suppliers.filter((supplier) => {
    const query = supplierSearch.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return [supplier.name, supplier.phone ?? "", supplier.email ?? "", supplier.vatNumber ?? ""].some((value) =>
      value.toLowerCase().includes(query)
    );
  });
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierDetailId) ?? null;

  useEffect(() => {
    setOverviewPage(1);
  }, [overviewSearch, overviewCategoryId, overviewSupplierId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(holdStorageKey);
      setHeldRestocks(raw ? JSON.parse(raw) : []);
    } catch {
      setHeldRestocks([]);
    }
  }, [holdStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(holdStorageKey, JSON.stringify(heldRestocks.slice(0, 2)));
    } catch {
      // Local held inventory is a convenience only; ignore storage failures.
    }
  }, [heldRestocks, holdStorageKey]);

  const resetSupplierForm = () => {
    setSupplierForm({
      accountBalance: "",
      address: "",
      contactPerson: "",
      defaultPaymentMethod: "credit",
      email: "",
      id: "",
      name: "",
      phone: "",
      vatNumber: ""
    });
  };

  const supplierStats = (supplier: Supplier) => {
    const orders = purchaseOrders.filter(
      (order) => order.supplierId === supplier.id || order.supplierName.toLowerCase() === supplier.name.toLowerCase()
    );
    const orderIds = new Set(orders.map((order) => order.id));
    const items = state.purchaseOrderItems.filter((item) => orderIds.has(item.purchaseOrderId));
    const units = items.reduce((sum, item) => sum + item.quantity, 0);
    const amount = orders.reduce((sum, order) => sum + (order.totalAmount ?? 0), 0);
    const paid = orders.reduce((sum, order) => sum + (order.paidAmount ?? 0), 0);

    return {
      amount,
      orders,
      paid,
      due: supplier.accountBalance ?? Math.max(0, amount - paid),
      units
    };
  };

  const startStockEdit = (product: Product) => {
    setEditingStockProductId(product.id);
    setStockDraft({
      costPrice: String(product.costPrice),
      quantity: String(product.stockQuantity),
      reason: "",
      reorderLevel: String(product.reorderLevel),
      supplierId: ""
    });
    setFeedback(null);
  };

  const addProductToRestock = (product: Product) => {
    if (!isManager) {
      setFeedback({ tone: "error", message: "Only the shop admin can add inventory." });
      return;
    }

    if (product.kind !== "product") {
      setFeedback({ tone: "error", message: "Only physical products can be restocked. This barcode belongs to a service." });
      return;
    }

    setRestockLines((current) => {
      const existing = current.find((line) => line.productId === product.id);

      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: String(Number(line.quantity || 0) + 1) }
            : line
        );
      }

      return [
        ...current,
        {
          costPrice: String(product.costPrice),
          lineId: `${product.id}-${Date.now()}`,
          productId: product.id,
          quantity: "1",
          supplierId: ""
        }
      ];
    });
    setAddInventorySearch("");
  };

  const scanAddInventory = () => {
    if (!addInventorySearch.trim()) {
      return;
    }

    if (exactBarcodeProduct) {
      addProductToRestock(exactBarcodeProduct);
      return;
    }

    if (addInventoryResults.length === 1) {
      addProductToRestock(addInventoryResults[0]);
      return;
    }

    setFeedback({ tone: "error", message: "No matching physical product found. Search by product name or scan a product barcode." });
  };

  const updateRestockLine = (lineId: string, patch: Partial<RestockLine>) => {
    setRestockLines((current) => current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)));
  };

  const submitRestockCart = () => {
    if (!isManager) {
      setFeedback({ tone: "error", message: "Only the shop admin can add inventory." });
      return;
    }

    if (restockLines.length === 0) {
      setFeedback({ tone: "error", message: "Add at least one product to receive inventory." });
      return;
    }

    const failures: string[] = [];

    restockLines.forEach((line) => {
      const product = productById[line.productId];
      const quantity = Number(line.quantity || 0);
      const costPrice = Number(line.costPrice || product?.costPrice || 0);

      if (!product) {
        failures.push("Product missing");
        return;
      }

      const result = adjustInventory({
        costPrice,
        productId: product.id,
        quantity,
        reason: "Inventory received",
        supplierId: line.supplierId || undefined,
        type: "add"
      });

      if (!result.ok) {
        failures.push(`${getProductName(product, locale)}: ${result.message ?? "failed"}`);
      }
    });

    if (failures.length > 0) {
      setFeedback({ tone: "error", message: failures.slice(0, 2).join(" | ") });
      return;
    }

    setRestockLines([]);
    setFeedback({ tone: "success", message: "Inventory received and stock updated." });
  };

  const holdRestockCart = () => {
    if (restockLines.length === 0) {
      setFeedback({ tone: "error", message: "Add products before holding inventory." });
      return;
    }

    if (heldRestocks.length >= 2) {
      setFeedback({ tone: "error", message: "Only two inventory drafts can be held on this device." });
      return;
    }

    const createdAt = new Date().toISOString();
    const label = `Held inventory ${heldRestocks.length + 1}`;

    setHeldRestocks((current) => [
      {
        createdAt,
        id: `${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
        items: restockLines,
        label
      },
      ...current
    ].slice(0, 2));
    setRestockLines([]);
    setFeedback({ tone: "success", message: "Inventory draft held locally on this device." });
  };

  const restoreHeldRestock = (heldId: string) => {
    const held = heldRestocks.find((entry) => entry.id === heldId);

    if (!held) {
      return;
    }

    setRestockLines(held.items);
    setHeldRestocks((current) => current.filter((entry) => entry.id !== heldId));
    setFeedback({ tone: "success", message: "Held inventory draft restored." });
  };

  const saveStockCorrection = () => {
    if (!selectedStockProduct || !isManager) {
      return;
    }

    const targetQuantity = Math.max(0, Number(stockDraft.quantity || 0));
    const nextCostPrice = Math.max(0, Number(stockDraft.costPrice || selectedStockProduct.costPrice));
    const nextReorderLevel = Math.max(0, Number(stockDraft.reorderLevel || 0));
    const delta = Math.round((targetQuantity - selectedStockProduct.stockQuantity) * 100) / 100;

    if (!Number.isFinite(targetQuantity) || !Number.isFinite(nextCostPrice) || !Number.isFinite(nextReorderLevel)) {
      setFeedback({ tone: "error", message: "Enter valid stock, cost, and reorder values." });
      return;
    }

    if (delta !== 0) {
      const result = adjustInventory({
        costPrice: delta > 0 ? nextCostPrice : undefined,
        productId: selectedStockProduct.id,
        quantity: Math.abs(delta),
        reason: stockDraft.reason || "Inventory correction",
        supplierId: delta > 0 ? stockDraft.supplierId || undefined : undefined,
        type: delta > 0 ? "add" : "remove"
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.message ?? "Unable to correct inventory." });
        return;
      }
    }

    const result = saveProduct({
      barcodes: selectedStockProduct.barcodes,
      barcode: selectedStockProduct.barcode,
      categoryId: selectedStockProduct.categoryId,
      costPrice: nextCostPrice,
      id: selectedStockProduct.id,
      imageUrl: selectedStockProduct.imageUrl,
      kind: selectedStockProduct.kind,
      name: selectedStockProduct.name,
      quickTab: selectedStockProduct.quickTab,
      reorderLevel: nextReorderLevel,
      salePrice: selectedStockProduct.salePrice,
      status: selectedStockProduct.status,
      stockQuantity: targetQuantity,
      taxable: selectedStockProduct.taxable
    });

    setFeedback({ tone: result.ok ? "success" : "error", message: result.ok ? "Inventory correction saved." : result.message ?? "Unable to save product." });

    if (result.ok) {
      setEditingStockProductId("");
      setStockDraft({ costPrice: "", quantity: "", reason: "", reorderLevel: "", supplierId: "" });
    }
  };

  const addProductToOrder = (product: Product) => {
    setOrderItems((current) => [
      ...current,
      {
        costPrice: String(product.costPrice),
        productId: product.id,
        quantity: String(buildSuggestedOrderQuantity(product))
      }
    ]);
    setOrderSearch("");
  };

  const loadLowStockGroupForOrder = (groupKey: string, shouldNavigate = false) => {
    const group = lowStockGroups.find((entry) => entry.key === groupKey);

    if (!group || group.products.length === 0) {
      setFeedback({ tone: "error", message: "No low-stock products need ordering right now." });
      return;
    }

    setOrderItems(
      group.products.map((product) => ({
        costPrice: String(product.costPrice),
        productId: product.id,
        quantity: String(buildSuggestedOrderQuantity(product))
      }))
    );
    setOrderSupplierId(group.supplierId ?? "");
    setOrderSupplierName(group.supplierId ? "" : GENERAL_SUPPLIER_NAME);
    setOrderTab("create");
    setOrderStep("items");
    setFeedback({ tone: "success", message: `${group.label} low-stock items loaded into a one-supplier PO.` });

    if (shouldNavigate) {
      router.push("/inventory?view=order");
    }
  };

  const addLowStockToOrder = () => {
    if (lowStockGroups.length === 1) {
      loadLowStockGroupForOrder(lowStockGroups[0].key);
      return;
    }

    setFeedback({ tone: "error", message: "Choose a supplier group first so the purchase order stays clean." });
  };

  const updateOrderItem = (productId: string, patch: Partial<PurchaseOrderDraftItem>) => {
    setOrderItems((current) => current.map((item) => (item.productId === productId ? { ...item, ...patch } : item)));
  };

  const removeOrderItem = (productId: string) => {
    setOrderItems((current) => current.filter((item) => item.productId !== productId));
  };

  const updateOrderPaidAmount = (value: string) => {
    const parsed = Number(value || 0);

    if (Number.isFinite(parsed) && parsed > orderTotal) {
      setOrderPaidAmount(String(orderTotal));
      setFeedback({ tone: "error", message: "Amount paid cannot exceed PO total." });
      return;
    }

    setOrderPaidAmount(value);
  };

  const resetPoDraft = () => {
    setOrderItems([]);
    setOrderSearch("");
    setOrderSupplierId("");
    setOrderSupplierName("");
    setOrderPaidAmount("");
    setOrderPaymentMethod("credit");
    setPoExpectedAt("");
    setPoNote("");
    setPoNumber(createPoNumber());
    setOrderStep("items");
  };

  const downloadInventoryPdf = async () => {
    const generatedAt = new Date().toISOString();
    const inventoryRows = overviewFilteredProducts.map((product) => {
      const supplierNames = (productSupplierIds[product.id] ?? [])
        .map((supplierId) => supplierById[supplierId]?.name)
        .filter(Boolean)
        .join(", ");

      return {
        label: getProductName(product, locale),
        value: formatCurrency(product.stockQuantity * product.costPrice, currency, locale),
        detail: [
          `Barcode: ${product.barcode ?? "No barcode"}`,
          `Category: ${product.categoryId ? categoryById[product.categoryId] ?? "No category" : "No category"}`,
          `Supplier: ${supplierNames || GENERAL_SUPPLIER_NAME}`,
          `Stock: ${product.stockQuantity} | Reorder: ${product.reorderLevel} | Cost: ${formatCurrency(product.costPrice, currency, locale)}`
        ].join(" | ")
      };
    });
    const blob = await createStructuredReportPdfBlob({
      generatedAt,
      logoUrl: currentShopId ? state.settingsByShop[currentShopId]?.pos.logoUrl : undefined,
      period: formatDateTime(generatedAt, locale),
      sections: [
        {
          title: "Inventory summary",
          rows: [
            { label: "Products", value: String(physicalProducts.length) },
            { label: "Stock value", value: formatCurrency(stockValue, currency, locale) },
            { label: "Low stock", value: String(lowStockProducts.length) },
            { label: "Suppliers", value: String(suppliers.length) }
          ]
        },
        {
          title: "Applied filters",
          rows: [
            { label: "Search", value: overviewSearch || "All products" },
            { label: "Category", value: overviewCategoryId ? categoryById[overviewCategoryId] ?? "Selected category" : "All categories" },
            {
              label: "Supplier",
              value:
                overviewSupplierId === GENERAL_SUPPLIER_KEY
                  ? GENERAL_SUPPLIER_NAME
                  : overviewSupplierId
                    ? supplierById[overviewSupplierId]?.name ?? "Selected supplier"
                    : "All suppliers"
            }
          ]
        },
        {
          title: "Inventory list",
          rows: inventoryRows.length > 0 ? inventoryRows : [{ label: "No products", value: "No stock matched the current filters." }]
        }
      ],
      shopName: currentShop?.name ?? "Simple POS",
      subtitle: "Stock value, reorder levels, supplier, and category inventory record.",
      title: "Inventory Report"
    });

    downloadBlob(blob, `inventory-${slugify(currentShop?.name ?? "shop")}-${new Date().toISOString().slice(0, 10)}.pdf`);
    setFeedback({ tone: "success", message: "Inventory PDF downloaded." });
  };

  const savePurchaseOrder = () => {
    if (orderTotal > 0 && Number(orderPaidAmount || 0) > orderTotal) {
      setFeedback({ tone: "error", message: "Amount paid cannot exceed PO total." });
      return;
    }

    const selectedSupplier = suppliers.find((supplier) => supplier.id === orderSupplierId);
    const result = createPurchaseOrder({
      expectedAt: poExpectedAt || undefined,
      items: orderItems.map((item) => ({
        costPrice: Number(item.costPrice || 0),
        productId: item.productId,
        quantity: Number(item.quantity || 0)
      })),
      note: poNote,
      number: poNumber,
      paidAmount: orderPaidAmountNumber,
      paymentMethod: orderPaymentMethod,
      paymentStatus: orderPaymentStatus,
      supplierId: selectedSupplier?.id,
      supplierName: selectedSupplier?.name ?? orderSupplierName
    });

    setFeedback({ tone: result.ok ? "success" : "error", message: result.ok ? "Purchase order created." : result.message ?? "Unable to create purchase order." });

    if (result.ok) {
      resetPoDraft();
      setOrderTab("history");
      setPoFilter("open");
    }
  };

  const printPurchaseOrder = (purchaseOrderId?: string) => {
    const savedOrder = purchaseOrderId ? purchaseOrders.find((order) => order.id === purchaseOrderId) : undefined;
    const sourceItems = savedOrder
      ? purchaseOrderItemsByOrderId[savedOrder.id] ?? []
      : orderItems.map((item) => {
          const product = productById[item.productId];

          return {
            costPrice: Number(item.costPrice || 0),
            id: item.productId,
            productId: item.productId,
            productName: product?.name ?? { ar: item.productId, en: item.productId, ur: item.productId },
            purchaseOrderId: "",
            quantity: Number(item.quantity || 0),
            receivedQuantity: 0
          } satisfies PurchaseOrderItem;
        });
    const supplierName = savedOrder?.supplierName || orderSupplier?.name || orderSupplierName || "Supplier";
    const number = savedOrder?.number || poNumber;
    const total = savedOrder?.totalAmount ?? orderTotal;
    const paid = savedOrder?.paidAmount ?? orderPaidAmountNumber;
    const rows = sourceItems
      .map((item) => {
        const product = productById[item.productId];
        const name = escapeHtml(product ? getProductName(product, locale) : item.productName[locale] || item.productName.en);
        const quantity = Number(item.quantity || 0);
        const cost = Number(item.costPrice || 0);
        const lineTotal = quantity * cost;

        return `<tr><td>${name}</td><td>${quantity}</td><td>${formatCurrency(cost, currency, locale)}</td><td>${formatCurrency(lineTotal, currency, locale)}</td></tr>`;
      })
      .join("");
    const printWindow = window.open("", "_blank", "width=860,height=720");

    if (!printWindow) {
      setFeedback({ tone: "error", message: "Allow popups to print the purchase order." });
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(number)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; }
            h1 { margin: 0 0 6px; font-size: 28px; }
            .muted { color: #64748b; }
            .head { display: flex; justify-content: space-between; gap: 18px; border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background: #f8fafc; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
            .totals { margin-top: 18px; margin-left: auto; width: 320px; }
            .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
            .total { font-weight: 800; font-size: 20px; }
            @media print { button { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()" style="margin-bottom:16px;padding:10px 16px;border-radius:12px;border:0;background:#020617;color:#fff;font-weight:700;">Print PO</button>
          <div class="head">
            <div>
              <p class="muted">Purchase Order</p>
              <h1>${escapeHtml(number)}</h1>
              <p>${escapeHtml(currentShop?.name ?? "")}</p>
            </div>
            <div>
              <p><strong>Supplier:</strong> ${escapeHtml(supplierName)}</p>
              <p><strong>Date:</strong> ${formatDateTime(savedOrder?.createdAt ?? new Date().toISOString(), locale)}</p>
              ${savedOrder?.expectedAt ? `<p><strong>Expected:</strong> ${escapeHtml(savedOrder.expectedAt)}</p>` : ""}
            </div>
          </div>
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Total</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="totals">
            <div><span>Total</span><strong>${formatCurrency(total, currency, locale)}</strong></div>
            <div><span>Paid</span><strong>${formatCurrency(paid, currency, locale)}</strong></div>
            <div class="total"><span>Due</span><span>${formatCurrency(Math.max(0, total - paid), currency, locale)}</span></div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
  };

  const startReceivingOrder = (purchaseOrderId: string) => {
    const order = purchaseOrders.find((entry) => entry.id === purchaseOrderId);
    const savedItems = purchaseOrderItemsByOrderId[purchaseOrderId] ?? [];

    setReceivingOrderId(purchaseOrderId);
    setReceivePaymentMethod(order?.paymentMethod ?? "credit");
    setReceivePaidAmount("");
    setReceiveItems(
      Object.fromEntries(
        savedItems.map((item) => [
          item.id,
          {
            costPrice: String(item.costPrice),
            quantity: String(Math.max(0, item.quantity - (item.receivedQuantity ?? 0)))
          }
        ])
      )
    );
  };

  const updateReceiveItem = (purchaseOrderItemId: string, patch: Partial<PurchaseOrderReceiveItem>) => {
    setReceiveItems((current) => ({
      ...current,
      [purchaseOrderItemId]: {
        costPrice: current[purchaseOrderItemId]?.costPrice ?? "0",
        quantity: current[purchaseOrderItemId]?.quantity ?? "0",
        ...patch
      }
    }));
  };

  const receiveOrder = (purchaseOrderId: string) => {
    const order = purchaseOrders.find((entry) => entry.id === purchaseOrderId);
    const savedItems = purchaseOrderItemsByOrderId[purchaseOrderId] ?? [];
    const remainingAmount = Math.max(0, (order?.totalAmount ?? 0) - (order?.paidAmount ?? 0));
    const paidNow = Math.min(remainingAmount, Math.max(0, Number(receivePaidAmount || 0)));
    const result = receivePurchaseOrder(purchaseOrderId, {
      items: savedItems.map((item) => ({
        costPrice: Number(receiveItems[item.id]?.costPrice || item.costPrice),
        purchaseOrderItemId: item.id,
        receivedQuantity: Number(receiveItems[item.id]?.quantity || 0)
      })),
      paidAmount: paidNow,
      paymentMethod: receivePaymentMethod
    });

    setFeedback({ tone: result.ok ? "success" : "error", message: result.ok ? "Purchase order received and inventory updated." : result.message ?? "Unable to receive purchase order." });

    if (result.ok) {
      setReceivingOrderId("");
      setReceiveItems({});
      setReceivePaidAmount("");
    }
  };

  const cancelOrder = (purchaseOrderId: string) => {
    const result = cancelPurchaseOrder(purchaseOrderId);

    setFeedback({ tone: result.ok ? "success" : "error", message: result.ok ? "Purchase order cancelled." : result.message ?? "Unable to cancel purchase order." });
  };

  const reorderFromOrder = (order: PurchaseOrder) => {
    const savedItems = purchaseOrderItemsByOrderId[order.id] ?? [];

    setOrderItems(
      savedItems
        .filter((item) => productById[item.productId])
        .map((item) => ({
          costPrice: String(item.costPrice),
          productId: item.productId,
          quantity: String(item.quantity)
        }))
    );
    setOrderSupplierId(order.supplierId ?? "");
    setOrderSupplierName(order.supplierId ? "" : order.supplierName);
    setOrderPaymentMethod(order.paymentMethod ?? "credit");
    setOrderPaidAmount("");
    setPoExpectedAt("");
    setPoNote(order.note ?? "");
    setPoNumber(createPoNumber());
    setOrderTab("create");
    setOrderStep("items");
    setFeedback({ tone: "success", message: "Previous PO copied. Review quantities and create a fresh order." });
  };

  const saveSupplierForm = () => {
    const result = saveSupplier({
      accountBalance: Number(supplierForm.accountBalance || 0),
      address: supplierForm.address,
      contactPerson: supplierForm.contactPerson,
      defaultPaymentMethod: supplierForm.defaultPaymentMethod,
      email: supplierForm.email,
      id: supplierForm.id || undefined,
      name: supplierForm.name,
      phone: supplierForm.phone,
      vatNumber: supplierForm.vatNumber
    });

    setFeedback({ tone: result.ok ? "success" : "error", message: result.ok ? "Supplier saved." : result.message ?? "Unable to save supplier." });

    if (result.ok) {
      resetSupplierForm();
      setSupplierView("list");
    }
  };

  const startEditSupplier = (supplier: Supplier) => {
    setSupplierForm({
      accountBalance: String(supplier.accountBalance ?? 0),
      address: supplier.address ?? "",
      contactPerson: supplier.contactPerson ?? "",
      defaultPaymentMethod: supplier.defaultPaymentMethod ?? "credit",
      email: supplier.email ?? "",
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone ?? "",
      vatNumber: supplier.vatNumber ?? ""
    });
    setSupplierView("form");
  };

  const removeSupplier = (supplierId: string) => {
    const result = deleteSupplier(supplierId);
    setFeedback({ tone: result.ok ? "success" : "error", message: result.ok ? "Supplier removed." : result.message ?? "Unable to remove supplier." });
  };

  const navItems = [
    { href: "/inventory", active: activeView === "overview", icon: Warehouse, label: "Overview" },
    { href: "/inventory?view=add", active: activeView === "add", icon: PackageCheck, label: "Add inventory" },
    { href: "/inventory?view=adjust", active: activeView === "adjust", icon: Edit3, label: "Adjustment" },
    { href: "/inventory?view=order", active: activeView === "order", icon: ShoppingBasket, label: "Order inventory" },
    { href: "/inventory?view=suppliers", active: activeView === "suppliers", icon: Truck, label: "Suppliers" },
    { href: "/inventory?view=data", active: activeView === "data", icon: Database, label: "Inventory data" }
  ];

  return (
    <div className="space-y-5">
      <nav className="grid max-w-6xl grid-cols-2 gap-2 rounded-[24px] border border-slate-200 bg-white/88 p-2 shadow-[0_18px_45px_rgba(15,23,42,0.05)] backdrop-blur md:grid-cols-3 xl:grid-cols-6">
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

      {feedback ? (
        <div
          className={cn(
            "rounded-[22px] border px-4 py-3 text-sm font-semibold",
            feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      {!isManager ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Inventory changes are limited to the shop admin.
        </Card>
      ) : null}

      {activeView === "overview" ? (
        <div className="space-y-5">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Stock items" value={physicalProducts.length} />
            <MetricCard label="Stock value" tone="green" value={formatCurrency(stockValue, currency, locale)} />
            <button
              className={cn(
                "min-h-32 rounded-[28px] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]",
                lowStockProducts.length > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
              )}
              type="button"
              onClick={() => {
                if (lowStockGroups.length === 1) {
                  loadLowStockGroupForOrder(lowStockGroups[0].key, true);
                } else if (lowStockGroups.length > 1) {
                  setFeedback({ tone: "success", message: "Choose one supplier group below to keep the purchase order clean." });
                }
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Low stock</p>
              <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-slate-950">{lowStockProducts.length}</p>
              <p className="mt-2 text-sm text-slate-600">{lowStockGroups.length > 1 ? "Grouped by supplier" : "Click to prepare order"}</p>
            </button>
            <MetricCard label="Suppliers" value={suppliers.length} />
          </section>

          {lowStockGroups.length > 0 ? (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <SectionEyebrow>Low stock order groups</SectionEyebrow>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Order low-stock items without mixing suppliers</h2>
                </div>
                <Badge variant="warning">{lowStockProducts.length} low</Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {lowStockGroups.map((group) => (
                  <button
                    key={group.key}
                    className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50"
                    type="button"
                    onClick={() => loadLowStockGroupForOrder(group.key, true)}
                  >
                    <p className="font-semibold text-slate-950">{group.label}</p>
                    <p className="mt-1 text-sm text-slate-600">{group.products.length} products ready for one PO</p>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <SectionEyebrow>Overview</SectionEyebrow>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Inventory list</h2>
                </div>
                <Button variant="secondary" onClick={downloadInventoryPdf}>
                  <FileText className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-11" placeholder="Search product name or barcode" value={overviewSearch} onChange={(event) => setOverviewSearch(event.target.value)} />
                </label>
                <Select value={overviewCategoryId} onChange={(event) => setOverviewCategoryId(event.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </Select>
                <Select value={overviewSupplierId} onChange={(event) => setOverviewSupplierId(event.target.value)}>
                  <option value="">All suppliers</option>
                  <option value={GENERAL_SUPPLIER_KEY}>{GENERAL_SUPPLIER_NAME}</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            {overviewPageProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Barcode</th>
                      <th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3">Supplier</th>
                      <th className="px-5 py-3">On hand</th>
                      <th className="px-5 py-3">Reorder</th>
                      <th className="px-5 py-3">Cost</th>
                      <th className="px-5 py-3">Value</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overviewPageProducts.map((product) => {
                      const supplierNames = (productSupplierIds[product.id] ?? [])
                        .map((supplierId) => supplierById[supplierId]?.name)
                        .filter(Boolean)
                        .join(", ");

                      return (
                        <tr key={product.id}>
                          <td className="px-5 py-4 font-semibold text-slate-950">{getProductName(product, locale)}</td>
                          <td className="px-5 py-4 text-slate-600">{product.barcode ?? "No barcode"}</td>
                          <td className="px-5 py-4 text-slate-600">{product.categoryId ? categoryById[product.categoryId] ?? "No category" : "No category"}</td>
                          <td className="px-5 py-4 text-slate-600">{supplierNames || GENERAL_SUPPLIER_NAME}</td>
                          <td className="px-5 py-4 text-slate-950">{product.stockQuantity}</td>
                          <td className="px-5 py-4 text-slate-600">{product.reorderLevel}</td>
                          <td className="px-5 py-4 text-slate-600">{formatCurrency(product.costPrice, currency, locale)}</td>
                          <td className="px-5 py-4 font-semibold text-slate-950">{formatCurrency(product.stockQuantity * product.costPrice, currency, locale)}</td>
                          <td className="px-5 py-4">
                            <Badge variant={product.stockQuantity <= product.reorderLevel ? "warning" : "success"}>
                              {product.stockQuantity <= product.reorderLevel ? "Reorder" : "Healthy"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <EmptyBox>No inventory matched the current filters.</EmptyBox>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5 text-sm text-slate-600">
              <span>
                Showing {overviewPageProducts.length} of {overviewFilteredProducts.length} products
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={safeOverviewPage <= 1} onClick={() => setOverviewPage((page) => Math.max(1, page - 1))}>
                  Previous
                </Button>
                <Badge variant="neutral">{safeOverviewPage}/{overviewPageCount}</Badge>
                <Button size="sm" variant="secondary" disabled={safeOverviewPage >= overviewPageCount} onClick={() => setOverviewPage((page) => Math.min(overviewPageCount, page + 1))}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {activeView === "add" ? (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <SectionEyebrow>Add inventory</SectionEyebrow>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Scan or search received products</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={restockLines.length === 0 || heldRestocks.length >= 2} variant="secondary" onClick={holdRestockCart}>
                    <PackageCheck className="mr-2 h-4 w-4" />
                    Hold current
                  </Button>
                  <Button variant={showHeldRestocks ? "primary" : "secondary"} onClick={() => setShowHeldRestocks((current) => !current)}>
                    <History className="mr-2 h-4 w-4" />
                    Held drafts {heldRestocks.length}/2
                  </Button>
                </div>
              </div>
              <div className="mt-5 flex gap-3">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    autoFocus
                    className="pl-11"
                    placeholder="Scan barcode or search product name"
                    value={addInventorySearch}
                    onChange={(event) => setAddInventorySearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        scanAddInventory();
                      }
                    }}
                  />
                </label>
                <Button onClick={scanAddInventory}>
                  <Barcode className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="border-b border-slate-200 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                {addInventoryResults.map((product) => (
                  <button
                    key={product.id}
                    className="rounded-[22px] border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50"
                    type="button"
                    onClick={() => addProductToRestock(product)}
                  >
                    <p className="font-semibold text-slate-950">{getProductName(product, locale)}</p>
                    <p className="mt-1 text-sm text-slate-500">{product.barcode ?? "No barcode"} | Stock {product.stockQuantity}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{formatCurrency(product.costPrice, currency, locale)}</p>
                  </button>
                ))}
              </div>
              {exactBarcodeProduct?.kind === "service" ? (
                <div className="mt-3 rounded-[20px] border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                  Only physical products can be restocked. This barcode belongs to a service.
                </div>
              ) : null}
            </div>

            <div className="min-h-[340px] p-5">
              {restockLines.length > 0 ? (
                <div className="space-y-3">
                  {restockLines.map((line) => {
                    const product = productById[line.productId];
                    const quantity = Math.max(0, Number(line.quantity || 0));
                    const cost = Math.max(0, Number(line.costPrice || product?.costPrice || 0));

                    if (!product) {
                      return null;
                    }

                    return (
                      <div key={line.lineId} className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_120px_140px_180px_auto] lg:items-center">
                        <div>
                          <p className="font-semibold text-slate-950">{getProductName(product, locale)}</p>
                          <p className="mt-1 text-xs text-slate-500">{product.barcode ?? "No barcode"} | current stock {product.stockQuantity}</p>
                        </div>
                        <Input inputMode="decimal" value={line.quantity} onChange={(event) => updateRestockLine(line.lineId, { quantity: event.target.value })} />
                        <Input inputMode="decimal" value={line.costPrice} onChange={(event) => updateRestockLine(line.lineId, { costPrice: event.target.value })} />
                        <Select value={line.supplierId} onChange={(event) => updateRestockLine(line.lineId, { supplierId: event.target.value })}>
                          <option value="">{GENERAL_SUPPLIER_NAME}</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </Select>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-950">{formatCurrency(quantity * cost, currency, locale)}</span>
                          <Button className="h-10 w-10 rounded-full p-0" variant="danger" onClick={() => setRestockLines((current) => current.filter((entry) => entry.lineId !== line.lineId))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyBox>Search or scan products to build the inventory receiving list.</EmptyBox>
              )}
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-5">
              <SectionEyebrow>Receive summary</SectionEyebrow>
              <div className="mt-4 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Total</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
                  {formatCurrency(
                    restockLines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)) * Math.max(0, Number(line.costPrice || 0)), 0),
                    currency,
                    locale
                  )}
                </p>
                <p className="mt-2 text-sm text-slate-600">{restockLines.length} items ready</p>
              </div>
              <div className="mt-5 grid gap-3">
                <Button disabled={!isManager || restockLines.length === 0} onClick={submitRestockCart}>
                  Receive inventory
                </Button>
              </div>
            </Card>

            {showHeldRestocks ? (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <SectionEyebrow>Held drafts</SectionEyebrow>
                <Badge variant="neutral">{heldRestocks.length}/2</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {heldRestocks.length > 0 ? (
                  heldRestocks.map((held) => (
                    <div key={held.id} className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <p className="font-semibold text-slate-950">{held.label}</p>
                      <p className="mt-1 text-sm text-slate-500">{held.items.length} products | {formatDateTime(held.createdAt, locale)}</p>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => restoreHeldRestock(held.id)}>Restore</Button>
                        <Button size="sm" variant="secondary" onClick={() => setHeldRestocks((current) => current.filter((entry) => entry.id !== held.id))}>Discard</Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyBox>No held inventory drafts on this device.</EmptyBox>
                )}
              </div>
            </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeView === "adjust" ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 p-5">
              <SectionEyebrow>Inventory adjustment</SectionEyebrow>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                {adjustMode === "supplier" ? "Adjust by supplier" : adjustMode === "category" ? "Adjust by category" : "Adjust by item"}
              </h2>
              <div className="mt-5 grid gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-2 md:grid-cols-3">
                {[
                  { id: "item" as const, label: "Adjust by item", icon: Barcode },
                  { id: "supplier" as const, label: "Adjust by supplier", icon: Truck },
                  { id: "category" as const, label: "Adjust by category", icon: Warehouse }
                ].map((mode) => {
                  const Icon = mode.icon;

                  return (
                    <Button
                      key={mode.id}
                      variant={adjustMode === mode.id ? "primary" : "ghost"}
                      onClick={() => {
                        setAdjustMode(mode.id);
                        setEditingStockProductId("");
                      }}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {mode.label}
                    </Button>
                  );
                })}
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-11" placeholder="Search product or barcode" value={adjustSearch} onChange={(event) => setAdjustSearch(event.target.value)} />
                </label>
                {adjustMode === "supplier" ? (
                  <Select value={adjustSupplierId} onChange={(event) => setAdjustSupplierId(event.target.value)}>
                    <option value="">All suppliers</option>
                    <option value={GENERAL_SUPPLIER_KEY}>{GENERAL_SUPPLIER_NAME}</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </Select>
                ) : null}
                {adjustMode === "category" ? (
                  <Select value={adjustCategoryId} onChange={(event) => setAdjustCategoryId(event.target.value)}>
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </Select>
                ) : null}
              </div>
            </div>
            <div className="grid max-h-[calc(100dvh-260px)] gap-3 overflow-y-auto p-5 md:grid-cols-2">
              {filteredStockProducts.map((product) => (
                <button
                  key={product.id}
                  className={cn(
                    "rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300",
                    editingStockProductId === product.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
                  )}
                  type="button"
                  onClick={() => startStockEdit(product)}
                >
                  <p className="font-semibold text-slate-950">{getProductName(product, locale)}</p>
                  <p className="mt-1 text-sm text-slate-500">{product.barcode ?? "No barcode"}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <span>Stock <strong>{product.stockQuantity}</strong></span>
                    <span>Cost <strong>{formatCurrency(product.costPrice, currency, locale)}</strong></span>
                    <span>Reorder <strong>{product.reorderLevel}</strong></span>
                  </div>
                </button>
              ))}
              {filteredStockProducts.length === 0 ? <EmptyBox>No products matched this adjustment view.</EmptyBox> : null}
            </div>
          </Card>

          <Card className="p-5">
            <SectionEyebrow>Correction panel</SectionEyebrow>
            {selectedStockProduct ? (
              <div className="mt-4 space-y-4">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{getProductName(selectedStockProduct, locale)}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-950">Correct stock quantity</label>
                    <Input inputMode="decimal" value={stockDraft.quantity} onChange={(event) => setStockDraft((current) => ({ ...current, quantity: event.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-950">Cost price</label>
                    <Input inputMode="decimal" value={stockDraft.costPrice} onChange={(event) => setStockDraft((current) => ({ ...current, costPrice: event.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-950">Reorder level</label>
                    <Input inputMode="decimal" value={stockDraft.reorderLevel} onChange={(event) => setStockDraft((current) => ({ ...current, reorderLevel: event.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-950">Supplier for added stock</label>
                    <Select value={stockDraft.supplierId} onChange={(event) => setStockDraft((current) => ({ ...current, supplierId: event.target.value }))}>
                      <option value="">{GENERAL_SUPPLIER_NAME}</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <Textarea placeholder="Reason for correction, damage, counting error, manual audit..." value={stockDraft.reason} onChange={(event) => setStockDraft((current) => ({ ...current, reason: event.target.value }))} />
                <Button disabled={!isManager} onClick={saveStockCorrection}>
                  Save stock correction
                </Button>
              </div>
            ) : (
              <EmptyBox>Select a product to correct stock, cost price, reorder level, or supplier.</EmptyBox>
            )}
          </Card>
        </div>
      ) : null}

      {activeView === "order" ? (
        <div className="space-y-5">
          <div className="grid gap-2 rounded-[24px] border border-slate-200 bg-white/88 p-2 md:grid-cols-3">
            {[
              { id: "create" as const, label: "Order inventory", value: orderItems.length },
              { id: "history" as const, label: "PO history", value: purchaseOrders.length },
              { id: "reorder" as const, label: "Reorder", value: reorderOrders.length }
            ].map((tab) => (
              <button
                key={tab.id}
                className={cn(
                  "flex h-12 items-center justify-between rounded-[18px] px-4 text-sm font-semibold transition",
                  orderTab === tab.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-emerald-50 hover:text-slate-950"
                )}
                type="button"
                onClick={() => setOrderTab(tab.id)}
              >
                <span>{tab.label}</span>
                <span className={cn("rounded-full px-3 py-1 text-xs", orderTab === tab.id ? "bg-white/15" : "bg-slate-100")}>{tab.value}</span>
              </button>
            ))}
          </div>

          {orderTab === "create" ? (
            <div className="space-y-5">
              <div className="grid gap-2 rounded-[22px] border border-slate-200 bg-white p-2 md:grid-cols-2">
                <Button variant={orderStep === "items" ? "primary" : "ghost"} onClick={() => setOrderStep("items")}>1. Items</Button>
                <Button variant={orderStep === "supplier" ? "primary" : "ghost"} onClick={() => setOrderStep("supplier")}>2. Supplier and PO</Button>
              </div>

              {orderStep === "items" ? (
                <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                  <Card className="overflow-hidden p-0">
                    <div className="border-b border-slate-200 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <SectionEyebrow>Items to order</SectionEyebrow>
                          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Search product name or barcode</h2>
                        </div>
                        <Button disabled={!isManager || lowStockProducts.length === 0} variant="secondary" onClick={addLowStockToOrder}>
                          Add low-stock items
                        </Button>
                      </div>
                      <label className="relative mt-5 block">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input className="pl-11" placeholder="Search product name or barcode" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} />
                      </label>
                    </div>
                    <div className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-2">
                      {orderSearchResults.map((product) => (
                        <button key={product.id} className="rounded-[22px] border border-slate-200 bg-white p-4 text-left hover:border-emerald-300 hover:bg-emerald-50" type="button" onClick={() => addProductToOrder(product)}>
                          <p className="font-semibold text-slate-950">{getProductName(product, locale)}</p>
                          <p className="mt-1 text-sm text-slate-500">Stock {product.stockQuantity} | Cost {formatCurrency(product.costPrice, currency, locale)}</p>
                        </button>
                      ))}
                    </div>
                    <div className="min-h-[320px] p-5">
                      {orderItems.length > 0 ? (
                        <div className="space-y-3">
                          {orderItems.map((item) => {
                            const product = productById[item.productId];
                            const quantity = Math.max(0, Number(item.quantity || 0));
                            const cost = Math.max(0, Number(item.costPrice || 0));

                            if (!product) {
                              return null;
                            }

                            return (
                              <div key={item.productId} className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_120px_140px_120px_auto] lg:items-center">
                                <div>
                                  <p className="font-semibold text-slate-950">{getProductName(product, locale)}</p>
                                  <p className="mt-1 text-xs text-slate-500">Initial cost {formatCurrency(product.costPrice, currency, locale)}</p>
                                </div>
                                <Input inputMode="decimal" value={item.quantity} onChange={(event) => updateOrderItem(item.productId, { quantity: event.target.value })} />
                                <Input inputMode="decimal" value={item.costPrice} onChange={(event) => updateOrderItem(item.productId, { costPrice: event.target.value })} />
                                <p className="font-semibold text-slate-950">{formatCurrency(quantity * cost, currency, locale)}</p>
                                <Button className="h-10 w-10 rounded-full p-0" variant="danger" onClick={() => removeOrderItem(item.productId)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <EmptyBox>Search and add products to build this supplier purchase order.</EmptyBox>
                      )}
                    </div>
                  </Card>

                  <Card className="flex flex-col justify-between p-5">
                    <div>
                      <SectionEyebrow>Order list</SectionEyebrow>
                      <p className="mt-2 text-3xl font-semibold text-slate-950">{orderItems.length} items</p>
                      <div className="mt-5 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Total</p>
                        <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrency(orderTotal, currency, locale)}</p>
                      </div>
                    </div>
                    <Button className="mt-5" disabled={!isManager || orderItems.length === 0} onClick={() => setOrderStep("supplier")}>
                      Continue to supplier
                    </Button>
                  </Card>
                </div>
              ) : null}

              {orderStep === "supplier" ? (
                <div className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
                  <Card className="overflow-hidden p-0">
                    <div className="flex items-center justify-between border-b border-slate-200 p-5">
                      <div>
                        <SectionEyebrow>{poNumber}</SectionEyebrow>
                        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Review order items</h2>
                      </div>
                      <Button variant="secondary" onClick={() => setOrderStep("items")}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Items
                      </Button>
                    </div>
                    <div className="p-5">
                      <div className="space-y-3">
                        {orderItems.map((item) => {
                          const product = productById[item.productId];
                          const quantity = Number(item.quantity || 0);
                          const cost = Number(item.costPrice || 0);

                          if (!product) {
                            return null;
                          }

                          return (
                            <div key={item.productId} className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white p-4">
                              <div>
                                <p className="font-semibold text-slate-950">{getProductName(product, locale)}</p>
                                <p className="mt-1 text-sm text-slate-500">Qty {quantity} x {formatCurrency(cost, currency, locale)}</p>
                              </div>
                              <p className="font-semibold text-slate-950">{formatCurrency(quantity * cost, currency, locale)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Card>

                  <Card className="p-5">
                    <SectionEyebrow>Supplier and payment</SectionEyebrow>
                    <div className="mt-5 grid gap-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-950">Supplier</label>
                        <Select
                          value={orderSupplierId}
                          onChange={(event) => {
                            const supplier = suppliers.find((entry) => entry.id === event.target.value);
                            setOrderSupplierId(event.target.value);
                            setOrderPaymentMethod(supplier?.defaultPaymentMethod ?? "credit");
                          }}
                        >
                          <option value="">New supplier name</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                          ))}
                        </Select>
                      </div>
                      {!orderSupplierId ? (
                        <Input placeholder="Supplier name" value={orderSupplierName} onChange={(event) => setOrderSupplierName(event.target.value)} />
                      ) : null}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} />
                        <Input type="date" value={poExpectedAt} onChange={(event) => setPoExpectedAt(event.target.value)} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Select value={orderPaymentMethod} onChange={(event) => setOrderPaymentMethod(event.target.value as SupplierPaymentMethod)}>
                          <option value="credit">Credit</option>
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="bank">Bank</option>
                        </Select>
                        <Input inputMode="decimal" placeholder="Amount paid" value={orderPaidAmount} onChange={(event) => updateOrderPaidAmount(event.target.value)} />
                      </div>
                      <Textarea placeholder="PO notes" value={poNote} onChange={(event) => setPoNote(event.target.value)} />
                      <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex justify-between"><span>Total</span><strong>{formatCurrency(orderTotal, currency, locale)}</strong></div>
                        <div className="mt-2 flex justify-between"><span>Paid</span><strong>{formatCurrency(orderPaidAmountNumber, currency, locale)}</strong></div>
                        <div className="mt-2 flex justify-between"><span>Due</span><strong>{formatCurrency(orderDueAmount, currency, locale)}</strong></div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button variant="secondary" disabled={orderItems.length === 0} onClick={() => printPurchaseOrder()}>
                          <Printer className="mr-2 h-4 w-4" />
                          Print
                        </Button>
                        <Button disabled={!isManager || orderItems.length === 0 || (!orderSupplierId && !orderSupplierName.trim())} onClick={savePurchaseOrder}>
                          Create PO
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              ) : null}
            </div>
          ) : null}

          {orderTab === "history" ? (
            <Card className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <SectionEyebrow>Purchase orders</SectionEyebrow>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Open, completed, and cancelled POs</h2>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-[20px] border border-slate-200 bg-slate-50 p-1">
                  {(["open", "completed", "cancelled"] as PurchaseOrderFilter[]).map((filter) => (
                    <Button key={filter} variant={poFilter === filter ? "primary" : "ghost"} onClick={() => setPoFilter(filter)}>
                      {filter}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-3 p-5">
                {filteredPurchaseOrders.length > 0 ? (
                  filteredPurchaseOrders.map((order) => {
                    const savedItems = purchaseOrderItemsByOrderId[order.id] ?? [];
                    const orderedUnits = savedItems.reduce((sum, item) => sum + item.quantity, 0);
                    const receivedUnits = savedItems.reduce((sum, item) => sum + (item.receivedQuantity ?? 0), 0);
                    const remainingAmount = Math.max(0, (order.totalAmount ?? 0) - (order.paidAmount ?? 0));

                    return (
                      <div key={order.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">{order.number}</p>
                            <p className="mt-1 text-sm text-slate-500">{order.supplierName} | {formatDateTime(order.createdAt, locale)}</p>
                            <p className="mt-1 text-sm text-slate-500">Received {receivedUnits}/{orderedUnits} | Due {formatCurrency(remainingAmount, currency, locale)}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={order.status === "received" ? "success" : order.status === "cancelled" ? "warning" : "neutral"}>{order.status}</Badge>
                            <Badge variant={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "partial" ? "warning" : "neutral"}>{order.paymentStatus ?? "unpaid"}</Badge>
                            <Button size="sm" variant="secondary" onClick={() => printPurchaseOrder(order.id)}>
                              <Printer className="mr-2 h-4 w-4" />
                              Print
                            </Button>
                            {order.status !== "received" && order.status !== "cancelled" ? (
                              <>
                                <Button size="sm" onClick={() => startReceivingOrder(order.id)}>Receive</Button>
                                <Button size="sm" variant="danger" onClick={() => cancelOrder(order.id)}>Cancel</Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {receivingOrderId === order.id ? (
                          <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50/60 p-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <Select value={receivePaymentMethod} onChange={(event) => setReceivePaymentMethod(event.target.value as SupplierPaymentMethod)}>
                                <option value="credit">Credit</option>
                                <option value="cash">Cash</option>
                                <option value="card">Card</option>
                                <option value="bank">Bank</option>
                              </Select>
                              <Input
                                inputMode="decimal"
                                placeholder="Amount paid now"
                                value={receivePaidAmount}
                                onChange={(event) => setReceivePaidAmount(event.target.value)}
                              />
                            </div>
                            <div className="mt-4 space-y-2">
                              {savedItems.map((item) => {
                                const product = productById[item.productId];
                                const remainingQuantity = Math.max(0, item.quantity - (item.receivedQuantity ?? 0));

                                return (
                                  <div key={item.id} className="grid gap-3 rounded-[18px] border border-emerald-100 bg-white p-3 md:grid-cols-[1fr_120px_140px] md:items-center">
                                    <div>
                                      <p className="font-semibold text-slate-950">{product ? getProductName(product, locale) : item.productName.en}</p>
                                      <p className="text-sm text-slate-500">Remaining {remainingQuantity}</p>
                                    </div>
                                    <Input inputMode="decimal" value={receiveItems[item.id]?.quantity ?? "0"} onChange={(event) => updateReceiveItem(item.id, { quantity: event.target.value })} />
                                    <Input inputMode="decimal" value={receiveItems[item.id]?.costPrice ?? String(item.costPrice)} onChange={(event) => updateReceiveItem(item.id, { costPrice: event.target.value })} />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button disabled={!isManager} onClick={() => receiveOrder(order.id)}>Mark received</Button>
                              <Button variant="secondary" onClick={() => setReceivingOrderId("")}>Close</Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <EmptyBox>No purchase orders in this status.</EmptyBox>
                )}
              </div>
            </Card>
          ) : null}

          {orderTab === "reorder" ? (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-200 p-5">
                <SectionEyebrow>Reorder</SectionEyebrow>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Copy a previous purchase order</h2>
                <label className="relative mt-5 block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-11" placeholder="Search PO number or supplier" value={reorderSearch} onChange={(event) => setReorderSearch(event.target.value)} />
                </label>
              </div>
              <div className="grid gap-3 p-5 md:grid-cols-2">
                {reorderOrders.map((order) => (
                  <div key={order.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <p className="font-semibold text-slate-950">{order.number}</p>
                    <p className="mt-1 text-sm text-slate-500">{order.supplierName} | {formatCurrency(order.totalAmount ?? 0, currency, locale)}</p>
                    <Button className="mt-4" size="sm" onClick={() => reorderFromOrder(order)}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reorder
                    </Button>
                  </div>
                ))}
                {reorderOrders.length === 0 ? <EmptyBox>No previous purchase order matched.</EmptyBox> : null}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {activeView === "suppliers" ? (
        <div className="space-y-5">
          <div className="grid gap-2 rounded-[24px] border border-slate-200 bg-white/88 p-2 md:grid-cols-2">
            <Button
              variant={supplierView === "list" || supplierView === "detail" ? "primary" : "ghost"}
              onClick={() => {
                setSupplierView("list");
                setSelectedSupplierDetailId("");
              }}
            >
              Supplier list
            </Button>
            <Button
              variant={supplierView === "form" ? "primary" : "ghost"}
              onClick={() => {
                resetSupplierForm();
                setSupplierView("form");
              }}
            >
              Add supplier
            </Button>
          </div>

          {supplierView === "list" ? (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-200 p-5">
                <SectionEyebrow>Suppliers</SectionEyebrow>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Supplier directory</h2>
                <label className="relative mt-5 block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-11" placeholder="Search supplier, phone, email, VAT" value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} />
                </label>
              </div>
              <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredSuppliers.map((supplier) => {
                  const stats = supplierStats(supplier);

                  return (
                    <button
                      key={supplier.id}
                      className="rounded-[24px] border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300"
                      type="button"
                      onClick={() => {
                        setSelectedSupplierDetailId(supplier.id);
                        setSupplierView("detail");
                      }}
                    >
                      <p className="font-semibold text-slate-950">{supplier.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{supplier.phone || supplier.email || "No contact"}</p>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <span>Orders <strong>{stats.orders.length}</strong></span>
                        <span>Due <strong>{formatCurrency(stats.due, currency, locale)}</strong></span>
                      </div>
                    </button>
                  );
                })}
                {filteredSuppliers.length === 0 ? <EmptyBox>No suppliers found.</EmptyBox> : null}
              </div>
            </Card>
          ) : null}

          {supplierView === "detail" && selectedSupplier ? (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <SectionEyebrow>Supplier profile</SectionEyebrow>
                  <h2 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{selectedSupplier.name}</h2>
                  <p className="mt-2 text-sm text-slate-500">{selectedSupplier.phone || selectedSupplier.email || "No contact details"}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => startEditSupplier(selectedSupplier)}>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="secondary" onClick={() => setSupplierView("list")}>
                    <X className="mr-2 h-4 w-4" />
                    Close
                  </Button>
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(() => {
                  const stats = supplierStats(selectedSupplier);

                  return (
                    <>
                      <MetricCard label="Items bought" value={stats.units} />
                      <MetricCard label="Total ordered" value={formatCurrency(stats.amount, currency, locale)} />
                      <MetricCard label="Total paid" value={formatCurrency(stats.paid, currency, locale)} />
                      <MetricCard label="Supplier due" tone="warm" value={formatCurrency(stats.due, currency, locale)} />
                    </>
                  );
                })()}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {supplierStats(selectedSupplier).orders.slice(0, 8).map((order) => (
                  <div key={order.id} className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <p className="font-semibold text-slate-950">{order.number}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDateTime(order.createdAt, locale)} | {formatCurrency(order.totalAmount ?? 0, currency, locale)}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {supplierView === "form" ? (
            <Card className="p-5">
              <SectionEyebrow>{supplierForm.id ? "Edit supplier" : "Add supplier"}</SectionEyebrow>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Input placeholder="Supplier name" value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} />
                <Input placeholder="Phone" value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} />
                <Input placeholder="Email" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} />
                <Input placeholder="VAT number" value={supplierForm.vatNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, vatNumber: event.target.value }))} />
                <Input placeholder="Contact person" value={supplierForm.contactPerson} onChange={(event) => setSupplierForm((current) => ({ ...current, contactPerson: event.target.value }))} />
                <Select value={supplierForm.defaultPaymentMethod} onChange={(event) => setSupplierForm((current) => ({ ...current, defaultPaymentMethod: event.target.value as SupplierPaymentMethod }))}>
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </Select>
                <Input inputMode="decimal" placeholder="Opening account balance" value={supplierForm.accountBalance} onChange={(event) => setSupplierForm((current) => ({ ...current, accountBalance: event.target.value }))} />
                <Textarea className="md:col-span-2" placeholder="Address" value={supplierForm.address} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button disabled={!isManager || !supplierForm.name.trim()} onClick={saveSupplierForm}>
                  {supplierForm.id ? "Save supplier" : "Add supplier"}
                </Button>
                <Button variant="secondary" onClick={resetSupplierForm}>Clear</Button>
                {supplierForm.id ? (
                  <Button variant="danger" onClick={() => removeSupplier(supplierForm.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {activeView === "data" ? <InventoryDataWorkspace /> : null}
    </div>
  );
}
