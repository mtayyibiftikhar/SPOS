"use client";

import { useMemo, useState } from "react";
import {
  Boxes,
  CalendarClock,
  FileText,
  History,
  MinusCircle,
  PlusCircle,
  ScanLine,
  ShoppingBasket,
  Truck
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceSectionsNav } from "@/components/ui/workspace-sections-nav";
import { formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";
import type { InventoryBatch, Product, PurchaseOrderItem, PurchasePaymentStatus, Supplier, SupplierPaymentMethod } from "@/types/pos";

type InventoryView = "stock" | "restock" | "adjust" | "order" | "suppliers" | "expiry";
type AdjustmentMode = "add" | "remove";
type PurchaseOrderDraftItem = {
  productId: string;
  quantity: string;
  costPrice: string;
};
type PurchaseOrderReceiveItem = {
  costPrice: string;
  expiryDate: string;
  quantity: string;
};

function getProductName(product: Product, locale: "en" | "ar" | "ur") {
  return product.name[locale] || product.name.en;
}

function createPoNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `PO-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function resolveExpiryStateFromDate(expiryDate?: string) {
  if (!expiryDate) {
    return "none";
  }

  const today = new Date();
  const expiry = new Date(`${expiryDate}T12:00:00`);
  const daysRemaining = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);

  if (daysRemaining < 0) {
    return "expired";
  }

  if (daysRemaining <= 30) {
    return "near";
  }

  return "healthy";
}

function resolveExpiryState(product: Product, batch?: InventoryBatch) {
  return resolveExpiryStateFromDate(batch?.expiryDate ?? product.expiryDate);
}

function buildSuggestedOrderQuantity(product: Product) {
  return Math.max(product.reorderLevel * 2 - product.stockQuantity, product.reorderLevel || 1);
}

export function InventoryWorkspace() {
  const searchParams = useSearchParams();
  const {
    adjustInventory,
    createPurchaseOrder,
    currentShop,
    currentShopId,
    deleteSupplier,
    locale,
    receivePurchaseOrder,
    saveSupplier,
    session,
    state,
    t
  } = usePosApp();
  const requestedView = searchParams.get("view");
  const activeView: InventoryView =
    requestedView === "restock" ||
    requestedView === "adjust" ||
    requestedView === "order" ||
    requestedView === "suppliers" ||
    requestedView === "expiry"
      ? requestedView
      : "stock";
  const isManager = session?.role === "shop_admin";
  const currency = currentShop?.currency ?? "SAR";
  const physicalProducts = useMemo(
    () =>
      state.products
        .filter((product) => product.shopId === currentShopId && product.kind === "product")
        .sort((left, right) => getProductName(left, locale).localeCompare(getProductName(right, locale))),
    [currentShopId, locale, state.products]
  );
  const lowStockProducts = useMemo(
    () => physicalProducts.filter((product) => product.stockQuantity <= product.reorderLevel),
    [physicalProducts]
  );
  const productById = useMemo(
    () =>
      physicalProducts.reduce<Record<string, Product>>((accumulator, product) => {
        accumulator[product.id] = product;
        return accumulator;
      }, {}),
    [physicalProducts]
  );
  const inventoryBatches = useMemo(
    () =>
      state.inventoryBatches
        .filter((batch) => batch.shopId === currentShopId && batch.remainingQuantity > 0 && productById[batch.productId])
        .sort((left, right) => (left.expiryDate || left.receivedAt).localeCompare(right.expiryDate || right.receivedAt)),
    [currentShopId, productById, state.inventoryBatches]
  );
  const nearestBatchByProductId = useMemo(
    () =>
      inventoryBatches.reduce<Record<string, InventoryBatch>>((accumulator, batch) => {
        if (!accumulator[batch.productId]) {
          accumulator[batch.productId] = batch;
        }

        return accumulator;
      }, {}),
    [inventoryBatches]
  );
  const expiryEntries = useMemo(
    () =>
      inventoryBatches
        .map((batch) => ({
          batch,
          product: productById[batch.productId],
          state: resolveExpiryStateFromDate(batch.expiryDate)
        }))
        .filter((entry) => entry.product && ["expired", "near"].includes(entry.state)),
    [inventoryBatches, productById]
  );
  const suppliers = useMemo(
    () =>
      state.suppliers
        .filter((supplier) => supplier.shopId === currentShopId)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [currentShopId, state.suppliers]
  );
  const inventoryHistory = useMemo(
    () =>
      state.inventoryAdjustments
        .filter((entry) => entry.shopId === currentShopId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 18),
    [currentShopId, state.inventoryAdjustments]
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
  const stockValue = physicalProducts.reduce(
    (sum, product) => sum + product.stockQuantity * product.costPrice,
    0
  );

  const [selectedProductId, setSelectedProductId] = useState(physicalProducts[0]?.id ?? "");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [adjustmentMode, setAdjustmentMode] = useState<AdjustmentMode>("add");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [adjustmentExpiryDate, setAdjustmentExpiryDate] = useState("");
  const [adjustmentCostPrice, setAdjustmentCostPrice] = useState("");
  const [restockBarcode, setRestockBarcode] = useState("");
  const [restockQuantity, setRestockQuantity] = useState("1");
  const [restockExpiryDate, setRestockExpiryDate] = useState("");
  const [restockCostPrice, setRestockCostPrice] = useState("");
  const [orderSupplierId, setOrderSupplierId] = useState("");
  const [orderSupplierName, setOrderSupplierName] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderItems, setOrderItems] = useState<PurchaseOrderDraftItem[]>([]);
  const [orderPaymentMethod, setOrderPaymentMethod] = useState<SupplierPaymentMethod>("credit");
  const [orderPaidAmount, setOrderPaidAmount] = useState("");
  const [receivingOrderId, setReceivingOrderId] = useState("");
  const [receiveItems, setReceiveItems] = useState<Record<string, PurchaseOrderReceiveItem>>({});
  const [receivePaymentMethod, setReceivePaymentMethod] = useState<SupplierPaymentMethod>("credit");
  const [receivePaidAmount, setReceivePaidAmount] = useState("");
  const [poNumber, setPoNumber] = useState(createPoNumber);
  const [poNote, setPoNote] = useState("");
  const [poExpectedAt, setPoExpectedAt] = useState("");
  const [supplierForm, setSupplierForm] = useState({
    id: "",
    name: "",
    phone: "",
    email: "",
    vatNumber: "",
    contactPerson: "",
    address: "",
    defaultPaymentMethod: "credit" as SupplierPaymentMethod,
    accountBalance: ""
  });
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const selectedProduct =
    physicalProducts.find((product) => product.id === selectedProductId) ?? physicalProducts[0] ?? null;
  const restockProduct = physicalProducts.find(
    (product) => product.barcode?.trim() === restockBarcode.trim()
  );
  const orderSupplier = suppliers.find((supplier) => supplier.id === orderSupplierId);
  const orderProductIds = new Set(orderItems.map((item) => item.productId));
  const orderSearchTerm = orderSearch.trim().toLowerCase();
  const orderSearchResults = physicalProducts
    .filter((product) => !orderProductIds.has(product.id))
    .filter((product) => {
      if (!orderSearchTerm) {
        return true;
      }

      return [
        product.name.en,
        product.name.ar,
        product.name.ur,
        product.barcode ?? ""
      ].some((value) => value.toLowerCase().includes(orderSearchTerm));
    })
    .slice(0, 8);
  const orderTotal = orderItems.reduce((sum, item) => {
    const quantityNumber = Number(item.quantity || 0);
    const costNumber = Number(item.costPrice || 0);

    return sum + (Number.isFinite(quantityNumber) ? quantityNumber : 0) * (Number.isFinite(costNumber) ? costNumber : 0);
  }, 0);
  const parsedOrderPaidAmount = Number(orderPaidAmount || 0);
  const orderPaidAmountNumber = Number.isFinite(parsedOrderPaidAmount) ? Math.max(0, parsedOrderPaidAmount) : 0;
  const orderPaymentStatus: PurchasePaymentStatus =
    orderPaidAmountNumber >= orderTotal && orderTotal > 0
      ? "paid"
      : orderPaidAmountNumber > 0
        ? "partial"
        : "unpaid";
  const orderDueAmount = Math.max(0, orderTotal - orderPaidAmountNumber);

  const applyAdjustment = () => {
    if (!selectedProduct || !isManager) {
      return;
    }

    const result = adjustInventory({
      productId: selectedProduct.id,
      type: adjustmentMode,
      quantity: Number(quantity),
      reason,
      supplierId: selectedSupplierId || undefined,
      expiryDate: adjustmentExpiryDate || undefined,
      costPrice: adjustmentMode === "add" ? Number(adjustmentCostPrice || selectedProduct.costPrice) : undefined
    });

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.ok ? t("inventory.adjustmentSaved") : result.message ?? t("inventory.adjustmentError")
    });

    if (result.ok) {
      setQuantity("");
      setReason("");
      setAdjustmentExpiryDate("");
      setAdjustmentCostPrice("");
    }
  };

  const applyQuickRestock = () => {
    if (!restockProduct || !isManager) {
      setFeedback({ tone: "error", message: t("inventory.barcodeNoMatch") });
      return;
    }

    const result = adjustInventory({
      productId: restockProduct.id,
      type: "add",
      quantity: Number(restockQuantity),
      reason: t("inventory.quickRestock"),
      supplierId: selectedSupplierId || undefined,
      expiryDate: restockExpiryDate || undefined,
      costPrice: Number(restockCostPrice || restockProduct.costPrice)
    });

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.ok ? t("inventory.adjustmentSaved") : result.message ?? t("inventory.adjustmentError")
    });

    if (result.ok) {
      setRestockBarcode("");
      setRestockQuantity("1");
      setRestockExpiryDate("");
      setRestockCostPrice("");
    }
  };

  const saveSupplierForm = () => {
    const result = saveSupplier({
      id: supplierForm.id || undefined,
      name: supplierForm.name,
      phone: supplierForm.phone,
      email: supplierForm.email,
      vatNumber: supplierForm.vatNumber,
      contactPerson: supplierForm.contactPerson,
      address: supplierForm.address,
      defaultPaymentMethod: supplierForm.defaultPaymentMethod,
      accountBalance: Number(supplierForm.accountBalance || 0)
    });

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.ok ? t("inventory.supplierSaved") : result.message ?? t("inventory.supplierSaveError")
    });

    if (result.ok) {
      setSupplierForm({
        id: "",
        name: "",
        phone: "",
        email: "",
        vatNumber: "",
        contactPerson: "",
        address: "",
        defaultPaymentMethod: "credit",
        accountBalance: ""
      });
    }
  };

  const startEditSupplier = (supplier: Supplier) => {
    setSupplierForm({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      vatNumber: supplier.vatNumber ?? "",
      contactPerson: supplier.contactPerson ?? "",
      address: supplier.address ?? "",
      defaultPaymentMethod: supplier.defaultPaymentMethod ?? "credit",
      accountBalance: String(supplier.accountBalance ?? 0)
    });
    setFeedback(null);
  };

  const removeSupplier = (supplierId: string) => {
    const result = deleteSupplier(supplierId);

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.ok ? t("inventory.supplierRemoved") : result.message ?? t("inventory.supplierRemoveError")
    });
  };

  const addProductToOrder = (product: Product) => {
    setOrderItems((current) => [
      ...current,
      {
        productId: product.id,
        quantity: String(buildSuggestedOrderQuantity(product)),
        costPrice: String(product.costPrice)
      }
    ]);
    setOrderSearch("");
  };

  const updateOrderItem = (productId: string, patch: Partial<PurchaseOrderDraftItem>) => {
    setOrderItems((current) =>
      current.map((item) => (item.productId === productId ? { ...item, ...patch } : item))
    );
  };

  const removeOrderItem = (productId: string) => {
    setOrderItems((current) => current.filter((item) => item.productId !== productId));
  };

  const savePurchaseOrder = () => {
    const selectedSupplier = suppliers.find((supplier) => supplier.id === orderSupplierId);
    const result = createPurchaseOrder({
      number: poNumber,
      supplierId: selectedSupplier?.id,
      supplierName: selectedSupplier?.name ?? orderSupplierName,
      expectedAt: poExpectedAt || undefined,
      note: poNote,
      paymentMethod: orderPaymentMethod,
      paymentStatus: orderPaymentStatus,
      paidAmount: orderPaidAmountNumber,
      items: orderItems.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity || 0),
        costPrice: Number(item.costPrice || 0)
      }))
    });

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.ok ? t("inventory.poSaved") : result.message ?? t("inventory.poSaveError")
    });

    if (result.ok) {
      setPoNumber(createPoNumber());
      setPoNote("");
      setPoExpectedAt("");
      setOrderSupplierName("");
      setOrderItems([]);
      setOrderSearch("");
      setOrderPaidAmount("");
      setOrderPaymentMethod(orderSupplier?.defaultPaymentMethod ?? "credit");
    }
  };

  const startReceivingOrder = (purchaseOrderId: string) => {
    const order = purchaseOrders.find((entry) => entry.id === purchaseOrderId);
    const orderItems = purchaseOrderItemsByOrderId[purchaseOrderId] ?? [];

    setReceivingOrderId(purchaseOrderId);
    setReceivePaymentMethod(order?.paymentMethod ?? "credit");
    setReceivePaidAmount("");
    setReceiveItems(
      Object.fromEntries(
        orderItems.map((item) => {
          const remainingQuantity = Math.max(0, item.quantity - (item.receivedQuantity ?? 0));

          return [
            item.id,
            {
              costPrice: String(item.costPrice),
              expiryDate: item.expiryDate ?? "",
              quantity: String(remainingQuantity)
            }
          ];
        })
      )
    );
    setFeedback(null);
  };

  const updateReceiveItem = (purchaseOrderItemId: string, patch: Partial<PurchaseOrderReceiveItem>) => {
    setReceiveItems((current) => ({
      ...current,
      [purchaseOrderItemId]: {
        costPrice: current[purchaseOrderItemId]?.costPrice ?? "0",
        expiryDate: current[purchaseOrderItemId]?.expiryDate ?? "",
        quantity: current[purchaseOrderItemId]?.quantity ?? "0",
        ...patch
      }
    }));
  };

  const receiveOrder = (purchaseOrderId: string) => {
    const result = receivePurchaseOrder(purchaseOrderId, {
      paymentMethod: receivePaymentMethod,
      paidAmount: Number(receivePaidAmount || 0),
      items: (purchaseOrderItemsByOrderId[purchaseOrderId] ?? []).map((item) => ({
        purchaseOrderItemId: item.id,
        receivedQuantity: Number(receiveItems[item.id]?.quantity || 0),
        costPrice: Number(receiveItems[item.id]?.costPrice || item.costPrice),
        expiryDate: receiveItems[item.id]?.expiryDate || undefined
      }))
    });

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.ok ? t("inventory.poReceived") : result.message ?? t("inventory.poReceiveError")
    });

    if (result.ok) {
      setReceivingOrderId("");
      setReceiveItems({});
      setReceivePaidAmount("");
      setReceivePaymentMethod("credit");
    }
  };

  const renderExpiryBadge = (product: Product, batch?: InventoryBatch) => {
    const expiryState = resolveExpiryState(product, batch ?? nearestBatchByProductId[product.id]);

    if (expiryState === "expired") {
      return <Badge variant="danger">{t("inventory.expired")}</Badge>;
    }

    if (expiryState === "near") {
      return <Badge variant="warning">{t("inventory.nearExpiry")}</Badge>;
    }

    if (expiryState === "healthy") {
      return <Badge variant="success">{t("inventory.expiryHealthy")}</Badge>;
    }

    return <Badge variant="neutral">{t("inventory.noExpiry")}</Badge>;
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("inventory.title")} subtitle={t("inventory.subtitle")} eyebrow={t("nav.inventory")} />

      <WorkspaceSectionsNav
        compact
        items={[
          {
            href: "/inventory?view=stock",
            active: activeView === "stock",
            label: t("inventory.stockTable"),
            description: t("inventory.stockTableDesc")
          },
          {
            href: "/inventory?view=restock",
            active: activeView === "restock",
            label: t("inventory.quickRestock"),
            description: t("inventory.quickRestockDesc")
          },
          {
            href: "/inventory?view=adjust",
            active: activeView === "adjust",
            label: t("inventory.addStock"),
            description: t("inventory.removeStock")
          },
          {
            href: "/inventory?view=order",
            active: activeView === "order",
            label: t("inventory.orderStock"),
            description: t("inventory.purchaseOrderDesc")
          },
          {
            href: "/inventory?view=suppliers",
            active: activeView === "suppliers",
            label: t("inventory.suppliers"),
            description: t("inventory.suppliersDesc")
          },
          {
            href: "/inventory?view=expiry",
            active: activeView === "expiry",
            label: t("inventory.expiryAlerts"),
            description: t("inventory.expiryAlertsDesc")
          }
        ]}
      />

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

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-slate-500">{t("reports.inventoryItems")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{physicalProducts.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">{t("reports.inventoryUnits")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {physicalProducts.reduce((sum, product) => sum + product.stockQuantity, 0)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">{t("inventory.stockValue")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{formatCurrency(stockValue, currency, locale)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">{t("inventory.expiryAlerts")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{expiryEntries.length}</p>
        </Card>
      </div>

      {activeView === "stock" ? (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
            <Boxes className="h-5 w-5 text-slate-950" />
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{t("inventory.stockTable")}</h2>
              <p className="text-sm text-slate-500">{t("inventory.stockTableDesc")}</p>
            </div>
          </div>

          {physicalProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3">{t("inventory.product")}</th>
                    <th className="px-5 py-3">{t("common.barcode")}</th>
                    <th className="px-5 py-3">{t("inventory.onHand")}</th>
                    <th className="px-5 py-3">{t("inventory.reorderAt")}</th>
                    <th className="px-5 py-3">{t("common.costPrice")}</th>
                    <th className="px-5 py-3">{t("inventory.stockValue")}</th>
                    <th className="px-5 py-3">{t("products.expiryDate")}</th>
                    <th className="px-5 py-3">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {physicalProducts.map((product) => (
                    <tr key={product.id}>
                      <td className="px-5 py-4 font-semibold text-slate-950">{getProductName(product, locale)}</td>
                      <td className="px-5 py-4 text-slate-600">{product.barcode ?? t("common.notAvailable")}</td>
                      <td className="px-5 py-4 text-slate-950">{product.stockQuantity}</td>
                      <td className="px-5 py-4 text-slate-600">{product.reorderLevel}</td>
                      <td className="px-5 py-4 text-slate-600">{formatCurrency(product.costPrice, currency, locale)}</td>
                      <td className="px-5 py-4 text-slate-950">
                        {formatCurrency(product.stockQuantity * product.costPrice, currency, locale)}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {nearestBatchByProductId[product.id]?.expiryDate
                          ? formatBusinessDate(nearestBatchByProductId[product.id].expiryDate!, locale)
                          : product.expiryDate
                            ? formatBusinessDate(product.expiryDate, locale)
                            : t("common.notAvailable")}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={product.stockQuantity <= product.reorderLevel ? "warning" : "success"}>
                            {product.stockQuantity <= product.reorderLevel ? t("products.reorderNeeded") : t("products.stockHealthy")}
                          </Badge>
                          {renderExpiryBadge(product)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-600">{t("inventory.noProducts")}</div>
          )}
        </Card>
      ) : null}

      {activeView === "restock" ? (
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-slate-950" />
              <h2 className="text-lg font-semibold text-slate-950">{t("inventory.quickRestock")}</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("inventory.quickRestockDesc")}</p>

            {!isManager ? (
              <div className="mt-5 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {t("inventory.managerOnly")}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.scanBarcode")}</label>
                <Input
                  autoFocus
                  disabled={!isManager}
                  value={restockBarcode}
                  onChange={(event) => setRestockBarcode(event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("common.quantity")}</label>
                  <Input
                    disabled={!isManager}
                    inputMode="decimal"
                    value={restockQuantity}
                    onChange={(event) => setRestockQuantity(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.newCostPrice")}</label>
                  <Input
                    disabled={!isManager || !restockProduct}
                    inputMode="decimal"
                    placeholder={restockProduct ? String(restockProduct.costPrice) : t("common.costPrice")}
                    value={restockCostPrice}
                    onChange={(event) => setRestockCostPrice(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("products.expiryDate")}</label>
                  <Input
                    disabled={!isManager}
                    type="date"
                    value={restockExpiryDate}
                    onChange={(event) => setRestockExpiryDate(event.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.supplier")}</label>
                <Select
                  disabled={!isManager}
                  value={selectedSupplierId}
                  onChange={(event) => setSelectedSupplierId(event.target.value)}
                >
                  <option value="">{t("common.notAvailable")}</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button disabled={!isManager || !restockProduct} onClick={applyQuickRestock}>
                {t("inventory.restockNow")}
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-950">{t("inventory.scannedProduct")}</h2>
            {restockProduct ? (
              <div className="mt-5 rounded-[22px] border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-xl font-semibold text-slate-950">{getProductName(restockProduct, locale)}</p>
                <p className="mt-2 text-sm text-slate-600">{restockProduct.barcode}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="success">{t("inventory.onHand")}: {restockProduct.stockQuantity}</Badge>
                  {renderExpiryBadge(restockProduct)}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                {t("inventory.barcodeNoMatch")}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {activeView === "adjust" ? (
        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              {adjustmentMode === "add" ? <PlusCircle className="h-5 w-5 text-emerald-700" /> : <MinusCircle className="h-5 w-5 text-red-600" />}
              <h2 className="text-lg font-semibold text-slate-950">{t("inventory.addStock")} / {t("inventory.removeStock")}</h2>
            </div>

            {!isManager ? (
              <div className="mt-5 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {t("inventory.managerOnly")}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={!isManager}
                  onClick={() => setAdjustmentMode("add")}
                  variant={adjustmentMode === "add" ? "primary" : "secondary"}
                >
                  {t("inventory.addStock")}
                </Button>
                <Button
                  disabled={!isManager}
                  onClick={() => setAdjustmentMode("remove")}
                  variant={adjustmentMode === "remove" ? "danger" : "secondary"}
                >
                  {t("inventory.removeStock")}
                </Button>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.selectProduct")}</label>
                <Select
                  disabled={!isManager || physicalProducts.length === 0}
                  value={selectedProduct?.id ?? ""}
                  onChange={(event) => setSelectedProductId(event.target.value)}
                >
                  {physicalProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {getProductName(product, locale)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("common.quantity")}</label>
                  <Input
                    disabled={!isManager}
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.newCostPrice")}</label>
                  <Input
                    disabled={!isManager || adjustmentMode === "remove"}
                    inputMode="decimal"
                    placeholder={selectedProduct ? String(selectedProduct.costPrice) : t("common.costPrice")}
                    value={adjustmentCostPrice}
                    onChange={(event) => setAdjustmentCostPrice(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("products.expiryDate")}</label>
                  <Input
                    disabled={!isManager || adjustmentMode === "remove"}
                    type="date"
                    value={adjustmentExpiryDate}
                    onChange={(event) => setAdjustmentExpiryDate(event.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.supplier")}</label>
                <Select
                  disabled={!isManager}
                  value={selectedSupplierId}
                  onChange={(event) => setSelectedSupplierId(event.target.value)}
                >
                  <option value="">{t("common.notAvailable")}</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              </div>
              {adjustmentMode === "remove" ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-950">{t("common.reason")}</label>
                <Textarea
                  className="min-h-24"
                  disabled={!isManager}
                  placeholder={t("inventory.reasonPlaceholder")}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              ) : null}
              <Button disabled={!isManager || !selectedProduct} onClick={applyAdjustment}>
                {t("common.saveChanges")}
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
              <History className="h-5 w-5 text-slate-950" />
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{t("inventory.adjustmentHistory")}</h2>
                <p className="text-sm text-slate-500">{t("inventory.adjustmentHistoryDesc")}</p>
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto p-4">
              {inventoryHistory.length > 0 ? (
                <div className="space-y-3">
                  {inventoryHistory.map((entry) => {
                    const product = physicalProducts.find((item) => item.id === entry.productId);
                    const supplier = suppliers.find((item) => item.id === entry.supplierId);

                    return (
                      <div key={entry.id} className="rounded-[18px] border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">
                              {product ? getProductName(product, locale) : t("common.notAvailable")}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">{entry.reason}</p>
                          </div>
                          <Badge variant={entry.type === "remove" || entry.type === "sale" ? "warning" : "success"}>
                            {entry.type} {entry.quantity}
                          </Badge>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                          <span>{entry.beforeQuantity} -&gt; {entry.afterQuantity}</span>
                          <span>{supplier?.name ?? t("common.notAvailable")}</span>
                          <span>{formatDateTime(entry.createdAt, locale)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  {t("inventory.noAdjustments")}
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {activeView === "order" ? (
        <div className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ShoppingBasket className="h-5 w-5 text-slate-950" />
              <h2 className="text-lg font-semibold text-slate-950">{t("inventory.orderStock")}</h2>
            </div>
            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.supplier")}</label>
                <Select
                  value={orderSupplierId}
                  onChange={(event) => {
                    const supplier = suppliers.find((entry) => entry.id === event.target.value);
                    setOrderSupplierId(event.target.value);
                    setOrderPaymentMethod(supplier?.defaultPaymentMethod ?? "credit");
                  }}
                >
                  <option value="">{t("inventory.newSupplierName")}</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              </div>
              {!orderSupplierId ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.supplierName")}</label>
                  <Input value={orderSupplierName} onChange={(event) => setOrderSupplierName(event.target.value)} />
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.poNumber")}</label>
                  <Input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.expectedDate")}</label>
                  <Input type="date" value={poExpectedAt} onChange={(event) => setPoExpectedAt(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.purchasePaymentMethod")}</label>
                  <Select value={orderPaymentMethod} onChange={(event) => setOrderPaymentMethod(event.target.value as SupplierPaymentMethod)}>
                    <option value="credit">{t("inventory.payCredit")}</option>
                    <option value="cash">{t("common.cash")}</option>
                    <option value="card">{t("common.card")}</option>
                    <option value="bank">{t("inventory.payBank")}</option>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.amountPaid")}</label>
                  <Input inputMode="decimal" value={orderPaidAmount} onChange={(event) => setOrderPaidAmount(event.target.value)} />
                </div>
              </div>
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <span>{t("common.total")}</span>
                  <span className="font-semibold text-slate-950">{formatCurrency(orderTotal, currency, locale)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span>{t("common.dueAmount")}</span>
                  <span className="font-semibold text-slate-950">{formatCurrency(orderDueAmount, currency, locale)}</span>
                </div>
              </div>
              <Textarea
                placeholder={t("common.notes")}
                value={poNote}
                onChange={(event) => setPoNote(event.target.value)}
              />
              <Button disabled={!isManager || orderItems.length === 0} onClick={savePurchaseOrder}>
                {t("inventory.purchaseOrder")}
              </Button>
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-slate-950" />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">{poNumber}</h2>
                    <p className="text-sm text-slate-500">
                      {orderSupplier?.name || orderSupplierName || t("inventory.supplierName")}
                    </p>
                  </div>
                </div>
                <Badge variant="neutral">{orderItems.length} {t("common.items")}</Badge>
              </div>

              <div className="border-b border-slate-200 p-5">
                <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.searchProductToOrder")}</label>
                <Input
                  placeholder={t("inventory.searchProductToOrder")}
                  value={orderSearch}
                  onChange={(event) => setOrderSearch(event.target.value)}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {orderSearchResults.map((product) => (
                    <button
                      key={product.id}
                      className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
                      type="button"
                      onClick={() => addProductToOrder(product)}
                    >
                      <span className="block font-semibold text-slate-950">{getProductName(product, locale)}</span>
                      <span className="mt-1 block text-sm text-slate-500">
                        {product.barcode ?? t("common.notAvailable")} | {t("common.costPrice")} {formatCurrency(product.costPrice, currency, locale)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {orderItems.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                      <tr>
                        <th className="px-5 py-3">{t("inventory.product")}</th>
                        <th className="px-5 py-3">{t("inventory.onHand")}</th>
                        <th className="px-5 py-3">{t("inventory.orderQuantity")}</th>
                        <th className="px-5 py-3">{t("inventory.initialCost")}</th>
                        <th className="px-5 py-3">{t("inventory.updatedCost")}</th>
                        <th className="px-5 py-3">{t("common.total")}</th>
                        <th className="px-5 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orderItems.map((item) => {
                        const product = productById[item.productId];
                        const quantityNumber = Number(item.quantity || 0);
                        const costNumber = Number(item.costPrice || 0);
                        const safeQuantity = Number.isFinite(quantityNumber) ? Math.max(0, quantityNumber) : 0;
                        const safeCost = Number.isFinite(costNumber) ? Math.max(0, costNumber) : 0;
                        const lineTotal = safeQuantity * safeCost;

                        if (!product) {
                          return null;
                        }

                        return (
                          <tr key={item.productId}>
                            <td className="px-5 py-4 font-semibold text-slate-950">{getProductName(product, locale)}</td>
                            <td className="px-5 py-4 text-slate-600">{product.stockQuantity}</td>
                            <td className="px-5 py-4">
                              <Input
                                className="h-10 w-28"
                                inputMode="decimal"
                                value={item.quantity}
                                onChange={(event) => updateOrderItem(item.productId, { quantity: event.target.value })}
                              />
                            </td>
                            <td className="px-5 py-4 text-slate-600">{formatCurrency(product.costPrice, currency, locale)}</td>
                            <td className="px-5 py-4">
                              <Input
                                className="h-10 w-32"
                                inputMode="decimal"
                                value={item.costPrice}
                                onChange={(event) => updateOrderItem(item.productId, { costPrice: event.target.value })}
                              />
                            </td>
                            <td className="px-5 py-4 font-semibold text-slate-950">{formatCurrency(lineTotal, currency, locale)}</td>
                            <td className="px-5 py-4 text-right">
                              <Button size="sm" variant="danger" onClick={() => removeOrderItem(item.productId)}>
                                {t("common.remove")}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-sm text-slate-600">{t("inventory.noOrderItems")}</div>
              )}
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-950">{t("inventory.purchaseOrders")}</h2>
              </div>
              <div className="max-h-[360px] overflow-y-auto p-4">
                {purchaseOrders.length > 0 ? (
                  <div className="space-y-3">
                    {purchaseOrders.map((order) => {
                      const orderItems = purchaseOrderItemsByOrderId[order.id] ?? [];
                      const orderedUnits = orderItems.reduce((sum, item) => sum + item.quantity, 0);
                      const receivedUnits = orderItems.reduce((sum, item) => sum + (item.receivedQuantity ?? 0), 0);
                      const remainingAmount = Math.max(0, (order.totalAmount ?? 0) - (order.paidAmount ?? 0));

                      return (
                      <div key={order.id} className="rounded-[18px] border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">{order.number}</p>
                            <p className="mt-1 text-sm text-slate-500">{order.supplierName}</p>
                            <p className="mt-1 text-sm text-slate-500">
                              {formatCurrency(order.totalAmount ?? 0, currency, locale)} | {t("inventory.amountPaid")} {formatCurrency(order.paidAmount ?? 0, currency, locale)}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {t("inventory.receivedQuantity")}: {receivedUnits} / {orderedUnits} | {t("inventory.paymentDue")} {formatCurrency(remainingAmount, currency, locale)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={order.status === "received" ? "success" : "neutral"}>{order.status}</Badge>
                            <Badge variant={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "partial" ? "warning" : "neutral"}>
                              {order.paymentStatus ?? "unpaid"}
                            </Badge>
                            {order.status !== "received" && order.status !== "cancelled" ? (
                              <Button
                                size="sm"
                                disabled={!isManager}
                                onClick={() => startReceivingOrder(order.id)}
                              >
                                {t("inventory.receiveAndPay")}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-slate-500">{formatDateTime(order.createdAt, locale)}</p>

                        {receivingOrderId === order.id ? (
                          <div className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50/50 p-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.purchasePaymentMethod")}</label>
                                <Select value={receivePaymentMethod} onChange={(event) => setReceivePaymentMethod(event.target.value as SupplierPaymentMethod)}>
                                  <option value="credit">{t("inventory.payCredit")}</option>
                                  <option value="cash">{t("common.cash")}</option>
                                  <option value="card">{t("common.card")}</option>
                                  <option value="bank">{t("inventory.payBank")}</option>
                                </Select>
                              </div>
                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.amountToPayNow")}</label>
                                <Input inputMode="decimal" value={receivePaidAmount} onChange={(event) => setReceivePaidAmount(event.target.value)} />
                              </div>
                            </div>

                            <div className="mt-4 overflow-x-auto">
                              <table className="w-full min-w-[780px] text-left text-sm">
                                <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                  <tr>
                                    <th className="px-3 py-2">{t("inventory.product")}</th>
                                    <th className="px-3 py-2">{t("inventory.remainingQuantity")}</th>
                                    <th className="px-3 py-2">{t("inventory.receiveQuantity")}</th>
                                    <th className="px-3 py-2">{t("inventory.updatedCost")}</th>
                                    <th className="px-3 py-2">{t("products.expiryDate")}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-emerald-100">
                                  {orderItems.map((item) => {
                                    const product = productById[item.productId];
                                    const remainingQuantity = Math.max(0, item.quantity - (item.receivedQuantity ?? 0));

                                    return (
                                      <tr key={item.id}>
                                        <td className="px-3 py-2 font-semibold text-slate-950">
                                          {product ? getProductName(product, locale) : item.productName.en}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600">{remainingQuantity}</td>
                                        <td className="px-3 py-2">
                                          <Input
                                            className="h-10 w-28"
                                            inputMode="decimal"
                                            value={receiveItems[item.id]?.quantity ?? "0"}
                                            onChange={(event) => updateReceiveItem(item.id, { quantity: event.target.value })}
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            className="h-10 w-32"
                                            inputMode="decimal"
                                            value={receiveItems[item.id]?.costPrice ?? String(item.costPrice)}
                                            onChange={(event) => updateReceiveItem(item.id, { costPrice: event.target.value })}
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            className="h-10 w-40"
                                            type="date"
                                            value={receiveItems[item.id]?.expiryDate ?? ""}
                                            onChange={(event) => updateReceiveItem(item.id, { expiryDate: event.target.value })}
                                          />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3">
                              <Button disabled={!isManager} onClick={() => receiveOrder(order.id)}>
                                {t("inventory.applyReceivePayment")}
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  setReceivingOrderId("");
                                  setReceiveItems({});
                                  setReceivePaidAmount("");
                                }}
                              >
                                {t("common.cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                    {t("inventory.noPurchaseOrders")}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {activeView === "suppliers" ? (
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-slate-950" />
              <h2 className="text-lg font-semibold text-slate-950">{t("inventory.suppliers")}</h2>
            </div>
            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.supplierName")}</label>
                <Input value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("common.phone")}</label>
                  <Input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("common.email")}</label>
                  <Input value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("common.vatNumber")}</label>
                  <Input value={supplierForm.vatNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, vatNumber: event.target.value }))} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.contactPerson")}</label>
                  <Input value={supplierForm.contactPerson} onChange={(event) => setSupplierForm((current) => ({ ...current, contactPerson: event.target.value }))} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.defaultPayment")}</label>
                  <Select
                    value={supplierForm.defaultPaymentMethod}
                    onChange={(event) => setSupplierForm((current) => ({ ...current, defaultPaymentMethod: event.target.value as SupplierPaymentMethod }))}
                  >
                    <option value="credit">{t("inventory.payCredit")}</option>
                    <option value="cash">{t("common.cash")}</option>
                    <option value="card">{t("common.card")}</option>
                    <option value="bank">{t("inventory.payBank")}</option>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-950">{t("inventory.supplierBalance")}</label>
                  <Input inputMode="decimal" value={supplierForm.accountBalance} onChange={(event) => setSupplierForm((current) => ({ ...current, accountBalance: event.target.value }))} />
                </div>
              </div>
              <Textarea
                placeholder={t("common.address")}
                value={supplierForm.address}
                onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))}
              />
              <div className="flex flex-wrap gap-3">
                <Button disabled={!isManager || !supplierForm.name.trim()} onClick={saveSupplierForm}>
                  {supplierForm.id ? t("common.saveChanges") : t("inventory.saveSupplier")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSupplierForm({ id: "", name: "", phone: "", email: "", vatNumber: "", contactPerson: "", address: "", defaultPaymentMethod: "credit", accountBalance: "" })}
                >
                  {t("common.clearForm")}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{t("inventory.suppliers")}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {suppliers.length > 0 ? (
                suppliers.map((supplier) => (
                  <div key={supplier.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{supplier.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{supplier.phone || supplier.email || t("common.notAvailable")}</p>
                      {supplier.vatNumber ? <p className="mt-1 text-sm text-slate-500">{t("common.vatNumber")}: {supplier.vatNumber}</p> : null}
                      <p className="mt-1 text-sm text-slate-500">
                        {t("inventory.defaultPayment")}: {supplier.defaultPaymentMethod ?? "credit"} | {t("inventory.supplierBalance")}: {formatCurrency(supplier.accountBalance ?? 0, currency, locale)}
                      </p>
                      {supplier.address ? <p className="mt-1 text-sm text-slate-500">{supplier.address}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEditSupplier(supplier)}>
                        {t("common.edit")}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => removeSupplier(supplier.id)}>
                        {t("common.remove")}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-sm text-slate-600">{t("inventory.noSuppliers")}</div>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {activeView === "expiry" ? (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
            <CalendarClock className="h-5 w-5 text-slate-950" />
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{t("inventory.expiryAlerts")}</h2>
              <p className="text-sm text-slate-500">{t("inventory.expiryAlertsDesc")}</p>
            </div>
          </div>

          {expiryEntries.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {expiryEntries.map(({ batch, product }) => (
                <div key={batch.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{getProductName(product, locale)}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {batch.batchNumber ?? batch.id} | {batch.expiryDate ? formatBusinessDate(batch.expiryDate, locale) : t("common.notAvailable")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {renderExpiryBadge(product, batch)}
                    <Badge variant="neutral">{t("inventory.onHand")}: {batch.remainingQuantity}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-600">{t("inventory.noExpiryAlerts")}</div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
