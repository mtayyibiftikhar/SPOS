"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  BusinessDay,
  CreateRefundInput,
  CheckoutBillInput,
  Customer,
  CustomerAccountPayment,
  DemoAppState,
  DictionaryEntry,
  Locale,
  LicenseStatus,
  Product,
  ProductCategory,
  ProductKeyStatus,
  PurchasePaymentStatus,
  SessionUser,
  Shop,
  ShopSettingsBundle,
  Shift,
  SupportTicket,
  User,
  WorkspaceKind
} from "@/types/pos";
import { localeMeta, resolveTranslation, type TranslationKey, type TranslationValues } from "@/lib/i18n";
import { DEFAULT_OWNER_BOOTSTRAP, normalizeDemoUsers, type OwnerBootstrapAccount } from "@/lib/demo-auth";
import { initialAppState } from "@/lib/mock-data";
import { applySettlementToBills, getCustomerAccountMetrics } from "@/lib/customer-accounts";
import {
  calculateBusinessDaySummary,
  calculateShiftSummary,
  getActiveBusinessDay,
  getActiveShift,
  getBusinessDateInTimezone
} from "@/lib/cash-control";
import {
  buildCashMovementLedgerEntries,
  buildCustomerSettlementLedgerEntries,
  buildExpenseLedgerEntries,
  buildRefundLedgerEntries,
  buildSaleLedgerEntries,
  rebuildAccountingLedger
} from "@/lib/accounting";
import {
  calculateBillTotals,
  calculateDiscountAmount,
  calculatePaidAndDue,
  findExistingCustomer,
  findCustomerPhoneConflict,
  getBillStatus,
  normalizeDiscountValue,
  normalizeCustomer,
  shouldPersistCustomer
} from "@/lib/billing";
import {
  findBarcodeConflict,
  findCategoryNameConflict,
  findUserEmailConflict,
  generateUniqueBarcode,
  normalizeBarcode
} from "@/lib/catalog";
import { calculateBillRefundState } from "@/lib/refunds";
import { createId, getDirection, hashSecret } from "@/lib/utils";

const STORAGE_KEY = "simple-pos-demo-state";
const SHARED_STATE_ENDPOINT = "/api/local-state";
const MIN_PASSWORD_LENGTH = 8;

function validatePasswordLength(password: string, label = "Password") {
  return password.trim().length >= MIN_PASSWORD_LENGTH
    ? null
    : `${label} must be at least ${MIN_PASSWORD_LENGTH} characters.`;
}

type LoginPayload = {
  email: string;
  password: string;
  workspace: WorkspaceKind;
};

type ProductInput = {
  id?: string;
  kind: Product["kind"];
  categoryId?: string;
  barcode?: string;
  name: Product["name"];
  salePrice: number;
  costPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  expiryDate?: string;
  taxable: boolean;
  quickTab: boolean;
  status: Product["status"];
};

type OwnerCreateShopInput = {
  shopName: string;
  phone?: string;
  email?: string;
  setupEmail: string;
  setupPassword: string;
  address?: string;
  planName: string;
  licenseStatus: LicenseStatus;
  expiresAt?: string;
  allowedDevices: number;
  autoLockDaysAfterExpiry: number;
};

type RegisterInstalledShopInput = {
  adminUserId?: string;
  setupEmail?: string;
  setupPassword?: string;
  ownerSnapshot?: Partial<DemoAppState> | null;
  productKey?: string;
  shopName: string;
  logoUrl?: string;
  address: string;
  phone: string;
  email?: string;
  website?: string;
  currency: string;
  vatNumber?: string;
  receiptQrUrl?: string;
  taxEnabled: boolean;
  taxName: string;
  taxRate: number;
  taxMode: ShopSettingsBundle["tax"]["mode"];
  receiptFooterText: string;
  adminName: string;
  adminEmail: string;
  adminPhone?: string;
  adminPassword: string;
  createCashier?: boolean;
  cashierName?: string;
  cashierEmail?: string;
  cashierPassword?: string;
};

type CloudActivationStatePatch = Partial<
  Pick<
    DemoAppState,
    "categories" | "deviceActivations" | "licenses" | "productKeys" | "settingsByShop" | "shops" | "users"
  >
>;

type OwnerLicenseInput = {
  shopId: string;
  status: LicenseStatus;
  expiresAt?: string;
  planName?: string;
  allowedDevices?: number;
  autoLockDaysAfterExpiry?: number;
  lockReason?: string;
};

type SettingsSection = keyof ShopSettingsBundle;

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `shop-${Math.random().toString(36).slice(2, 7)}`
  );
}

function toDateTime(value?: string) {
  if (!value) {
    return undefined;
  }

  return value.includes("T") ? value : `${value}T23:59:59.000Z`;
}

function generateProductKeyCode(existingKeys: DemoAppState["productKeys"]) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomSegment = (length: number) => {
    const cryptoApi = globalThis.crypto;
    const values = new Uint32Array(length);

    if (cryptoApi?.getRandomValues) {
      cryptoApi.getRandomValues(values);
    } else {
      values.forEach((_, index) => {
        values[index] = Math.floor(Math.random() * alphabet.length);
      });
    }

    return Array.from(values)
      .map((value) => alphabet[value % alphabet.length])
      .join("");
  };
  let key = "";

  do {
    key = `SPOS-KSA-${randomSegment(6)}-${randomSegment(6)}-${randomSegment(6)}-${randomSegment(6)}`;
  } while (existingKeys.some((entry) => entry.key === key));

  return key;
}

function getEffectiveLicenseStatus(license: DemoAppState["licenses"][number] | undefined, now = new Date()) {
  if (!license) {
    return "locked" as LicenseStatus;
  }

  if (license.status === "locked") {
    return "locked" as LicenseStatus;
  }

  if (license.expiresAt) {
    const expiry = new Date(license.expiresAt);

    if (Number.isFinite(expiry.getTime()) && now.getTime() > expiry.getTime()) {
      const daysExpired = Math.floor((now.getTime() - expiry.getTime()) / 86_400_000);
      const autoLockDays = license.autoLockDaysAfterExpiry ?? 0;

      return daysExpired >= autoLockDays ? ("locked" as LicenseStatus) : ("expired" as LicenseStatus);
    }
  }

  return license.status;
}

function getShopAccessBlock(state: DemoAppState, shopId: string) {
  const license = state.licenses.find((entry) => entry.shopId === shopId);
  const status = getEffectiveLicenseStatus(license);

  if (status === "locked") {
    return "Your POS is temporarily locked. Please contact support.";
  }

  if (status === "expired") {
    return "Your POS license has expired. Please contact support.";
  }

  return null;
}

function getCurrentBrowserInfo() {
  return typeof window !== "undefined" ? window.navigator.userAgent : "Current browser";
}

function hasActivatedDeviceAccess(state: DemoAppState, shopId: string, browserInfo = getCurrentBrowserInfo()) {
  const activeProductKeyIds = new Set(
    state.productKeys
      .filter((productKey) => productKey.shopId === shopId && productKey.status === "active")
      .map((productKey) => productKey.id)
  );

  if (activeProductKeyIds.size === 0) {
    return false;
  }

  return state.deviceActivations.some(
    (activation) =>
      activation.shopId === shopId &&
      activeProductKeyIds.has(activation.productKeyId) &&
      activation.browserInfo === browserInfo
  );
}

function maskKey(value: string) {
  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function consumeInventoryBatches(
  batches: DemoAppState["inventoryBatches"],
  productId: string,
  quantity: number
) {
  let remainingToConsume = quantity;
  const sortedBatchIds = batches
    .filter((batch) => batch.productId === productId && batch.remainingQuantity > 0)
    .sort((left, right) => {
      const leftDate = left.expiryDate || left.receivedAt;
      const rightDate = right.expiryDate || right.receivedAt;
      return leftDate.localeCompare(rightDate);
    })
    .map((batch) => batch.id);
  const nextRemainingByBatchId = new Map<string, number>();

  sortedBatchIds.forEach((batchId) => {
    if (remainingToConsume <= 0) {
      return;
    }

    const batch = batches.find((entry) => entry.id === batchId);

    if (!batch) {
      return;
    }

    const consumed = Math.min(batch.remainingQuantity, remainingToConsume);
    nextRemainingByBatchId.set(batchId, Math.round((batch.remainingQuantity - consumed) * 100) / 100);
    remainingToConsume = Math.round((remainingToConsume - consumed) * 100) / 100;
  });

  return batches.map((batch) =>
    nextRemainingByBatchId.has(batch.id)
      ? {
          ...batch,
          remainingQuantity: nextRemainingByBatchId.get(batch.id)!
        }
      : batch
  );
}

function resolveReceiptSequencesByShop(stored: DemoAppState) {
  const sequences = {
    ...initialAppState.receiptSequencesByShop,
    ...(stored.receiptSequencesByShop ?? {})
  };

  stored.bills?.forEach((bill) => {
    const match = bill.number.match(/REC-(\d+)$/);
    const currentSequence = sequences[bill.shopId] ?? 1;

    if (match) {
      sequences[bill.shopId] = Math.max(currentSequence, Number(match[1]) + 1);
    }
  });

  return sequences;
}

function resolveAccountPaymentSequencesByShop(stored: DemoAppState) {
  const sequences = {
    ...initialAppState.accountPaymentSequencesByShop,
    ...(stored.accountPaymentSequencesByShop ?? {})
  };

  stored.customerAccountPayments?.forEach((payment) => {
    const match = payment.number?.match(/PAY-(\d+)$/);
    const currentSequence = sequences[payment.shopId] ?? 1;

    if (match) {
      sequences[payment.shopId] = Math.max(currentSequence, Number(match[1]) + 1);
    }
  });

  return sequences;
}

interface AppContextValue {
  isHydrated: boolean;
  state: DemoAppState;
  session: SessionUser | null;
  currentShopId: string | null;
  currentShop: DemoAppState["shops"][number] | null;
  currentLicense: DemoAppState["licenses"][number] | null;
  currentSettings: ShopSettingsBundle | null;
  currentUsers: User[];
  currentBusinessDay: BusinessDay | null;
  currentShift: Shift | null;
  locale: Locale;
  direction: "ltr" | "rtl";
  t: (key: TranslationKey, values?: TranslationValues) => string;
  setLocale: (locale: Locale) => void;
  login: (payload: LoginPayload) => { ok: boolean; message?: string; workspace?: WorkspaceKind };
  completeCloudLogin: (payload: {
    user: User;
    workspace: WorkspaceKind;
  }) => { ok: boolean; message?: string; workspace?: WorkspaceKind };
  logout: () => void;
  logoutStoreDevice: (payload: {
    shopId: string;
    browserInfo: string;
    adminPassword: string;
  }) => { ok: boolean; message?: string };
  setBrandProfile: (payload: Partial<DemoAppState["brand"]>) => void;
  registerInstalledShop: (payload: RegisterInstalledShopInput) => {
    ok: boolean;
    message?: string;
    productKey?: string;
    shopId?: string;
  };
  ownerCreateShop: (payload: OwnerCreateShopInput) => { ok: boolean; message?: string; shopId?: string; productKey?: string };
  ownerDeleteShop: (payload: {
    shopId: string;
    confirmName: string;
  }) => { ok: boolean; message?: string };
  ownerGenerateProductKey: (payload: {
    shopId: string;
    allowedDevices: number;
    expiresAt?: string;
  }) => { ok: boolean; message?: string; productKey?: string };
  ownerDeleteProductKey: (payload: {
    productKeyId: string;
  }) => { ok: boolean; message?: string };
  activateProductKey: (payload: {
    key: string;
    browserInfo?: string;
  }) => { ok: boolean; message?: string; shopId?: string };
  mergeCloudActivationState: (payload: CloudActivationStatePatch) => void;
  ownerSetLicense: (payload: OwnerLicenseInput) => { ok: boolean; message?: string };
  ownerSetProductKeyStatus: (payload: {
    productKeyId: string;
    status: ProductKeyStatus;
  }) => { ok: boolean; message?: string };
  ownerStartSupportSession: (payload: {
    shopId: string;
    reason: string;
    minutes: number;
  }) => { ok: boolean; message?: string };
  ownerResetShopUserPassword: (payload: {
    userId: string;
    password: string;
  }) => { ok: boolean; message?: string };
  endSupportSession: () => void;
  updateSettings: <TSection extends SettingsSection>(
    section: TSection,
    values: Partial<ShopSettingsBundle[TSection]>
  ) => void;
  createSupportTicket: (payload: {
    subject: string;
    message: string;
    preferredChannel: SupportTicket["preferredChannel"];
  }) => void;
  saveCustomer: (payload: {
    id?: string;
    name: string;
    phone?: string;
    email?: string;
    whatsapp?: string;
  }) => { ok: boolean; message?: string; customerId?: string };
  deleteCustomer: (customerId: string) => { ok: boolean; message?: string };
  settleCustomerAccount: (payload: {
    customerId: string;
    amount: number;
    method: Extract<CustomerAccountPayment["method"], "cash" | "card">;
    note?: string;
  }) => { ok: boolean; message?: string; appliedAmount?: number; paymentId?: string; number?: string };
  addCategory: (payload: Pick<ProductCategory, "name" | "description">) => { ok: boolean; message?: string; categoryId?: string };
  updateCategory: (categoryId: string, payload: Partial<ProductCategory>) => { ok: boolean; message?: string };
  deleteCategory: (categoryId: string) => { ok: boolean; message?: string };
  saveProduct: (payload: ProductInput) => { ok: boolean; message?: string; barcode?: string };
  adjustInventory: (payload: {
    productId: string;
    type: "add" | "remove";
    quantity: number;
    reason?: string;
    supplierId?: string;
    expiryDate?: string;
    costPrice?: number;
  }) => { ok: boolean; message?: string };
  saveSupplier: (payload: {
    id?: string;
    name: string;
    phone?: string;
    email?: string;
    vatNumber?: string;
    contactPerson?: string;
    address?: string;
    defaultPaymentMethod?: DemoAppState["suppliers"][number]["defaultPaymentMethod"];
    accountBalance?: number;
  }) => { ok: boolean; message?: string; supplierId?: string };
  deleteSupplier: (supplierId: string) => { ok: boolean; message?: string };
  createPurchaseOrder: (payload: {
    number: string;
    supplierId?: string;
    supplierName: string;
    expectedAt?: string;
    note?: string;
    paymentMethod?: DemoAppState["purchaseOrders"][number]["paymentMethod"];
    paymentStatus?: DemoAppState["purchaseOrders"][number]["paymentStatus"];
    paidAmount?: number;
    items: Array<{ productId: string; quantity: number; costPrice: number }>;
  }) => { ok: boolean; message?: string; purchaseOrderId?: string };
  receivePurchaseOrder: (
    purchaseOrderId: string,
    payload?: {
      items?: Array<{
        costPrice?: number;
        expiryDate?: string;
        purchaseOrderItemId: string;
        receivedQuantity: number;
      }>;
      paidAmount?: number;
      paymentMethod?: DemoAppState["purchaseOrders"][number]["paymentMethod"];
    }
  ) => { ok: boolean; message?: string };
  deleteProduct: (productId: string, reason: string) => void;
  restoreDeletedProduct: (deletedProductId: string) => void;
  permanentlyDeleteProduct: (deletedProductId: string) => void;
  saveShopUser: (payload: {
    id?: string;
    name: string;
    email: string;
    phone?: string;
    role: Exclude<User["role"], "super_admin">;
    password?: string;
  }) => { ok: boolean; message?: string; userId?: string };
  setUserActive: (userId: string, isActive: boolean) => { ok: boolean; message?: string };
  createBill: (payload: CheckoutBillInput) => { ok: boolean; billId?: string; message?: string };
  updateBillCustomerContact: (payload: {
    billId: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    customerWhatsapp?: string;
  }) => { ok: boolean; message?: string };
  createRefund: (payload: CreateRefundInput) => { ok: boolean; refundId?: string; message?: string };
  startBusinessDay: (payload: { businessDate?: string; openingNote?: string }) => { ok: boolean; message?: string };
  closeBusinessDay: (payload: { countedCash: number; note?: string }) => { ok: boolean; message?: string };
  startShift: (payload: { openingCash: number }) => { ok: boolean; message?: string };
  endShift: (payload: { countedCash: number; note?: string }) => { ok: boolean; message?: string };
  addCashMovement: (payload: { type: "cash_in" | "cash_out"; amount: number; reason: string }) => { ok: boolean; message?: string };
  createExpense: (payload: {
    amount: number;
    categoryId?: string;
    categoryName: string;
    paymentMethod: DemoAppState["expenses"][number]["paymentMethod"];
    vendorName?: string;
    note?: string;
  }) => { ok: boolean; message?: string };
  upsertDictionaryEntry: (entry: Omit<DictionaryEntry, "id" | "updatedAt">) => void;
  removeDictionaryEntry: (key: TranslationKey, locale: Locale) => void;
  exportDataBackup: () => string;
  importDataBackup: (raw: string) => { ok: boolean; message?: string };
}

const AppContext = createContext<AppContextValue | null>(null);

function mergeSettingsByShop(storedSettings: DemoAppState["settingsByShop"] | undefined) {
  const shopIds = new Set([
    ...Object.keys(initialAppState.settingsByShop),
    ...Object.keys(storedSettings ?? {})
  ]);

  return Array.from(shopIds).reduce<DemoAppState["settingsByShop"]>((accumulator, shopId) => {
    const defaultBundle = initialAppState.settingsByShop[shopId];
    const storedBundle = storedSettings?.[shopId];

    accumulator[shopId] = {
      pos: {
        ...(defaultBundle?.pos ?? {}),
        ...(storedBundle?.pos ?? {})
      },
      printer: {
        ...(defaultBundle?.printer ?? {}),
        ...(storedBundle?.printer ?? {})
      },
      receipt: {
        ...(defaultBundle?.receipt ?? {}),
        ...(storedBundle?.receipt ?? {})
      },
      tax: {
        ...(defaultBundle?.tax ?? {}),
        ...(storedBundle?.tax ?? {})
      }
    };

    return accumulator;
  }, {});
}

function normalizeStoredProducts(products: DemoAppState["products"]) {
  const usedIds = new Set<string>();

  return products.reduce<DemoAppState["products"]>((accumulator, product) => {
    const productWithOptionalId = product as Product & { id?: string };
    const candidateId = productWithOptionalId.id?.trim() ?? "";
    const productId = candidateId && !usedIds.has(candidateId) ? candidateId : createId("prod");
    const barcodeCandidate = normalizeBarcode(product.barcode);
    const barcodeConflict = barcodeCandidate
      ? findBarcodeConflict(accumulator, product.shopId, barcodeCandidate)
      : undefined;
    const barcode = barcodeCandidate && !barcodeConflict
      ? barcodeCandidate
      : generateUniqueBarcode(accumulator, product.shopId);

    usedIds.add(productId);

    accumulator.push({
      ...product,
      id: productId,
      barcode,
      expiryDate: product.expiryDate?.trim() || undefined,
      reorderLevel: product.reorderLevel ?? 0,
      stockQuantity: product.stockQuantity ?? 0,
      taxable: product.taxable ?? true
    });

    return accumulator;
  }, []);
}

function normalizeStoredState(stored: DemoAppState, ownerBootstrap: OwnerBootstrapAccount = DEFAULT_OWNER_BOOTSTRAP) {
  const ownerSeed =
    initialAppState.users.find((user) => user.role === "super_admin") ?? initialAppState.users[0];
  const rawProductKeys = stored.productKeys ?? initialAppState.productKeys;
  const productKeys = rawProductKeys.reduce<DemoAppState["productKeys"]>((accumulator, productKey) => {
    const safeKey = productKey.key.trim().length >= 30 ? productKey.key : generateProductKeyCode(accumulator);

    accumulator.push({
      ...productKey,
      key: safeKey,
      createdAt: productKey.createdAt ?? productKey.activatedAt ?? new Date().toISOString()
    });

    return accumulator;
  }, []);

  const normalized = {
    ...initialAppState,
    ...stored,
    brand: {
      ...initialAppState.brand,
      ...(stored.brand ?? {}),
      receiptImprintEnabled: stored.brand?.receiptImprintEnabled ?? initialAppState.brand.receiptImprintEnabled,
      receiptImprintText: stored.brand?.receiptImprintText ?? initialAppState.brand.receiptImprintText,
      loginQuotes: stored.brand?.loginQuotes ?? initialAppState.brand.loginQuotes,
      loginAdEnabled: stored.brand?.loginAdEnabled ?? initialAppState.brand.loginAdEnabled,
      loginAdTitle: stored.brand?.loginAdTitle ?? initialAppState.brand.loginAdTitle,
      loginAdMessage: stored.brand?.loginAdMessage ?? initialAppState.brand.loginAdMessage,
      loginAdImageUrl: stored.brand?.loginAdImageUrl ?? initialAppState.brand.loginAdImageUrl,
      loginAdCtaLabel: stored.brand?.loginAdCtaLabel ?? initialAppState.brand.loginAdCtaLabel,
      loginAdCtaUrl: stored.brand?.loginAdCtaUrl ?? initialAppState.brand.loginAdCtaUrl
    },
    users: normalizeDemoUsers(stored.users ?? initialAppState.users, ownerSeed, ownerBootstrap),
    shops: (stored.shops ?? initialAppState.shops).map((shop) => {
      const license = (stored.licenses ?? initialAppState.licenses).find((entry) => entry.shopId === shop.id);

      return {
        ...shop,
        licenseStatus: getEffectiveLicenseStatus(license)
      };
    }),
    licenses: (stored.licenses ?? initialAppState.licenses).map((license) => ({
      ...license,
      autoLockDaysAfterExpiry: license.autoLockDaysAfterExpiry ?? 7
    })),
    productKeys,
    products: normalizeStoredProducts(stored.products ?? initialAppState.products),
    inventoryAdjustments: stored.inventoryAdjustments ?? [],
    inventoryBatches: stored.inventoryBatches ?? initialAppState.inventoryBatches ?? [],
    suppliers: (stored.suppliers ?? initialAppState.suppliers ?? []).map((supplier) => ({
      ...supplier,
      accountBalance: Number.isFinite(supplier.accountBalance) ? supplier.accountBalance ?? 0 : 0,
      defaultPaymentMethod: supplier.defaultPaymentMethod ?? "credit"
    })),
    purchaseOrders: (stored.purchaseOrders ?? []).map((order) => ({
      ...order,
      status: order.status ?? "draft",
      totalAmount: order.totalAmount ?? 0,
      paidAmount: order.paidAmount ?? 0,
      paymentStatus: order.paymentStatus ?? "unpaid",
      paymentMethod: order.paymentMethod ?? "credit"
    })),
    purchaseOrderItems: (stored.purchaseOrderItems ?? []).map((item) => ({
      ...item,
      initialCostPrice: item.initialCostPrice ?? item.costPrice,
      receivedQuantity: item.receivedQuantity ?? 0,
      expiryDate: item.expiryDate?.trim() || undefined
    })),
    businessDays: stored.businessDays ?? [],
    shifts: stored.shifts ?? [],
    dayCloses: stored.dayCloses ?? [],
    cashMovements: stored.cashMovements ?? [],
    expenseCategories: stored.expenseCategories ?? initialAppState.expenseCategories ?? [],
    expenses: stored.expenses ?? [],
    customerAccountPayments: (stored.customerAccountPayments ?? []).map((payment, index) => ({
      ...payment,
      number: payment.number ?? `PAY-${String(index + 1).padStart(6, "0")}`,
      allocations: payment.allocations ?? []
    })),
    bills: (stored.bills ?? []).map((bill) => ({
      ...bill,
      itemDiscountAmount: bill.itemDiscountAmount ?? 0
    })),
    billItems: (stored.billItems ?? []).map((item) => ({
      ...item,
      discountType: item.discountType ?? "fixed",
      discountValue: item.discountValue ?? 0,
      discountAmount: item.discountAmount ?? 0,
      grossLineTotal: item.grossLineTotal ?? Math.round(item.unitPrice * item.quantity * 100) / 100,
      lineTotal: item.lineTotal ?? Math.round(item.unitPrice * item.quantity * 100) / 100
    })),
    payments: stored.payments ?? [],
    ledgerEntries: stored.ledgerEntries ?? [],
    refunds: stored.refunds ?? [],
    refundItems: stored.refundItems ?? [],
    receiptSequencesByShop: resolveReceiptSequencesByShop(stored),
    accountPaymentSequencesByShop: resolveAccountPaymentSequencesByShop(stored),
    settingsByShop: mergeSettingsByShop(stored.settingsByShop),
    dictionaryEntries: stored.dictionaryEntries ?? []
  } satisfies DemoAppState;

  return {
    ...normalized,
    ledgerEntries:
      normalized.ledgerEntries.length > 0
        ? normalized.ledgerEntries
        : rebuildAccountingLedger(normalized)
  } satisfies DemoAppState;
}

function loadStoredState(ownerBootstrap: OwnerBootstrapAccount = DEFAULT_OWNER_BOOTSTRAP) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return normalizeStoredState(JSON.parse(raw) as DemoAppState, ownerBootstrap);
  } catch {
    return null;
  }
}

function mergeRowsById<TItem extends { id: string }>(localRows: TItem[], ownerRows: TItem[] = []) {
  const merged = new Map(localRows.map((row) => [row.id, row]));

  ownerRows.forEach((row) => {
    merged.set(row.id, {
      ...merged.get(row.id),
      ...row
    });
  });

  return [
    ...ownerRows.map((row) => merged.get(row.id)).filter(Boolean),
    ...localRows.filter((row) => !ownerRows.some((ownerRow) => ownerRow.id === row.id))
  ] as TItem[];
}

function mergeOwnerPortalState(current: DemoAppState, ownerSnapshot?: Partial<DemoAppState> | null) {
  if (!ownerSnapshot) {
    return current;
  }

  return {
    ...current,
    brand: {
      ...current.brand,
      ...(ownerSnapshot.brand ?? {})
    },
    shops: mergeRowsById(current.shops, ownerSnapshot.shops ?? []),
    licenses: mergeRowsById(current.licenses, ownerSnapshot.licenses ?? []),
    productKeys: mergeRowsById(current.productKeys, ownerSnapshot.productKeys ?? []),
    categories: mergeRowsById(current.categories, ownerSnapshot.categories ?? []),
    expenseCategories: mergeRowsById(current.expenseCategories, ownerSnapshot.expenseCategories ?? []),
    settingsByShop: {
      ...current.settingsByShop,
      ...(ownerSnapshot.settingsByShop ?? {})
    },
    receiptSequencesByShop: {
      ...current.receiptSequencesByShop,
      ...(ownerSnapshot.receiptSequencesByShop ?? {})
    },
    accountPaymentSequencesByShop: {
      ...current.accountPaymentSequencesByShop,
      ...(ownerSnapshot.accountPaymentSequencesByShop ?? {})
    },
    announcements: mergeRowsById(current.announcements, ownerSnapshot.announcements ?? [])
  } satisfies DemoAppState;
}

function persistLocalOwnerStateSnapshot(state: DemoAppState) {
  if (typeof window === "undefined") {
    return;
  }

  void fetch("/api/local-owner-state", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ state })
  }).catch(() => undefined);

  syncOwnerStateToCloud(state);
}

function buildOwnerCloudSyncState(state: DemoAppState) {
  return {
    categories: state.categories,
    licenses: state.licenses,
    productKeys: state.productKeys,
    settingsByShop: state.settingsByShop,
    shops: state.shops,
    users: state.users
      .filter((user) => user.role === "super_admin")
      .map((user) => ({
        email: user.email,
        isActive: user.isActive,
        role: user.role
      }))
  };
}

function syncOwnerStateToCloud(state: DemoAppState) {
  if (typeof window === "undefined") {
    return;
  }

  const ownerEmail = state.users.find((user) => user.role === "super_admin" && user.isActive)?.email;

  if (!ownerEmail) {
    return;
  }

  void fetch("/api/owner/sync-state", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-owner-email": ownerEmail
    },
    body: JSON.stringify({
      state: buildOwnerCloudSyncState(state)
    })
  }).catch(() => undefined);
}

function deleteOwnerProductKeyFromCloud(productKey: string, ownerEmail?: string) {
  if (typeof window === "undefined" || !ownerEmail) {
    return;
  }

  void fetch("/api/owner/delete-product-key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-owner-email": ownerEmail
    },
    body: JSON.stringify({ productKey })
  }).catch(() => undefined);
}

function mergeCloudActivationStatePatch(current: DemoAppState, patch: CloudActivationStatePatch) {
  return {
    ...current,
    shops: mergeRowsById(current.shops, patch.shops ?? []),
    licenses: mergeRowsById(current.licenses, patch.licenses ?? []),
    productKeys: mergeRowsById(current.productKeys, patch.productKeys ?? []),
    deviceActivations: mergeRowsById(current.deviceActivations, patch.deviceActivations ?? []),
    users: mergeRowsById(current.users, patch.users ?? []),
    categories: mergeRowsById(current.categories, patch.categories ?? []),
    settingsByShop: {
      ...current.settingsByShop,
      ...(patch.settingsByShop ?? {})
    }
  } satisfies DemoAppState;
}

export function AppProvider({
  children,
  ownerBootstrap = DEFAULT_OWNER_BOOTSTRAP
}: {
  children: React.ReactNode;
  ownerBootstrap?: OwnerBootstrapAccount;
}) {
  const [state, setState] = useState<DemoAppState>(() => normalizeStoredState(initialAppState, ownerBootstrap));
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    const loadState = async () => {
      const localState = loadStoredState(ownerBootstrap);

      try {
        const response = await fetch(SHARED_STATE_ENDPOINT, { cache: "no-store" });
        const payload = (await response.json()) as { state?: DemoAppState | null };
        const sharedState = payload.state ? normalizeStoredState(payload.state, ownerBootstrap) : null;

        if (!active) {
          return;
        }

        if (sharedState) {
          setState({
            ...sharedState,
            session: localState?.session ?? null
          });
        } else if (localState) {
          setState(localState);
        }
      } catch {
        if (active && localState) {
          setState(localState);
        }
      } finally {
        if (active) {
          setIsHydrated(true);
        }
      }
    };

    void loadState();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    void fetch(SHARED_STATE_ENDPOINT, {
      body: JSON.stringify({
        state: {
          ...state,
          session: null
        }
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    }).catch(() => undefined);
  }, [isHydrated, state]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    setState((current) => {
      const now = new Date();
      let changed = false;
      const nextLicenses = current.licenses.map((license) => {
        const effectiveStatus = getEffectiveLicenseStatus(license, now);

        if (effectiveStatus === license.status) {
          return license;
        }

        changed = true;

        return {
          ...license,
          status: effectiveStatus,
          lockedAt: effectiveStatus === "locked" ? now.toISOString() : license.lockedAt,
          lockReason:
            effectiveStatus === "locked"
              ? license.lockReason ?? "Automatically locked after license expiry."
              : license.lockReason
        };
      });
      const nextProductKeys = current.productKeys.map((productKey) => {
        if (
          productKey.status !== "active" ||
          !productKey.expiresAt ||
          new Date(productKey.expiresAt).getTime() >= now.getTime()
        ) {
          return productKey;
        }

        changed = true;

        return {
          ...productKey,
          status: "expired" as const
        };
      });

      if (!changed) {
        return current;
      }

      return {
        ...current,
        licenses: nextLicenses,
        productKeys: nextProductKeys,
        shops: current.shops.map((shop) => {
          const license = nextLicenses.find((entry) => entry.shopId === shop.id);

          return license
            ? {
                ...shop,
                licenseStatus: license.status
              }
            : shop;
        })
      };
    });
  }, [isHydrated]);

  const session = state.session;

  useEffect(() => {
    if (!isHydrated || session?.workspace !== "owner" || session.role !== "super_admin") {
      return;
    }

    const timer = window.setTimeout(() => syncOwnerStateToCloud(state), 700);

    return () => window.clearTimeout(timer);
  }, [
    isHydrated,
    session?.role,
    session?.workspace,
    state.categories,
    state.licenses,
    state.productKeys,
    state.settingsByShop,
    state.shops
  ]);

  const currentShopId = session?.shopId ?? state.shops[0]?.id ?? null;
  const currentShop = state.shops.find((shop) => shop.id === currentShopId) ?? null;
  const currentLicense = state.licenses.find((license) => license.shopId === currentShopId) ?? null;
  const currentSettings = currentShopId ? state.settingsByShop[currentShopId] ?? null : null;
  const currentUsers = state.users.filter((user) => user.shopId === currentShopId);
  const currentBusinessDay = getActiveBusinessDay(state.businessDays, currentShopId);
  const currentShift = getActiveShift(state.shifts, currentShopId, session?.id ?? null);

  useEffect(() => {
    if (!isHydrated || session?.workspace !== "shop" || !session.shopId || session.role === "support") {
      return;
    }

    if (getShopAccessBlock(state, session.shopId) || !hasActivatedDeviceAccess(state, session.shopId)) {
      setState((current) => ({
        ...current,
        session: null
      }));
    }
  }, [isHydrated, session?.role, session?.shopId, session?.workspace, state]);

  useEffect(() => {
    if (!session?.supportSessionId) {
      return;
    }

    const supportSession = state.supportSessions.find((entry) => entry.id === session.supportSessionId);

    if (!supportSession || supportSession.endedAt) {
      return;
    }

    const timeoutMs = new Date(supportSession.endsAt).getTime() - Date.now();
    const finishSupportSession = () => {
      setState((current) => {
        const activeSupportSession = current.supportSessions.find((entry) => entry.id === session.supportSessionId);
        const owner = activeSupportSession
          ? current.users.find((user) => user.id === activeSupportSession.startedBy && user.role === "super_admin")
          : null;
        const endedAt = new Date().toISOString();

        return {
          ...current,
          session: owner
            ? {
                id: owner.id,
                name: owner.name,
                email: owner.email,
                role: owner.role,
                workspace: "owner"
              }
            : null,
          supportSessions: current.supportSessions.map((entry) =>
            entry.id === session.supportSessionId
              ? {
                  ...entry,
                  endedAt
                }
              : entry
          ),
          auditLogs: activeSupportSession
            ? [
                {
                  id: createId("audit"),
                  shopId: activeSupportSession.shopId,
                  actorId: activeSupportSession.startedBy,
                  action: "support_session.expire",
                  targetId: activeSupportSession.id,
                  detail: "Support session expired automatically.",
                  createdAt: endedAt
                },
                ...current.auditLogs
              ]
            : current.auditLogs
        };
      });
    };

    if (timeoutMs <= 0) {
      finishSupportSession();
      return;
    }

    const timer = window.setTimeout(finishSupportSession, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [session?.supportSessionId, state.supportSessions]);

  const dictionaryOverrides = state.dictionaryEntries.reduce<Partial<Record<TranslationKey, string>>>(
    (accumulator, entry) => {
      if (entry.locale === state.ui.locale && entry.value.trim()) {
        accumulator[entry.key as TranslationKey] = entry.value;
      }

      return accumulator;
    },
    {}
  );

  const value = useMemo<AppContextValue>(
    () => ({
      isHydrated,
      state,
      session,
      currentShopId,
      currentShop,
      currentLicense,
      currentSettings,
      currentUsers,
      currentBusinessDay,
      currentShift,
      locale: state.ui.locale,
      direction: state.ui.direction,
      t: (key, values) => resolveTranslation(state.ui.locale, key, dictionaryOverrides, values),
      setLocale: (locale) => {
        setState((current) => ({
          ...current,
          ui: {
            locale,
            direction: localeMeta[locale].direction
          }
        }));
      },
      login: ({ email, password, workspace }) => {
        const account = state.users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase());

        if (!account || account.passwordHash !== hashSecret(password)) {
          return { ok: false, message: resolveTranslation(state.ui.locale, "login.error", dictionaryOverrides) };
        }

        if (!account.isActive) {
          return { ok: false, message: "This user is inactive. Ask the shop admin to reactivate access." };
        }

        if (workspace === "owner" && account.role !== "super_admin") {
          return { ok: false, message: resolveTranslation(state.ui.locale, "login.error", dictionaryOverrides) };
        }

        if (workspace === "shop" && !account.shopId) {
          return { ok: false, message: resolveTranslation(state.ui.locale, "login.error", dictionaryOverrides) };
        }

        if (workspace === "shop" && account.shopId) {
          const accessBlock = getShopAccessBlock(state, account.shopId);

          if (accessBlock) {
            return { ok: false, message: accessBlock };
          }

          if (!hasActivatedDeviceAccess(state, account.shopId)) {
            return {
              ok: false,
              message: "Activate this shop product key on this device before signing in."
            };
          }
        }

        const lastLoginAt = new Date().toISOString();

        setState((current) => ({
          ...current,
          session: {
            id: account.id,
            shopId: account.shopId,
            name: account.name,
            email: account.email,
            role: account.role,
            workspace
          },
          users: current.users.map((user) =>
            user.id === account.id
              ? {
                  ...user,
                  lastLoginAt
                }
              : user
          )
        }));

        return { ok: true, workspace };
      },
      completeCloudLogin: ({ user, workspace }) => {
        if (!user.isActive) {
          return { ok: false, message: "This user is inactive. Ask the shop admin to reactivate access." };
        }

        if (workspace === "owner" && user.role !== "super_admin") {
          return { ok: false, message: resolveTranslation(state.ui.locale, "login.error", dictionaryOverrides) };
        }

        if (workspace === "shop" && !user.shopId) {
          return { ok: false, message: resolveTranslation(state.ui.locale, "login.error", dictionaryOverrides) };
        }

        if (workspace === "shop" && user.shopId) {
          const accessBlock = getShopAccessBlock(state, user.shopId);

          if (accessBlock) {
            return { ok: false, message: accessBlock };
          }

          if (!hasActivatedDeviceAccess(state, user.shopId)) {
            return {
              ok: false,
              message: "Activate this shop product key on this device before signing in."
            };
          }
        }

        const lastLoginAt = new Date().toISOString();

        setState((current) => {
          const existingUser = current.users.find(
            (entry) => entry.id === user.id || entry.email.trim().toLowerCase() === user.email.trim().toLowerCase()
          );
          const sessionUser = {
            ...existingUser,
            ...user,
            passwordHash: existingUser?.passwordHash ?? user.passwordHash,
            lastLoginAt
          };
          const users = existingUser
            ? current.users.map((entry) => (entry.id === existingUser.id ? sessionUser : entry))
            : [sessionUser, ...current.users];

          return {
            ...current,
            session: {
              id: sessionUser.id,
              shopId: sessionUser.shopId,
              name: sessionUser.name,
              email: sessionUser.email,
              role: sessionUser.role,
              workspace
            },
            users
          };
        });

        return { ok: true, workspace };
      },
      logout: () => {
        setState((current) => ({
          ...current,
          session: null
        }));
      },
      logoutStoreDevice: ({ shopId, browserInfo, adminPassword }) => {
        const normalizedPassword = adminPassword.trim();
        const normalizedBrowserInfo = browserInfo.trim() || getCurrentBrowserInfo();

        if (!shopId || !normalizedPassword) {
          return { ok: false, message: "Admin password is required to log out this store from this device." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to log out this store from this device."
        };

        setState((current) => {
          const shop = current.shops.find((entry) => entry.id === shopId);

          if (!shop) {
            result = { ok: false, message: "Store not found." };
            return current;
          }

          const admin = current.users.find(
            (user) =>
              user.shopId === shopId &&
              user.role === "shop_admin" &&
              user.isActive &&
              user.passwordHash === hashSecret(normalizedPassword)
          );

          if (!admin) {
            result = { ok: false, message: "Admin password is incorrect." };
            return current;
          }

          const productKeyIds = new Set(current.productKeys.filter((productKey) => productKey.shopId === shopId).map((productKey) => productKey.id));
          const removedActivations = current.deviceActivations.filter(
            (activation) =>
              activation.shopId === shopId &&
              activation.browserInfo === normalizedBrowserInfo &&
              productKeyIds.has(activation.productKeyId)
          );

          if (removedActivations.length === 0) {
            result = { ok: false, message: "This device is not currently activated for that store." };
            return current;
          }

          const createdAt = new Date().toISOString();
          result = { ok: true, message: "Store logged out from this device. Activation is required before the next sign-in." };

          return {
            ...current,
            session: current.session?.shopId === shopId ? null : current.session,
            deviceActivations: current.deviceActivations.filter(
              (activation) =>
                !(
                  activation.shopId === shopId &&
                  activation.browserInfo === normalizedBrowserInfo &&
                  productKeyIds.has(activation.productKeyId)
                )
            ),
            auditLogs: [
              {
                id: createId("audit"),
                shopId,
                actorId: admin.id,
                action: "shop.device.logout",
                targetId: removedActivations[0]?.id,
                detail: `Store ${shop.name} was logged out from this browser after admin confirmation.`,
                createdAt
              },
              ...current.auditLogs
            ]
          };
        });

        return result;
      },
      setBrandProfile: (payload) => {
        setState((current) => {
          const nextState = {
            ...current,
            brand: {
              ...current.brand,
              ...payload
            }
          };

          persistLocalOwnerStateSnapshot(nextState);

          return nextState;
        });
      },
      registerInstalledShop: (payload) => {
        const normalizedSetupEmail = payload.setupEmail?.trim().toLowerCase() ?? "";
        const normalizedSetupPassword = payload.setupPassword?.trim() ?? "";
        const normalizedShopName = payload.shopName.trim();
        const normalizedAdminName = payload.adminName.trim();
        const normalizedAdminEmail = payload.adminEmail.trim().toLowerCase();
        const normalizedAdminPassword = payload.adminPassword.trim();
        const wantsCashier = Boolean(payload.createCashier);
        const normalizedCashierName = payload.cashierName?.trim() ?? "";
        const normalizedCashierEmail = payload.cashierEmail?.trim().toLowerCase() ?? "";
        const normalizedCashierPassword = payload.cashierPassword?.trim() ?? "";

        if (!normalizedShopName || !normalizedAdminName || !normalizedAdminEmail || !normalizedAdminPassword) {
          return {
            ok: false,
            message: "Shop name, admin name, admin email, and admin password are required."
          };
        }

        const adminPasswordError = validatePasswordLength(normalizedAdminPassword, "Admin password");

        if (adminPasswordError) {
          return {
            ok: false,
            message: adminPasswordError
          };
        }

        if (wantsCashier && (!normalizedCashierName || !normalizedCashierEmail || !normalizedCashierPassword)) {
          return {
            ok: false,
            message: "Cashier name, email, and password are required when creating the cashier account."
          };
        }

        const cashierPasswordError = wantsCashier
          ? validatePasswordLength(normalizedCashierPassword, "Cashier password")
          : null;

        if (cashierPasswordError) {
          return {
            ok: false,
            message: cashierPasswordError
          };
        }

        if (wantsCashier && normalizedAdminEmail === normalizedCashierEmail) {
          return {
            ok: false,
            message: "Admin and cashier must use different emails."
          };
        }

        const taxRate = Number.isFinite(payload.taxRate) ? Math.max(0, payload.taxRate) : 0;
        let result: { ok: boolean; message?: string; productKey?: string; shopId?: string } = {
          ok: false,
          message: "Unable to register this POS."
        };

        setState((current) => {
          const working = mergeOwnerPortalState(current, payload.ownerSnapshot);
          const requestedProductKey = payload.productKey?.trim() ?? "";

          if (!requestedProductKey) {
            result = {
              ok: false,
              message: "Activation key is required. Create the shop from the owner portal first."
            };
            return current;
          }

          if (
            working.users.some(
              (user) =>
                user.email.trim().toLowerCase() === normalizedAdminEmail ||
                (wantsCashier && user.email.trim().toLowerCase() === normalizedCashierEmail)
            )
          ) {
            result = {
              ok: false,
              message: "Another user already uses this email."
            };
            return current;
          }

          if (requestedProductKey.length < 30) {
            result = {
              ok: false,
              message: "Product key must be at least 30 characters."
            };
            return current;
          }

          const existingProductKey = working.productKeys.find((entry) => entry.key.trim() === requestedProductKey);

          if (!existingProductKey) {
            result = {
              ok: false,
              message: "Product key not found. Ask the POS owner to create the shop and send you a valid activation key."
            };
            return current;
          }

          const createdAt = new Date().toISOString();
          const existingShop = existingProductKey
            ? working.shops.find((shop) => shop.id === existingProductKey.shopId)
            : undefined;
          const existingLicense = existingProductKey
            ? working.licenses.find((license) => license.shopId === existingProductKey.shopId)
            : undefined;
          const effectiveLicenseStatus = existingProductKey
            ? getEffectiveLicenseStatus(existingLicense, new Date(createdAt))
            : "trial";

          if (existingProductKey) {
            if (!existingShop) {
              result = { ok: false, message: "The shop for this activation key was not found." };
              return current;
            }

            const hasStoredSetupCredentials = Boolean(existingShop.setupEmail || existingShop.setupPasswordHash);

            if (hasStoredSetupCredentials) {
              if (!normalizedSetupEmail || !normalizedSetupPassword) {
                result = {
                  ok: false,
                  message: "Store setup email and password are required."
                };
                return current;
              }

              const setupPasswordError = validatePasswordLength(normalizedSetupPassword, "Store setup password");

              if (setupPasswordError) {
                result = {
                  ok: false,
                  message: setupPasswordError
                };
                return current;
              }

              if (
                existingShop.setupEmail?.trim().toLowerCase() !== normalizedSetupEmail ||
                existingShop.setupPasswordHash !== hashSecret(normalizedSetupPassword)
              ) {
                result = {
                  ok: false,
                  message: "Store setup email or password does not match the owner-created shop."
                };
                return current;
              }
            }

            if (["revoked", "locked", "expired"].includes(existingProductKey.status)) {
              result = {
                ok: false,
                message:
                  existingProductKey.status === "locked"
                    ? "This product key is locked. Please contact support."
                    : `This product key is ${existingProductKey.status}.`
              };
              return current;
            }

            if (existingProductKey.expiresAt && new Date(existingProductKey.expiresAt).getTime() < Date.now()) {
              result = { ok: false, message: "This product key has expired." };
              return {
                ...working,
                productKeys: working.productKeys.map((entry) =>
                  entry.id === existingProductKey.id ? { ...entry, status: "expired" as const } : entry
                )
              };
            }

            if (effectiveLicenseStatus === "locked") {
              result = { ok: false, message: "Your POS is temporarily locked. Please contact support." };
              return current;
            }

            if (effectiveLicenseStatus === "expired") {
              result = { ok: false, message: "Your POS license has expired. Please contact support." };
              return current;
            }

            if (working.users.some((user) => user.shopId === existingProductKey.shopId && user.role === "shop_admin")) {
              result = {
                ok: false,
                message: "This shop already has an admin account. Use login, or ask the POS owner to reset access."
              };
              return current;
            }
          }

          const expiresAt =
            existingProductKey?.expiresAt ??
            existingLicense?.expiresAt ??
            new Date(Date.now() + 14 * 86_400_000).toISOString();
          const shopId = existingProductKey?.shopId ?? createId("shop");
          const adminUserId = payload.adminUserId ?? createId("user");
          const productKeyId = existingProductKey?.id ?? createId("pk");
          const productKey = existingProductKey?.key ?? generateProductKeyCode(working.productKeys);
          const categoryId = createId("cat");
          const expenseCategoryId = createId("expense_cat");
          const slug = existingShop?.slug ?? `${slugify(normalizedShopName)}-${shopId.slice(-4)}`;
          const browserInfo = getCurrentBrowserInfo();
          const existingActivation = working.deviceActivations.find(
            (activation) => activation.productKeyId === productKeyId && activation.browserInfo === browserInfo
          );
          const activeDeviceCount = working.deviceActivations.filter(
            (activation) => activation.productKeyId === productKeyId
          ).length;

          if (existingProductKey && !existingActivation && activeDeviceCount >= existingProductKey.allowedDevices) {
            result = { ok: false, message: "This product key has reached its allowed device limit." };
            return current;
          }

          const nextLicenseStatus: LicenseStatus =
            existingLicense?.status === "active" || effectiveLicenseStatus === "active" ? "active" : "trial";
          const cashierUsers =
            wantsCashier
              ? [
                  {
                    id: createId("user"),
                    shopId,
                    name: normalizedCashierName,
                    email: normalizedCashierEmail,
                    role: "cashier" as const,
                    isActive: true,
                    passwordHash: hashSecret(normalizedCashierPassword),
                    createdAt
                  }
                ]
              : [];
          const adminUser = {
            id: adminUserId,
            shopId,
            name: normalizedAdminName,
            email: normalizedAdminEmail,
            phone: payload.adminPhone?.trim() || undefined,
            role: "shop_admin" as const,
            isActive: true,
            passwordHash: hashSecret(normalizedAdminPassword),
            createdAt,
            lastLoginAt: createdAt
          };

          result = {
            ok: true,
            productKey,
            shopId
          };

          return {
            ...working,
            session: {
              id: adminUserId,
              shopId,
              name: normalizedAdminName,
              email: normalizedAdminEmail,
              role: "shop_admin",
              workspace: "shop"
            },
            shops: existingShop
              ? working.shops.map((shop) =>
                  shop.id === shopId
                    ? {
                        ...shop,
                        name: normalizedShopName,
                        setupCompletedAt: createdAt,
                        phone: payload.phone.trim(),
                        email: payload.email?.trim() || shop.email,
                        website: payload.website?.trim() || shop.website,
                        address: payload.address.trim(),
                        currency: payload.currency.trim() || shop.currency,
                        licenseStatus: nextLicenseStatus
                      }
                    : shop
                )
              : [
                  {
                    id: shopId,
                    name: normalizedShopName,
                    slug,
                    phone: payload.phone.trim(),
                    email: payload.email?.trim() || undefined,
                    website: payload.website?.trim() || undefined,
                    address: payload.address.trim(),
                    currency: payload.currency.trim() || "SAR",
                    timezone: "Asia/Riyadh",
                    planName: "Starter trial",
                    licenseStatus: nextLicenseStatus,
                    createdAt
                  },
                  ...working.shops
                ],
            licenses: existingLicense
              ? working.licenses.map((license) =>
                  license.id === existingLicense.id
                    ? {
                        ...license,
                        status: nextLicenseStatus,
                        expiresAt,
                        lastPaymentAt: nextLicenseStatus === "active" ? license.lastPaymentAt ?? createdAt : license.lastPaymentAt
                      }
                    : license
                )
              : [
                  {
                    id: createId("lic"),
                    shopId,
                    status: nextLicenseStatus,
                    expiresAt,
                    autoLockDaysAfterExpiry: 3,
                    lastPaymentAt: nextLicenseStatus === "active" ? createdAt : undefined
                  },
                  ...working.licenses
                ],
            productKeys: existingProductKey
              ? working.productKeys.map((entry) =>
                  entry.id === productKeyId
                    ? {
                        ...entry,
                        status: "active" as const,
                        activatedAt: entry.activatedAt ?? createdAt,
                        expiresAt: entry.expiresAt ?? expiresAt
                      }
                    : entry
                )
              : [
                  {
                    id: productKeyId,
                    key: productKey,
                    status: "active" as const,
                    shopId,
                    allowedDevices: 2,
                    createdAt,
                    activatedAt: createdAt,
                    expiresAt
                  },
                  ...working.productKeys
                ],
            deviceActivations: existingActivation
              ? working.deviceActivations.map((activation) =>
                  activation.id === existingActivation.id
                    ? {
                        ...activation,
                        lastSeenAt: createdAt
                      }
                    : activation
                )
              : [
                  {
                    id: createId("device"),
                    shopId,
                    productKeyId,
                    browserInfo,
                    activatedAt: createdAt,
                    lastSeenAt: createdAt
                  },
                  ...working.deviceActivations
                ],
            users: [adminUser, ...cashierUsers, ...working.users],
            categories: working.categories.some((category) => category.shopId === shopId)
              ? working.categories
              : [
                  {
                    id: categoryId,
                    shopId,
                    name: "General",
                    description: "Default category for products and services.",
                    createdAt
                  },
                  ...working.categories
                ],
            expenseCategories: working.expenseCategories.some((category) => category.shopId === shopId)
              ? working.expenseCategories
              : [
                  {
                    id: expenseCategoryId,
                    shopId,
                    name: "General expenses",
                    createdAt
                  },
                  ...working.expenseCategories
                ],
            receiptSequencesByShop: {
              ...working.receiptSequencesByShop,
              [shopId]: working.receiptSequencesByShop[shopId] ?? 1
            },
            accountPaymentSequencesByShop: {
              ...working.accountPaymentSequencesByShop,
              [shopId]: working.accountPaymentSequencesByShop[shopId] ?? 1
            },
            settingsByShop: {
              ...working.settingsByShop,
              [shopId]: {
                pos: {
                  shopName: normalizedShopName,
                  logoUrl: payload.logoUrl?.trim() || working.settingsByShop[shopId]?.pos.logoUrl,
                  address: payload.address.trim(),
                  phone: payload.phone.trim(),
                  email: payload.email?.trim() || undefined,
                  website: payload.website?.trim() || undefined,
                  currency: payload.currency.trim() || "SAR",
                  vatNumber: payload.vatNumber?.trim() || undefined,
                  receiptQrUrl: payload.receiptQrUrl?.trim() || undefined
                },
                printer: {
                  receiptSize: "80mm" as const,
                  autoPrintAfterSale: false
                },
                receipt: {
                  footerText: payload.receiptFooterText.trim() || `Thank you for visiting ${normalizedShopName}.`,
                  showTax: true,
                  showCustomer: true,
                  showCashier: true,
                  receiptSize: "80mm" as const
                },
                tax: {
                  enabled: payload.taxEnabled,
                  name: payload.taxName.trim() || "VAT",
                  rate: Math.round(taxRate * 1000) / 1000,
                  mode: payload.taxMode,
                  showOnReceipt: true
                }
              }
            },
            auditLogs: [
              {
                id: createId("audit"),
                shopId,
                actorId: adminUserId,
                action: "shop.install.register",
                targetId: shopId,
                detail: `Registered installed POS for ${normalizedShopName}.`,
                createdAt
              },
              ...working.auditLogs
            ]
          };
        });

        return result;
      },
      ownerCreateShop: ({
        shopName,
        phone,
        email,
        setupEmail,
        setupPassword,
        address,
        planName,
        licenseStatus,
        expiresAt,
        allowedDevices,
        autoLockDaysAfterExpiry
      }) => {
        if (!session || session.role !== "super_admin") {
          return { ok: false, message: "Only the POS owner can create shops." };
        }

        const normalizedShopName = shopName.trim();
        const normalizedSetupEmail = setupEmail.trim().toLowerCase();
        const normalizedSetupPassword = setupPassword.trim();

        if (!normalizedShopName || !normalizedSetupEmail || !normalizedSetupPassword) {
          return { ok: false, message: "Shop name, setup email, and setup password are required." };
        }

        const setupPasswordError = validatePasswordLength(normalizedSetupPassword, "Setup password");

        if (setupPasswordError) {
          return { ok: false, message: setupPasswordError };
        }

        if (allowedDevices < 1) {
          return { ok: false, message: "Allowed devices must be at least 1." };
        }

        let result: { ok: boolean; message?: string; shopId?: string; productKey?: string } = {
          ok: false,
          message: "Unable to create shop."
        };

        setState((current) => {
          if (
            current.shops.some(
              (shop) => shop.setupEmail?.trim().toLowerCase() === normalizedSetupEmail || shop.email?.trim().toLowerCase() === normalizedSetupEmail
            )
          ) {
            result = { ok: false, message: "Another shop already uses this setup email." };
            return current;
          }

          const createdAt = new Date().toISOString();
          const shopId = createId("shop");
          const licenseId = createId("lic");
          const productKeyId = createId("pk");
          const categoryId = createId("cat");
          const expenseCategoryId = createId("expense_cat");
          const slug = `${slugify(normalizedShopName)}-${shopId.slice(-4)}`;
          const productKey = generateProductKeyCode(current.productKeys);
          const normalizedExpiry = toDateTime(expiresAt);
          const license = {
            id: licenseId,
            shopId,
            status: licenseStatus,
            expiresAt: normalizedExpiry,
            autoLockDaysAfterExpiry: Math.max(0, Math.round(autoLockDaysAfterExpiry)),
            lastPaymentAt: licenseStatus === "active" ? createdAt : undefined,
            lockedAt: licenseStatus === "locked" ? createdAt : undefined,
            lockReason: licenseStatus === "locked" ? "Created as locked by owner." : undefined
          };
          const shop: Shop = {
            id: shopId,
            name: normalizedShopName,
            slug,
            setupEmail: normalizedSetupEmail,
            setupPasswordHash: hashSecret(normalizedSetupPassword),
            phone: phone?.trim() || "",
            email: email?.trim() || undefined,
            address: address?.trim() || "",
            currency: "SAR",
            timezone: "Asia/Riyadh",
            planName: planName.trim() || "Starter",
            licenseStatus,
            createdAt
          };

          result = {
            ok: true,
            shopId,
            productKey
          };

          const nextState = {
            ...current,
            shops: [shop, ...current.shops],
            licenses: [license, ...current.licenses],
            productKeys: [
              {
                id: productKeyId,
                key: productKey,
                status: "unused" as const,
                shopId,
                allowedDevices: Math.max(1, Math.round(allowedDevices)),
                createdAt,
                expiresAt: normalizedExpiry
              },
              ...current.productKeys
            ],
            categories: [
              {
                id: categoryId,
                shopId,
                name: "General",
                description: "Default category for this shop.",
                createdAt
              },
              ...current.categories
            ],
            expenseCategories: [
              {
                id: expenseCategoryId,
                shopId,
                name: "General expenses",
                createdAt
              },
              ...current.expenseCategories
            ],
            receiptSequencesByShop: {
              ...current.receiptSequencesByShop,
              [shopId]: 1
            },
            accountPaymentSequencesByShop: {
              ...current.accountPaymentSequencesByShop,
              [shopId]: 1
            },
            settingsByShop: {
              ...current.settingsByShop,
              [shopId]: {
                pos: {
                  shopName: normalizedShopName,
                  address: address?.trim() || "",
                  phone: phone?.trim() || "",
                  email: email?.trim() || undefined,
                  currency: "SAR",
                  vatNumber: "",
                  receiptQrUrl: ""
                },
                printer: {
                  receiptSize: "80mm" as const,
                  autoPrintAfterSale: false
                },
                receipt: {
                  footerText: `Thank you for visiting ${normalizedShopName}.`,
                  showTax: true,
                  showCustomer: true,
                  showCashier: true,
                  receiptSize: "80mm" as const
                },
                tax: {
                  enabled: true,
                  name: "VAT",
                  rate: 15,
                  mode: "inclusive" as const,
                  showOnReceipt: true
                }
              }
            },
            auditLogs: [
              {
                id: createId("audit"),
                shopId,
                actorId: session.id,
                action: "owner.shop.create",
                targetId: shopId,
                detail: `Prepared shop ${normalizedShopName} with product key ${maskKey(productKey)}. Store admin will be created during installation.`,
                createdAt
              },
              ...current.auditLogs
            ]
          };

          persistLocalOwnerStateSnapshot(nextState);

          return nextState;
        });

        return result;
      },
      ownerDeleteShop: ({ shopId, confirmName }) => {
        if (!session || session.role !== "super_admin") {
          return { ok: false, message: "Only the POS owner can delete stores." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to delete store."
        };

        setState((current) => {
          const shop = current.shops.find((entry) => entry.id === shopId);

          if (!shop) {
            result = { ok: false, message: "Store not found." };
            return current;
          }

          if (confirmName.trim() !== shop.name) {
            result = { ok: false, message: "Type the exact store name before deleting." };
            return current;
          }

          const billIds = new Set(current.bills.filter((bill) => bill.shopId === shopId).map((bill) => bill.id));
          const refundIds = new Set(current.refunds.filter((refund) => refund.shopId === shopId).map((refund) => refund.id));
          const purchaseOrderIds = new Set(
            current.purchaseOrders.filter((purchaseOrder) => purchaseOrder.shopId === shopId).map((purchaseOrder) => purchaseOrder.id)
          );
          const customerIds = new Set(current.customers.filter((customer) => customer.shopId === shopId).map((customer) => customer.id));
          const { [shopId]: _removedReceiptSequence, ...receiptSequencesByShop } = current.receiptSequencesByShop;
          const { [shopId]: _removedPaymentSequence, ...accountPaymentSequencesByShop } = current.accountPaymentSequencesByShop;
          const { [shopId]: _removedSettings, ...settingsByShop } = current.settingsByShop;
          const deletedAt = new Date().toISOString();

          result = { ok: true, message: `${shop.name} and all local store data were deleted.` };

          const nextState = {
            ...current,
            session: current.session?.shopId === shopId ? null : current.session,
            shops: current.shops.filter((entry) => entry.id !== shopId),
            licenses: current.licenses.filter((entry) => entry.shopId !== shopId),
            productKeys: current.productKeys.filter((entry) => entry.shopId !== shopId),
            deviceActivations: current.deviceActivations.filter((entry) => entry.shopId !== shopId),
            users: current.users.filter((entry) => entry.shopId !== shopId),
            categories: current.categories.filter((entry) => entry.shopId !== shopId),
            products: current.products.filter((entry) => entry.shopId !== shopId),
            inventoryAdjustments: current.inventoryAdjustments.filter((entry) => entry.shopId !== shopId),
            inventoryBatches: current.inventoryBatches.filter((entry) => entry.shopId !== shopId),
            suppliers: current.suppliers.filter((entry) => entry.shopId !== shopId),
            purchaseOrders: current.purchaseOrders.filter((entry) => entry.shopId !== shopId),
            purchaseOrderItems: current.purchaseOrderItems.filter((entry) => !purchaseOrderIds.has(entry.purchaseOrderId)),
            deletedProducts: current.deletedProducts.filter((entry) => entry.shopId !== shopId),
            customers: current.customers.filter((entry) => entry.shopId !== shopId),
            customerAccountPayments: current.customerAccountPayments.filter((entry) => !customerIds.has(entry.customerId)),
            accountPaymentSequencesByShop,
            bills: current.bills.filter((entry) => entry.shopId !== shopId),
            billItems: current.billItems.filter((entry) => !billIds.has(entry.billId)),
            refunds: current.refunds.filter((entry) => entry.shopId !== shopId),
            refundItems: current.refundItems.filter((entry) => !refundIds.has(entry.refundId)),
            payments: current.payments.filter((entry) => !billIds.has(entry.billId)),
            ledgerEntries: current.ledgerEntries.filter((entry) => entry.shopId !== shopId),
            businessDays: current.businessDays.filter((entry) => entry.shopId !== shopId),
            shifts: current.shifts.filter((entry) => entry.shopId !== shopId),
            dayCloses: current.dayCloses.filter((entry) => entry.shopId !== shopId),
            cashMovements: current.cashMovements.filter((entry) => entry.shopId !== shopId),
            expenseCategories: current.expenseCategories.filter((entry) => entry.shopId !== shopId),
            expenses: current.expenses.filter((entry) => entry.shopId !== shopId),
            receiptSequencesByShop,
            settingsByShop,
            announcements: current.announcements.filter((entry) => entry.targetShopId !== shopId),
            supportTickets: current.supportTickets.filter((entry) => entry.shopId !== shopId),
            supportSessions: current.supportSessions.filter((entry) => entry.shopId !== shopId),
            auditLogs: [
              {
                id: createId("audit"),
                shopId,
                actorId: session.id,
                action: "owner.shop.delete",
                targetId: shopId,
                detail: `Deleted ${shop.name} and all local store data.`,
                createdAt: deletedAt
              },
              ...current.auditLogs.filter((entry) => entry.shopId !== shopId)
            ]
          };

          persistLocalOwnerStateSnapshot(nextState);

          return nextState;
        });

        return result;
      },
      ownerGenerateProductKey: ({ shopId, allowedDevices, expiresAt }) => {
        if (!session || session.role !== "super_admin") {
          return { ok: false, message: "Only the POS owner can generate product keys." };
        }

        if (allowedDevices < 1) {
          return { ok: false, message: "Allowed devices must be at least 1." };
        }

        let result: { ok: boolean; message?: string; productKey?: string } = {
          ok: false,
          message: "Unable to generate product key."
        };

        setState((current) => {
          const shop = current.shops.find((entry) => entry.id === shopId);

          if (!shop) {
            result = { ok: false, message: "Shop not found." };
            return current;
          }

          const createdAt = new Date().toISOString();
          const productKey = generateProductKeyCode(current.productKeys);

          result = { ok: true, productKey };

          const nextState = {
            ...current,
            productKeys: [
              {
                id: createId("pk"),
                key: productKey,
                status: "unused" as const,
                shopId,
                allowedDevices: Math.max(1, Math.round(allowedDevices)),
                createdAt,
                expiresAt: toDateTime(expiresAt)
              },
              ...current.productKeys
            ],
            auditLogs: [
              {
                id: createId("audit"),
                shopId,
                actorId: session.id,
                action: "owner.product_key.generate",
                targetId: shopId,
                detail: `Generated ${maskKey(productKey)} for ${shop.name}.`,
                createdAt
              },
              ...current.auditLogs
            ]
          };

          persistLocalOwnerStateSnapshot(nextState);

          return nextState;
        });

        return result;
      },
      ownerDeleteProductKey: ({ productKeyId }) => {
        if (!session || session.role !== "super_admin") {
          return { ok: false, message: "Only the POS owner can delete product keys." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to delete product key."
        };

        setState((current) => {
          const productKey = current.productKeys.find((entry) => entry.id === productKeyId);

          if (!productKey) {
            result = { ok: false, message: "Product key not found." };
            return current;
          }

          const shop = current.shops.find((entry) => entry.id === productKey.shopId);
          const deletedAt = new Date().toISOString();
          const ownerEmail = current.users.find((user) => user.role === "super_admin" && user.isActive)?.email;

          result = {
            ok: true,
            message: "Product key deleted."
          };

          deleteOwnerProductKeyFromCloud(productKey.key, ownerEmail);

          const nextState = {
            ...current,
            productKeys: current.productKeys.filter((entry) => entry.id !== productKeyId),
            deviceActivations: current.deviceActivations.filter((entry) => entry.productKeyId !== productKeyId),
            auditLogs: [
              {
                id: createId("audit"),
                shopId: productKey.shopId,
                actorId: session.id,
                action: "owner.product_key.delete",
                targetId: productKeyId,
                detail: `Deleted ${maskKey(productKey.key)} for ${shop?.name ?? "shop"}.`,
                createdAt: deletedAt
              },
              ...current.auditLogs
            ]
          };

          persistLocalOwnerStateSnapshot(nextState);

          return nextState;
        });

        return result;
      },
      activateProductKey: ({ key, browserInfo }) => {
        const normalizedKey = key.trim();

        if (!normalizedKey) {
          return { ok: false, message: "Enter a product key." };
        }

        if (normalizedKey.length < 30) {
          return { ok: false, message: "Product key must be at least 30 characters." };
        }

        let result: { ok: boolean; message?: string; shopId?: string } = {
          ok: false,
          message: "Invalid product key."
        };

        setState((current) => {
          const productKey = current.productKeys.find((entry) => entry.key.trim() === normalizedKey);
          const now = new Date();
          const createdAt = now.toISOString();

          if (!productKey) {
            return current;
          }

          if (productKey.expiresAt && new Date(productKey.expiresAt).getTime() < now.getTime()) {
            result = { ok: false, message: "This product key has expired." };

            return {
              ...current,
              productKeys: current.productKeys.map((entry) =>
                entry.id === productKey.id
                  ? {
                      ...entry,
                      status: "expired"
                    }
                  : entry
              )
            };
          }

          if (productKey.status === "revoked") {
            result = { ok: false, message: "This product key has been revoked." };
            return current;
          }

          if (productKey.status === "locked") {
            result = { ok: false, message: "This product key is locked. Please contact support." };
            return current;
          }

          if (productKey.status === "expired") {
            result = { ok: false, message: "This product key has expired." };
            return current;
          }

          const license = current.licenses.find((entry) => entry.shopId === productKey.shopId);
          const licenseStatus = getEffectiveLicenseStatus(license, now);

          if (licenseStatus === "locked") {
            result = { ok: false, message: "Your POS is temporarily locked. Please contact support." };
            return current;
          }

          if (licenseStatus === "expired") {
            result = { ok: false, message: "Your POS license has expired. Please contact support." };
            return current;
          }

          const resolvedBrowserInfo =
            browserInfo?.trim() ||
            (typeof window !== "undefined" ? window.navigator.userAgent : "Unknown browser");
          const existingActivation = current.deviceActivations.find(
            (activation) =>
              activation.productKeyId === productKey.id && activation.browserInfo === resolvedBrowserInfo
          );
          const activeDeviceCount = current.deviceActivations.filter(
            (activation) => activation.productKeyId === productKey.id
          ).length;

          if (!existingActivation && activeDeviceCount >= productKey.allowedDevices) {
            result = { ok: false, message: "This product key has reached its allowed device limit." };
            return current;
          }

          result = {
            ok: true,
            shopId: productKey.shopId
          };

          return {
            ...current,
            productKeys: current.productKeys.map((entry) =>
              entry.id === productKey.id
                ? {
                    ...entry,
                    status: "active",
                    activatedAt: entry.activatedAt ?? createdAt
                  }
                : entry
            ),
            licenses: current.licenses.map((entry) =>
              entry.shopId === productKey.shopId && entry.status !== "trial"
                ? {
                    ...entry,
                    status: "active"
                  }
                : entry
            ),
            shops: current.shops.map((shop) =>
              shop.id === productKey.shopId
                ? {
                    ...shop,
                    licenseStatus: "active"
                  }
                : shop
            ),
            deviceActivations: existingActivation
              ? current.deviceActivations.map((activation) =>
                  activation.id === existingActivation.id
                    ? {
                        ...activation,
                        lastSeenAt: createdAt
                      }
                    : activation
                )
              : [
                  {
                    id: createId("device"),
                    shopId: productKey.shopId,
                    productKeyId: productKey.id,
                    browserInfo: resolvedBrowserInfo,
                    activatedAt: createdAt,
                    lastSeenAt: createdAt
                  },
                  ...current.deviceActivations
                ],
            auditLogs: [
              {
                id: createId("audit"),
                shopId: productKey.shopId,
                actorId: session?.id ?? "activation",
                action: "product_key.activate",
                targetId: productKey.id,
                detail: `Activated ${maskKey(productKey.key)} from ${resolvedBrowserInfo}.`,
                createdAt
              },
              ...current.auditLogs
            ]
          };
        });

        return result;
      },
      mergeCloudActivationState: (payload) => {
        setState((current) => mergeCloudActivationStatePatch(current, payload));
      },
      ownerSetLicense: ({ shopId, status, expiresAt, planName, allowedDevices, autoLockDaysAfterExpiry, lockReason }) => {
        if (!session || session.role !== "super_admin") {
          return { ok: false, message: "Only the POS owner can update licenses." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to update license."
        };

        setState((current) => {
          const shop = current.shops.find((entry) => entry.id === shopId);

          if (!shop) {
            result = { ok: false, message: "Shop not found." };
            return current;
          }

          const updatedAt = new Date().toISOString();
          const existingLicense = current.licenses.find((entry) => entry.shopId === shopId);
          const normalizedAllowedDevices =
            allowedDevices === undefined ? undefined : Math.max(1, Math.round(allowedDevices));
          const nextLicense = {
            id: existingLicense?.id ?? createId("lic"),
            shopId,
            status,
            expiresAt: toDateTime(expiresAt) ?? existingLicense?.expiresAt,
            lastPaymentAt: status === "active" ? updatedAt : existingLicense?.lastPaymentAt,
            autoLockDaysAfterExpiry:
              autoLockDaysAfterExpiry === undefined
                ? existingLicense?.autoLockDaysAfterExpiry ?? 7
                : Math.max(0, Math.round(autoLockDaysAfterExpiry)),
            lockedAt: status === "locked" ? updatedAt : undefined,
            lockReason: status === "locked" ? lockReason?.trim() || "Remote locked by owner." : undefined
          };

          result = { ok: true };

          const nextState = {
            ...current,
            licenses: existingLicense
              ? current.licenses.map((license) => (license.id === existingLicense.id ? nextLicense : license))
              : [nextLicense, ...current.licenses],
            shops: current.shops.map((entry) =>
              entry.id === shopId
                ? {
                    ...entry,
                    planName: planName?.trim() || entry.planName,
                    licenseStatus: status
                  }
                : entry
            ),
            productKeys: current.productKeys.map((productKey) =>
              productKey.shopId === shopId && status === "locked"
                ? {
                    ...productKey,
                    allowedDevices: normalizedAllowedDevices ?? productKey.allowedDevices,
                    status: "locked" as const,
                    lockedAt: updatedAt
                  }
                : productKey.shopId === shopId && productKey.status === "locked" && status === "active"
                  ? {
                      ...productKey,
                      allowedDevices: normalizedAllowedDevices ?? productKey.allowedDevices,
                      status: productKey.activatedAt ? ("active" as const) : ("unused" as const),
                      lockedAt: undefined
                    }
                  : productKey.shopId === shopId && normalizedAllowedDevices !== undefined
                    ? {
                        ...productKey,
                        allowedDevices: normalizedAllowedDevices
                      }
                    : productKey
            ),
            auditLogs: [
              {
                id: createId("audit"),
                shopId,
                actorId: session.id,
                action: "owner.license.update",
                targetId: existingLicense?.id ?? nextLicense.id,
                detail: `Set ${shop.name} license to ${status}.`,
                createdAt: updatedAt
              },
              ...current.auditLogs
            ]
          };

          persistLocalOwnerStateSnapshot(nextState);

          return nextState;
        });

        return result;
      },
      ownerSetProductKeyStatus: ({ productKeyId, status }) => {
        if (!session || session.role !== "super_admin") {
          return { ok: false, message: "Only the POS owner can update product keys." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to update product key."
        };

        setState((current) => {
          const productKey = current.productKeys.find((entry) => entry.id === productKeyId);

          if (!productKey) {
            result = { ok: false, message: "Product key not found." };
            return current;
          }

          const updatedAt = new Date().toISOString();
          result = { ok: true };

          const nextState = {
            ...current,
            productKeys: current.productKeys.map((entry) =>
              entry.id === productKeyId
                ? {
                    ...entry,
                    status,
                    activatedAt: status === "active" ? entry.activatedAt ?? updatedAt : entry.activatedAt,
                    revokedAt: status === "revoked" ? updatedAt : entry.revokedAt,
                    lockedAt: status === "locked" ? updatedAt : entry.lockedAt
                  }
                : entry
            ),
            auditLogs: [
              {
                id: createId("audit"),
                shopId: productKey.shopId,
                actorId: session.id,
                action: "owner.product_key.update",
                targetId: productKeyId,
                detail: `Set ${maskKey(productKey.key)} to ${status}.`,
                createdAt: updatedAt
              },
              ...current.auditLogs
            ]
          };

          persistLocalOwnerStateSnapshot(nextState);

          return nextState;
        });

        return result;
      },
      ownerStartSupportSession: ({ shopId, reason, minutes }) => {
        if (!session || session.role !== "super_admin") {
          return { ok: false, message: "Only the POS owner can start support sessions." };
        }

        const normalizedReason = reason.trim();

        if (!normalizedReason) {
          return { ok: false, message: "A support reason is required." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to start support session."
        };

        setState((current) => {
          const shop = current.shops.find((entry) => entry.id === shopId);

          if (!shop) {
            result = { ok: false, message: "Shop not found." };
            return current;
          }

          const startedAt = new Date();
          const supportSessionId = createId("support");
          const endsAt = new Date(startedAt.getTime() + Math.max(5, minutes) * 60_000).toISOString();

          result = { ok: true };

          return {
            ...current,
            session: {
              id: session.id,
              shopId,
              name: `${session.name} Support`,
              email: session.email,
              role: "support",
              workspace: "shop",
              supportSessionId
            },
            supportSessions: [
              {
                id: supportSessionId,
                shopId,
                startedBy: session.id,
                reason: normalizedReason,
                startedAt: startedAt.toISOString(),
                endsAt
              },
              ...current.supportSessions
            ],
            auditLogs: [
              {
                id: createId("audit"),
                shopId,
                actorId: session.id,
                action: "support_session.start",
                targetId: supportSessionId,
                detail: normalizedReason,
                createdAt: startedAt.toISOString()
              },
              ...current.auditLogs
            ]
          };
        });

        return result;
      },
      ownerResetShopUserPassword: ({ userId, password }) => {
        if (!session || session.role !== "super_admin") {
          return { ok: false, message: "Only the POS owner can reset store user access." };
        }

        const normalizedPassword = password.trim();
        const passwordError = validatePasswordLength(normalizedPassword, "Temporary password");

        if (passwordError) {
          return { ok: false, message: passwordError };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to reset password."
        };

        setState((current) => {
          const targetUser = current.users.find((user) => user.id === userId && user.role !== "super_admin");

          if (!targetUser) {
            result = { ok: false, message: "Store user not found." };
            return current;
          }

          const updatedAt = new Date().toISOString();
          result = { ok: true, message: "Temporary password saved. Share it with the store owner securely." };

          return {
            ...current,
            users: current.users.map((user) =>
              user.id === userId
                ? {
                    ...user,
                    passwordHash: hashSecret(normalizedPassword)
                  }
                : user
            ),
            auditLogs: [
              {
                id: createId("audit"),
                shopId: targetUser.shopId,
                actorId: session.id,
                action: "owner.user_password.reset",
                targetId: targetUser.id,
                detail: `Reset temporary password for ${targetUser.email}.`,
                createdAt: updatedAt
              },
              ...current.auditLogs
            ]
          };
        });

        return result;
      },
      endSupportSession: () => {
        if (!session?.supportSessionId) {
          return;
        }

        setState((current) => {
          const supportSession = current.supportSessions.find((entry) => entry.id === session.supportSessionId);
          const owner = supportSession
            ? current.users.find((user) => user.id === supportSession.startedBy && user.role === "super_admin")
            : null;
          const endedAt = new Date().toISOString();

          return {
            ...current,
            session: owner
              ? {
                  id: owner.id,
                  name: owner.name,
                  email: owner.email,
                  role: owner.role,
                  workspace: "owner"
                }
              : null,
            supportSessions: current.supportSessions.map((entry) =>
              entry.id === session.supportSessionId
                ? {
                    ...entry,
                    endedAt
                  }
                : entry
            ),
            auditLogs: supportSession
              ? [
                  {
                    id: createId("audit"),
                    shopId: supportSession.shopId,
                    actorId: supportSession.startedBy,
                    action: "support_session.end",
                    targetId: supportSession.id,
                    detail: "Support session ended.",
                    createdAt: endedAt
                  },
                  ...current.auditLogs
                ]
              : current.auditLogs
          };
        });
      },
      updateSettings: (section, values) => {
        if (!currentShopId) {
          return;
        }

        setState((current) => {
          const nextState: DemoAppState = {
            ...current,
            settingsByShop: {
              ...current.settingsByShop,
              [currentShopId]: {
                ...current.settingsByShop[currentShopId],
                [section]: {
                  ...current.settingsByShop[currentShopId][section],
                  ...values
                }
              }
            }
          };

          if (section === "pos") {
            const posValues = values as Partial<ShopSettingsBundle["pos"]>;

            nextState.shops = current.shops.map((shop) =>
              shop.id === currentShopId
                ? {
                    ...shop,
                    name: posValues.shopName ?? shop.name,
                    address: posValues.address ?? shop.address,
                    phone: posValues.phone ?? shop.phone,
                    email: posValues.email ?? shop.email,
                    website: posValues.website ?? shop.website,
                    currency: posValues.currency ?? shop.currency
                  }
                : shop
            );
          }

          return nextState;
        });
      },
      createSupportTicket: ({ subject, message, preferredChannel }) => {
        void subject;
        void message;
        void preferredChannel;
      },
      saveCustomer: ({ id, name, phone, email, whatsapp }) => {
        if (!currentShopId || !session) {
          return {
            ok: false,
            message: "Session unavailable."
          };
        }

        let result: { ok: boolean; message?: string; customerId?: string } = {
          ok: false,
          message: "Unable to save customer."
        };

        setState((current) => {
          const normalizedName = name.trim();
          const normalizedPhone = phone?.trim() || undefined;
          const normalizedEmail = email?.trim() || undefined;
          const normalizedWhatsapp = whatsapp?.trim() || undefined;

          if (!normalizedName) {
            result = {
              ok: false,
              message: "Customer name is required."
            };

            return current;
          }

          const phoneConflict = findCustomerPhoneConflict(
            current.customers,
            currentShopId,
            id,
            normalizedPhone
          );

          if (phoneConflict) {
            result = {
              ok: false,
              message: "Another customer already uses this phone number."
            };

            return current;
          }

          if (id) {
            const existingCustomer = current.customers.find(
              (customer) => customer.id === id && customer.shopId === currentShopId
            );

            if (!existingCustomer) {
              result = {
                ok: false,
                message: "Customer not found."
              };

              return current;
            }

            result = {
              ok: true,
              customerId: existingCustomer.id
            };

            return {
              ...current,
              customers: current.customers.map((customer) =>
                customer.id === existingCustomer.id
                  ? {
                      ...customer,
                      name: normalizedName,
                      phone: normalizedPhone,
                      email: normalizedEmail,
                      whatsapp: normalizedWhatsapp
                    }
                  : customer
              )
            };
          }

          const customerId = createId("cust");
          result = {
            ok: true,
            customerId
          };

          return {
            ...current,
            customers: [
              {
                id: customerId,
                shopId: currentShopId,
                name: normalizedName,
                phone: normalizedPhone,
                email: normalizedEmail,
                whatsapp: normalizedWhatsapp,
                createdAt: new Date().toISOString()
              },
              ...current.customers
            ]
          };
        });

        return result;
      },
      deleteCustomer: (customerId) => {
        if (!currentShopId || !session) {
          return {
            ok: false,
            message: "Session unavailable."
          };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to remove customer."
        };

        setState((current) => {
          const openDay = getActiveBusinessDay(current.businessDays, currentShopId);
          const activeShift = getActiveShift(current.shifts, currentShopId, session.id);
          const customer = current.customers.find(
            (entry) => entry.id === customerId && entry.shopId === currentShopId
          );

          if (!openDay) {
            result = {
              ok: false,
              message: "Start the business day before receiving account payments."
            };

            return current;
          }

          if (!activeShift) {
            result = {
              ok: false,
              message: "Start your shift before receiving account payments."
            };

            return current;
          }

          if (!customer) {
            result = {
              ok: false,
              message: "Customer not found."
            };

            return current;
          }

          const customerMetrics = getCustomerAccountMetrics({
            bills: current.bills,
            customerId,
            settlements: current.customerAccountPayments.filter(
              (entry) => entry.shopId === currentShopId && entry.customerId === customerId
            )
          });

          if (customerMetrics.outstandingBalance > 0) {
            result = {
              ok: false,
              message: "Clear the customer account balance before removing this customer."
            };

            return current;
          }

          result = {
            ok: true
          };

          return {
            ...current,
            customers: current.customers.filter((entry) => entry.id !== customerId),
            customerAccountPayments: current.customerAccountPayments.filter(
              (entry) => entry.customerId !== customerId
            ),
            bills: current.bills.map((bill) =>
              bill.customerId === customerId
                ? {
                    ...bill,
                    customerId: undefined
                  }
                : bill
            )
          };
        });

        return result;
      },
      settleCustomerAccount: ({ customerId, amount, method, note }) => {
        if (!currentShopId || !session) {
          return {
            ok: false,
            message: "Session unavailable."
          };
        }

        let result: { ok: boolean; message?: string; appliedAmount?: number; paymentId?: string; number?: string } = {
          ok: false,
          message: "Unable to apply the settlement."
        };

        setState((current) => {
          const openDay = getActiveBusinessDay(current.businessDays, currentShopId);
          const activeShift = getActiveShift(current.shifts, currentShopId, session.id);
          const customer = current.customers.find(
            (entry) => entry.id === customerId && entry.shopId === currentShopId
          );

          if (!openDay) {
            result = {
              ok: false,
              message: "Start the business day before receiving account payments."
            };

            return current;
          }

          if (!activeShift) {
            result = {
              ok: false,
              message: "Start your shift before receiving account payments."
            };

            return current;
          }

          if (!customer) {
            result = {
              ok: false,
              message: "Customer not found."
            };

            return current;
          }

          const normalizedAmount = Math.round(amount * 100) / 100;

          if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            result = {
              ok: false,
              message: "Enter a settlement amount greater than zero."
            };

            return current;
          }

          const customerMetrics = getCustomerAccountMetrics({
            bills: current.bills,
            customerId,
            settlements: current.customerAccountPayments.filter(
              (entry) => entry.shopId === currentShopId && entry.customerId === customerId
            )
          });

          if (customerMetrics.outstandingBalance <= 0) {
            result = {
              ok: false,
              message: "This customer does not have any outstanding account balance."
            };

            return current;
          }

          if (normalizedAmount > customerMetrics.outstandingBalance) {
            result = {
              ok: false,
              message: "Settlement amount cannot exceed outstanding balance."
            };

            return current;
          }

          const settlement = applySettlementToBills({
            amount: normalizedAmount,
            bills: current.bills,
            customerId
          });

          if (settlement.appliedAmount <= 0) {
            result = {
              ok: false,
              message: "Unable to apply the settlement."
            };

            return current;
          }

          const createdAt = new Date().toISOString();
          const paymentId = createId("custpay");
          const paymentSequence = current.accountPaymentSequencesByShop[currentShopId] ?? 1;
          const paymentNumber = `PAY-${String(paymentSequence).padStart(6, "0")}`;
          const allocations = settlement.allocations.map((allocation) => {
            const bill = current.bills.find((entry) => entry.id === allocation.billId);

            return {
              billId: allocation.billId,
              billNumber: bill?.number ?? allocation.billId,
              amount: allocation.amount
            };
          });

          result = {
            ok: true,
            appliedAmount: settlement.appliedAmount,
            paymentId,
            number: paymentNumber
          };

          return {
            ...current,
            accountPaymentSequencesByShop: {
              ...current.accountPaymentSequencesByShop,
              [currentShopId]: paymentSequence + 1
            },
            customerAccountPayments: [
              {
                id: paymentId,
                shopId: currentShopId,
                customerId,
                number: paymentNumber,
                businessDate: openDay.businessDate,
                shiftId: activeShift.id,
                amount: settlement.appliedAmount,
                method,
                allocations,
                note: note?.trim() || undefined,
                createdBy: session.id,
                createdAt
              },
              ...current.customerAccountPayments
            ],
            ledgerEntries: [
              ...buildCustomerSettlementLedgerEntries({
                payment: {
                  id: paymentId,
                  shopId: currentShopId,
                  customerId,
                  number: paymentNumber,
                  businessDate: openDay.businessDate,
                  shiftId: activeShift.id,
                  amount: settlement.appliedAmount,
                  method,
                  allocations,
                  note: note?.trim() || undefined,
                  createdBy: session.id,
                  createdAt
                },
                createdBy: session.id,
                idFactory: () => createId("ledger")
              }),
              ...current.ledgerEntries
            ],
            bills: current.bills.map((bill) => settlement.updatedBillsById[bill.id] ?? bill),
            payments: [
              ...settlement.allocations.map((allocation) => ({
                id: createId("payment"),
                billId: allocation.billId,
                method,
                amount: allocation.amount,
                createdAt
              })),
              ...current.payments
            ]
          };
        });

        return result;
      },
      addCategory: ({ name, description }) => {
        if (!currentShopId) {
          return { ok: false, message: "Shop unavailable." };
        }

        let result: { ok: boolean; message?: string; categoryId?: string } = {
          ok: false,
          message: "Unable to save category."
        };

        setState((current) => {
          const normalizedName = name.trim();

          if (!normalizedName) {
            result = { ok: false, message: "Category name is required." };
            return current;
          }

          if (findCategoryNameConflict(current.categories, currentShopId, normalizedName)) {
            result = { ok: false, message: "Another category already uses this name." };
            return current;
          }

          const categoryId = createId("cat");
          result = { ok: true, categoryId };

          return {
            ...current,
            categories: [
              {
                id: categoryId,
                shopId: currentShopId,
                name: normalizedName,
                description: description?.trim() || undefined,
                createdAt: new Date().toISOString()
              },
              ...current.categories
            ]
          };
        });

        return result;
      },
      updateCategory: (categoryId, payload) => {
        if (!currentShopId) {
          return { ok: false, message: "Shop unavailable." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to update category."
        };

        setState((current) => {
          const category = current.categories.find((entry) => entry.id === categoryId && entry.shopId === currentShopId);

          if (!category) {
            result = { ok: false, message: "Category not found." };
            return current;
          }

          const nextName = payload.name?.trim() ?? category.name;

          if (!nextName) {
            result = { ok: false, message: "Category name is required." };
            return current;
          }

          if (findCategoryNameConflict(current.categories, currentShopId, nextName, categoryId)) {
            result = { ok: false, message: "Another category already uses this name." };
            return current;
          }

          result = { ok: true };

          return {
            ...current,
            categories: current.categories.map((entry) =>
              entry.id === categoryId
                ? {
                    ...entry,
                    ...payload,
                    name: nextName,
                    description: payload.description?.trim() ?? entry.description
                  }
                : entry
            )
          };
        });

        return result;
      },
      deleteCategory: (categoryId) => {
        if (!currentShopId) {
          return { ok: false, message: "Shop unavailable." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to remove category."
        };

        setState((current) => {
          const category = current.categories.find((entry) => entry.id === categoryId && entry.shopId === currentShopId);

          if (!category) {
            result = { ok: false, message: "Category not found." };
            return current;
          }

          result = { ok: true };

          return {
            ...current,
            categories: current.categories.filter((entry) => entry.id !== categoryId),
            products: current.products.map((product) =>
              product.categoryId === categoryId
                ? {
                    ...product,
                    categoryId: undefined,
                    updatedAt: new Date().toISOString()
                  }
                : product
            )
          };
        });

        return result;
      },
      saveProduct: (payload) => {
        if (!currentShopId) {
          return { ok: false, message: "Shop unavailable." };
        }

        let result: { ok: boolean; message?: string; barcode?: string } = {
          ok: false,
          message: "Unable to save product."
        };

        setState((current) => {
          const accessBlock = getShopAccessBlock(current, currentShopId);

          if (accessBlock) {
            result = { ok: false, message: accessBlock };
            return current;
          }

          const nextBarcodeCandidate = normalizeBarcode(payload.barcode);
          const barcodeConflict = findBarcodeConflict(
            current.products,
            currentShopId,
            nextBarcodeCandidate,
            payload.id
          );
          if (barcodeConflict) {
            result = {
              ok: false,
              message: "Another product already uses this barcode."
            };
            return current;
          }
          const resolvedBarcode =
            nextBarcodeCandidate
              ? nextBarcodeCandidate
              : generateUniqueBarcode(current.products, currentShopId);
          const nextPayload = {
            ...payload,
            categoryId: payload.categoryId || undefined,
            barcode: resolvedBarcode,
            expiryDate: payload.kind === "product" ? payload.expiryDate?.trim() || undefined : undefined
          };

          result = {
            ok: true,
            barcode: resolvedBarcode
          };

          if (payload.id) {
            return {
              ...current,
              products: current.products.map((product) =>
                product.id === payload.id
                  ? {
                      ...product,
                      ...nextPayload,
                      updatedAt: new Date().toISOString()
                    }
                  : product
              )
            };
          }

          const { id: _ignoredPayloadId, ...newProductPayload } = nextPayload;
          const createdAt = new Date().toISOString();

          return {
            ...current,
            products: [
              {
                ...newProductPayload,
                id: createId("prod"),
                shopId: currentShopId,
                createdAt,
                updatedAt: createdAt
              },
              ...current.products
            ]
          };
        });

        return result;
      },
      adjustInventory: ({ productId, type, quantity, reason, supplierId, expiryDate, costPrice }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (session.role !== "shop_admin") {
          return { ok: false, message: "Only the shop admin can adjust inventory." };
        }

        const normalizedQuantity = Math.round(quantity * 100) / 100;
        const normalizedReason = reason?.trim() ?? "";
        const normalizedCostPrice =
          costPrice === undefined || !Number.isFinite(costPrice)
            ? undefined
            : Math.round(Math.max(0, costPrice) * 100) / 100;

        if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
          return { ok: false, message: "Enter a quantity greater than zero." };
        }

        if (type === "remove" && !normalizedReason) {
          return { ok: false, message: "Add a reason before saving the stock adjustment." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to adjust inventory."
        };

        setState((current) => {
          const accessBlock = getShopAccessBlock(current, currentShopId);

          if (accessBlock) {
            result = { ok: false, message: accessBlock };
            return current;
          }

          const product = current.products.find(
            (entry) => entry.id === productId && entry.shopId === currentShopId && entry.kind === "product"
          );

          if (!product) {
            result = { ok: false, message: "Product not found." };
            return current;
          }

          if (supplierId && !current.suppliers.some((supplier) => supplier.id === supplierId && supplier.shopId === currentShopId)) {
            result = { ok: false, message: "Supplier not found." };
            return current;
          }

          if (type === "remove" && normalizedQuantity > product.stockQuantity) {
            result = { ok: false, message: "Cannot remove more stock than available." };
            return current;
          }

          const afterQuantity =
            type === "add"
              ? product.stockQuantity + normalizedQuantity
              : product.stockQuantity - normalizedQuantity;
          const createdAt = new Date().toISOString();
          const nextCostPrice = type === "add" && normalizedCostPrice !== undefined ? normalizedCostPrice : product.costPrice;
          const stockBatch =
            type === "add"
              ? [
                  {
                    id: createId("batch"),
                    shopId: currentShopId,
                    productId,
                    supplierId: supplierId || undefined,
                    batchNumber: `BATCH-${createdAt.slice(0, 10).replace(/-/g, "")}-${createId("lot").slice(-5).toUpperCase()}`,
                    quantity: normalizedQuantity,
                    remainingQuantity: normalizedQuantity,
                    costPrice: nextCostPrice,
                    expiryDate: expiryDate?.trim() || undefined,
                    receivedAt: createdAt,
                    createdBy: session.id
                  }
                ]
              : [];

          result = { ok: true };

          return {
            ...current,
            inventoryBatches:
              type === "remove"
                ? consumeInventoryBatches(current.inventoryBatches, productId, normalizedQuantity)
                : [...stockBatch, ...current.inventoryBatches],
            inventoryAdjustments: [
              {
                id: createId("inv_adj"),
                shopId: currentShopId,
                productId,
                type,
                quantity: normalizedQuantity,
                beforeQuantity: product.stockQuantity,
                afterQuantity,
                reason: normalizedReason || "Stock added",
                supplierId: supplierId || undefined,
                expiryDate: expiryDate?.trim() || undefined,
                createdBy: session.id,
                createdAt
              },
              ...current.inventoryAdjustments
            ],
            products: current.products.map((entry) =>
              entry.id === product.id
                ? {
                    ...entry,
                    costPrice: nextCostPrice,
                    stockQuantity: afterQuantity,
                    expiryDate: expiryDate?.trim() || entry.expiryDate,
                    updatedAt: createdAt
                  }
                : entry
            )
          };
        });

        return result;
      },
      saveSupplier: ({ id, name, phone, email, vatNumber, contactPerson, address, defaultPaymentMethod, accountBalance }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (session.role !== "shop_admin") {
          return { ok: false, message: "Only the shop admin can manage suppliers." };
        }

        const normalizedName = name.trim();
        const normalizedAccountBalance =
          accountBalance === undefined || !Number.isFinite(accountBalance)
            ? 0
            : Math.round(accountBalance * 100) / 100;

        if (!normalizedName) {
          return { ok: false, message: "Supplier name is required." };
        }

        let result: { ok: boolean; message?: string; supplierId?: string } = {
          ok: false,
          message: "Unable to save supplier."
        };

        setState((current) => {
          const accessBlock = getShopAccessBlock(current, currentShopId);

          if (accessBlock) {
            result = { ok: false, message: accessBlock };
            return current;
          }

          const duplicate = current.suppliers.find(
            (supplier) =>
              supplier.shopId === currentShopId &&
              supplier.name.trim().toLowerCase() === normalizedName.toLowerCase() &&
              supplier.id !== id
          );

          if (duplicate) {
            result = { ok: false, message: "Another supplier already uses this name." };
            return current;
          }

          const updatedAt = new Date().toISOString();

          if (id) {
            const existing = current.suppliers.find(
              (supplier) => supplier.id === id && supplier.shopId === currentShopId
            );

            if (!existing) {
              result = { ok: false, message: "Supplier not found." };
              return current;
            }

            result = { ok: true, supplierId: id };

            return {
              ...current,
              suppliers: current.suppliers.map((supplier) =>
                supplier.id === id
                  ? {
                      ...supplier,
                      name: normalizedName,
                      phone: phone?.trim() || undefined,
                      email: email?.trim() || undefined,
                      vatNumber: vatNumber?.trim() || undefined,
                      contactPerson: contactPerson?.trim() || undefined,
                      address: address?.trim() || undefined,
                      defaultPaymentMethod: defaultPaymentMethod ?? existing.defaultPaymentMethod ?? "credit",
                      accountBalance: normalizedAccountBalance,
                      updatedAt
                    }
                  : supplier
              )
            };
          }

          const supplierId = createId("supplier");
          result = { ok: true, supplierId };

          return {
            ...current,
            suppliers: [
              {
                id: supplierId,
                shopId: currentShopId,
                name: normalizedName,
                phone: phone?.trim() || undefined,
                email: email?.trim() || undefined,
                vatNumber: vatNumber?.trim() || undefined,
                contactPerson: contactPerson?.trim() || undefined,
                address: address?.trim() || undefined,
                defaultPaymentMethod: defaultPaymentMethod ?? "credit",
                accountBalance: normalizedAccountBalance,
                createdAt: updatedAt,
                updatedAt
              },
              ...current.suppliers
            ]
          };
        });

        return result;
      },
      deleteSupplier: (supplierId) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (session.role !== "shop_admin") {
          return { ok: false, message: "Only the shop admin can manage suppliers." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to remove supplier."
        };

        setState((current) => {
          const accessBlock = getShopAccessBlock(current, currentShopId);

          if (accessBlock) {
            result = { ok: false, message: accessBlock };
            return current;
          }

          const supplier = current.suppliers.find(
            (entry) => entry.id === supplierId && entry.shopId === currentShopId
          );

          if (!supplier) {
            result = { ok: false, message: "Supplier not found." };
            return current;
          }

          if (current.purchaseOrders.some((order) => order.supplierId === supplierId)) {
            result = { ok: false, message: "Supplier has purchase orders and cannot be removed." };
            return current;
          }

          result = { ok: true };

          return {
            ...current,
            suppliers: current.suppliers.filter((entry) => entry.id !== supplierId)
          };
        });

        return result;
      },
      createPurchaseOrder: ({ number, supplierId, supplierName, expectedAt, note, paymentMethod, paymentStatus, paidAmount, items }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (session.role !== "shop_admin") {
          return { ok: false, message: "Only the shop admin can create purchase orders." };
        }

        const normalizedNumber = number.trim();
        const normalizedSupplierName = supplierName.trim();

        if (!normalizedNumber) {
          return { ok: false, message: "Purchase order number is required." };
        }

        if (!normalizedSupplierName && !supplierId) {
          return { ok: false, message: "Supplier name is required." };
        }

        let result: { ok: boolean; message?: string; purchaseOrderId?: string } = {
          ok: false,
          message: "Unable to save purchase order."
        };

        setState((current) => {
          const accessBlock = getShopAccessBlock(current, currentShopId);

          if (accessBlock) {
            result = { ok: false, message: accessBlock };
            return current;
          }

          if (
            current.purchaseOrders.some(
              (order) => order.shopId === currentShopId && order.number.trim().toLowerCase() === normalizedNumber.toLowerCase()
            )
          ) {
            result = { ok: false, message: "Another purchase order already uses this number." };
            return current;
          }

          const validItems = items
            .map((item) => {
              const product = current.products.find(
                (entry) => entry.id === item.productId && entry.shopId === currentShopId && entry.kind === "product"
              );
              const quantity = Math.round(item.quantity * 100) / 100;
              const costPrice = Number.isFinite(item.costPrice)
                ? Math.round(Math.max(0, item.costPrice) * 100) / 100
                : Number.NaN;

              if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(costPrice)) {
                return null;
              }

              return {
                product,
                quantity,
                costPrice,
                initialCostPrice: product.costPrice
              };
            })
            .filter((item): item is { product: Product; quantity: number; costPrice: number; initialCostPrice: number } => item !== null);

          if (validItems.length === 0) {
            result = { ok: false, message: "Add at least one physical product to the purchase order." };
            return current;
          }

          const existingSupplier = supplierId
            ? current.suppliers.find((supplier) => supplier.id === supplierId && supplier.shopId === currentShopId)
            : current.suppliers.find(
                (supplier) =>
                  supplier.shopId === currentShopId &&
                  supplier.name.trim().toLowerCase() === normalizedSupplierName.toLowerCase()
              );

          if (supplierId && !existingSupplier) {
            result = { ok: false, message: "Supplier not found." };
            return current;
          }

          const createdAt = new Date().toISOString();
          const purchaseOrderId = createId("po");
          const nextSupplierId = existingSupplier?.id ?? createId("supplier");
          const nextSupplierName = existingSupplier?.name ?? normalizedSupplierName;
          const totalAmount = Math.round(
            validItems.reduce((sum, item) => sum + item.quantity * item.costPrice, 0) * 100
          ) / 100;
          const parsedPaidAmount = Number.isFinite(paidAmount) ? paidAmount ?? 0 : 0;
          const normalizedPaidAmount = Math.min(totalAmount, Math.max(0, Math.round(parsedPaidAmount * 100) / 100));
          const nextPaymentStatus =
            normalizedPaidAmount >= totalAmount
              ? "paid"
              : normalizedPaidAmount > 0
                ? "partial"
                : paymentStatus ?? "unpaid";
          const nextPaymentMethod = paymentMethod ?? existingSupplier?.defaultPaymentMethod ?? "credit";
          const supplierToCreate = existingSupplier
            ? []
            : [
                {
                  id: nextSupplierId,
                  shopId: currentShopId,
                  name: nextSupplierName,
                  defaultPaymentMethod: nextPaymentMethod,
                  accountBalance: 0,
                  createdAt,
                  updatedAt: createdAt
                }
              ];
          const supplierCreditDelta = Math.round(Math.max(0, totalAmount - normalizedPaidAmount) * 100) / 100;

          result = { ok: true, purchaseOrderId };

          return {
            ...current,
            suppliers: existingSupplier
              ? current.suppliers.map((supplier) =>
                  supplier.id === existingSupplier.id
                    ? {
                        ...supplier,
                        defaultPaymentMethod: nextPaymentMethod,
                        accountBalance:
                          Math.round(((supplier.accountBalance ?? 0) + supplierCreditDelta) * 100) / 100,
                        updatedAt: createdAt
                      }
                    : supplier
                )
              : [
                  ...supplierToCreate.map((supplier) => ({
                  ...supplier,
                    accountBalance: Math.round(((supplier.accountBalance ?? 0) + supplierCreditDelta) * 100) / 100
                  })),
                  ...current.suppliers
                ],
            purchaseOrders: [
              {
                id: purchaseOrderId,
                shopId: currentShopId,
                number: normalizedNumber,
                supplierId: nextSupplierId,
                supplierName: nextSupplierName,
                status: "ordered",
                totalAmount,
                paidAmount: normalizedPaidAmount,
                paymentStatus: nextPaymentStatus,
                paymentMethod: nextPaymentMethod,
                lastPaymentAt: normalizedPaidAmount > 0 ? createdAt : undefined,
                note: note?.trim() || undefined,
                expectedAt: expectedAt?.trim() || undefined,
                createdBy: session.id,
                createdAt
              },
              ...current.purchaseOrders
            ],
            purchaseOrderItems: [
              ...validItems.map((item) => ({
                id: createId("po_item"),
                purchaseOrderId,
                productId: item.product.id,
                productName: item.product.name,
                quantity: item.quantity,
                receivedQuantity: 0,
                costPrice: item.costPrice,
                initialCostPrice: item.initialCostPrice
              })),
              ...current.purchaseOrderItems
            ]
          };
        });

        return result;
      },
      receivePurchaseOrder: (purchaseOrderId, payload = {}) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (session.role !== "shop_admin") {
          return { ok: false, message: "Only the shop admin can receive purchase orders." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to receive purchase order."
        };

        setState((current) => {
          const accessBlock = getShopAccessBlock(current, currentShopId);

          if (accessBlock) {
            result = { ok: false, message: accessBlock };
            return current;
          }

          const order = current.purchaseOrders.find(
            (entry) => entry.id === purchaseOrderId && entry.shopId === currentShopId
          );

          if (!order) {
            result = { ok: false, message: "Purchase order not found." };
            return current;
          }

          if (order.status === "received") {
            result = { ok: false, message: "Purchase order is already received." };
            return current;
          }

          if (order.status === "cancelled") {
            result = { ok: false, message: "Cancelled purchase orders cannot be received." };
            return current;
          }

          const orderItems = current.purchaseOrderItems.filter((item) => item.purchaseOrderId === purchaseOrderId);

          if (orderItems.length === 0) {
            result = { ok: false, message: "Purchase order has no items." };
            return current;
          }

          const requestedByItemId = new Map((payload.items ?? []).map((item) => [item.purchaseOrderItemId, item]));
          const receivedLines = orderItems
            .map((item) => {
              const requested = requestedByItemId.get(item.id);
              const remainingQuantity = Math.max(0, item.quantity - (item.receivedQuantity ?? 0));
              const requestedQuantity =
                requested === undefined
                  ? remainingQuantity
                  : Math.round(Math.max(0, requested.receivedQuantity) * 100) / 100;
              const receivedQuantity = Math.min(remainingQuantity, requestedQuantity);
              const costPrice =
                requested?.costPrice !== undefined && Number.isFinite(requested.costPrice)
                  ? Math.round(Math.max(0, requested.costPrice) * 100) / 100
                  : item.costPrice;

              return {
                item,
                receivedQuantity,
                costPrice,
                expiryDate: requested?.expiryDate?.trim() || item.expiryDate
              };
            })
            .filter((entry) => entry.receivedQuantity > 0);
          const totalAmount = order.totalAmount ?? orderItems.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
          const alreadyPaid = order.paidAmount ?? 0;
          const parsedPaidAmount = Number.isFinite(payload.paidAmount) ? payload.paidAmount ?? 0 : 0;
          const receivePaidAmount = Math.min(
            Math.max(0, Math.round(parsedPaidAmount * 100) / 100),
            Math.max(0, Math.round((totalAmount - alreadyPaid) * 100) / 100)
          );

          if (receivedLines.length === 0 && receivePaidAmount <= 0) {
            result = { ok: false, message: "Enter received quantity or supplier payment amount." };
            return current;
          }

          const productsById = new Map(current.products.map((product) => [product.id, product]));
          const createdAt = new Date().toISOString();
          const receivedQuantityByProductId = receivedLines.reduce<Record<string, { costPrice: number; quantity: number }>>(
            (accumulator, entry) => {
              accumulator[entry.item.productId] = {
                costPrice: entry.costPrice,
                quantity: (accumulator[entry.item.productId]?.quantity ?? 0) + entry.receivedQuantity
              };
              return accumulator;
            },
            {}
          );
          const nextProducts = current.products.map((product) => {
            const receivedItem = receivedQuantityByProductId[product.id];

            if (!receivedItem || product.kind !== "product") {
              return product;
            }

            return {
              ...product,
              costPrice: receivedItem.costPrice,
              stockQuantity: Math.round((product.stockQuantity + receivedItem.quantity) * 100) / 100,
              updatedAt: createdAt
            };
          });
          const receivedAdjustments: DemoAppState["inventoryAdjustments"] = orderItems.reduce<
            DemoAppState["inventoryAdjustments"]
          >((accumulator, item) => {
            const receivedLine = receivedLines.find((entry) => entry.item.id === item.id);
            const product = productsById.get(item.productId);

            if (!receivedLine || !product || product.kind !== "product") {
              return accumulator;
            }

            accumulator.push({
              id: createId("inv_adj"),
              shopId: currentShopId,
              productId: item.productId,
              type: "add",
              quantity: receivedLine.receivedQuantity,
              beforeQuantity: product.stockQuantity,
              afterQuantity: Math.round((product.stockQuantity + receivedLine.receivedQuantity) * 100) / 100,
              reason: `PO received ${order.number}`,
              supplierId: order.supplierId,
              expiryDate: receivedLine.expiryDate,
              referenceId: order.id,
              createdBy: session.id,
              createdAt
            });

            return accumulator;
          }, []);
          const receivedBatches: DemoAppState["inventoryBatches"] = orderItems.reduce<
            DemoAppState["inventoryBatches"]
          >((accumulator, item) => {
            const receivedLine = receivedLines.find((entry) => entry.item.id === item.id);
            const product = productsById.get(item.productId);

            if (!receivedLine || !product || product.kind !== "product") {
              return accumulator;
            }

            accumulator.push({
              id: createId("batch"),
              shopId: currentShopId,
              productId: item.productId,
              supplierId: order.supplierId,
              purchaseOrderId: order.id,
              batchNumber: `${order.number}-${item.productId.slice(-4).toUpperCase()}`,
              quantity: receivedLine.receivedQuantity,
              remainingQuantity: receivedLine.receivedQuantity,
              costPrice: receivedLine.costPrice,
              expiryDate: receivedLine.expiryDate || product.expiryDate,
              receivedAt: createdAt,
              createdBy: session.id
            });

            return accumulator;
          }, []);

          result = { ok: true };
          const nextPurchaseOrderItems = current.purchaseOrderItems.map((item) => {
            const receivedLine = receivedLines.find((entry) => entry.item.id === item.id);

            if (!receivedLine) {
              return item;
            }

            return {
              ...item,
              costPrice: receivedLine.costPrice,
              expiryDate: receivedLine.expiryDate || item.expiryDate,
              receivedQuantity: Math.round(((item.receivedQuantity ?? 0) + receivedLine.receivedQuantity) * 100) / 100
            };
          });
          const relatedNextItems = nextPurchaseOrderItems.filter((item) => item.purchaseOrderId === purchaseOrderId);
          const allReceived = relatedNextItems.every((item) => (item.receivedQuantity ?? 0) >= item.quantity);
          const anyReceived = relatedNextItems.some((item) => (item.receivedQuantity ?? 0) > 0);
          const nextPaidAmount = Math.min(totalAmount, Math.round((alreadyPaid + receivePaidAmount) * 100) / 100);
          const nextPaymentStatus: PurchasePaymentStatus =
            nextPaidAmount >= totalAmount && totalAmount > 0 ? "paid" : nextPaidAmount > 0 ? "partial" : "unpaid";
          const nextPaymentMethod = payload.paymentMethod ?? order.paymentMethod ?? "credit";

          return {
            ...current,
            inventoryAdjustments: [...receivedAdjustments, ...current.inventoryAdjustments],
            inventoryBatches: [...receivedBatches, ...current.inventoryBatches],
            products: nextProducts,
            purchaseOrderItems: nextPurchaseOrderItems,
            suppliers: order.supplierId
              ? current.suppliers.map((supplier) =>
                  supplier.id === order.supplierId
                    ? {
                        ...supplier,
                        accountBalance: Math.max(0, Math.round(((supplier.accountBalance ?? 0) - receivePaidAmount) * 100) / 100),
                        updatedAt: createdAt
                      }
                    : supplier
                )
              : current.suppliers,
            purchaseOrders: current.purchaseOrders.map((entry) =>
              entry.id === order.id
                ? {
                    ...entry,
                    paidAmount: nextPaidAmount,
                    paymentMethod: nextPaymentMethod,
                    paymentStatus: nextPaymentStatus,
                    lastPaymentAt: receivePaidAmount > 0 ? createdAt : entry.lastPaymentAt,
                    status: allReceived ? "received" : anyReceived ? "partially_received" : entry.status,
                    receivedAt: allReceived ? createdAt : entry.receivedAt,
                    receivedBy: receivedLines.length > 0 ? session.id : entry.receivedBy
                  }
                : entry
            )
          };
        });

        return result;
      },
      deleteProduct: (productId, reason) => {
        if (!session) {
          return;
        }

        setState((current) => {
          const product = current.products.find((item) => item.id === productId);

          if (!product) {
            return current;
          }

          if (getShopAccessBlock(current, product.shopId)) {
            return current;
          }

          return {
            ...current,
            products: current.products.filter((item) => item.id !== productId),
            deletedProducts: [
              {
                id: createId("trash"),
                shopId: product.shopId,
                product,
                deletedBy: session.name,
                deletedAt: new Date().toISOString(),
                reason
              },
              ...current.deletedProducts
            ]
          };
        });
      },
      restoreDeletedProduct: (deletedProductId) => {
        setState((current) => {
          const deleted = current.deletedProducts.find((item) => item.id === deletedProductId);

          if (!deleted) {
            return current;
          }

          if (getShopAccessBlock(current, deleted.shopId)) {
            return current;
          }

          return {
            ...current,
            deletedProducts: current.deletedProducts.filter((item) => item.id !== deletedProductId),
            products: [
              {
                ...deleted.product,
                updatedAt: new Date().toISOString()
              },
              ...current.products
            ]
          };
        });
      },
      permanentlyDeleteProduct: (deletedProductId) => {
        setState((current) => {
          const deleted = current.deletedProducts.find((item) => item.id === deletedProductId);

          if (deleted && getShopAccessBlock(current, deleted.shopId)) {
            return current;
          }

          return {
            ...current,
            deletedProducts: current.deletedProducts.filter((item) => item.id !== deletedProductId)
          };
        });
      },
      saveShopUser: ({ id, email, name, password, phone, role }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (!["shop_admin", "super_admin"].includes(session.role)) {
          return { ok: false, message: "Only the owner can manage users." };
        }

        let result: { ok: boolean; message?: string; userId?: string } = {
          ok: false,
          message: "Unable to save user."
        };

        setState((current) => {
          const normalizedName = name.trim();
          const normalizedEmail = email.trim().toLowerCase();
          const normalizedPhone = phone?.trim() || undefined;
          const normalizedPassword = password?.trim() || undefined;
          const passwordError = normalizedPassword
            ? validatePasswordLength(normalizedPassword)
            : null;

          if (!normalizedName || !normalizedEmail) {
            result = { ok: false, message: "Name and email are required." };
            return current;
          }

          if (passwordError) {
            result = { ok: false, message: passwordError };
            return current;
          }

          if (findUserEmailConflict(current.users, normalizedEmail, id)) {
            result = { ok: false, message: "Another user already uses this email address." };
            return current;
          }

          if (id) {
            const existingUser = current.users.find((entry) => entry.id === id && entry.shopId === currentShopId);

            if (!existingUser) {
              result = { ok: false, message: "User not found." };
              return current;
            }

            result = { ok: true, userId: existingUser.id };

            return {
              ...current,
              users: current.users.map((entry) =>
                entry.id === existingUser.id
                  ? {
                      ...entry,
                      name: normalizedName,
                      email: normalizedEmail,
                      phone: normalizedPhone,
                      role,
                      passwordHash: normalizedPassword ? hashSecret(normalizedPassword) : entry.passwordHash
                    }
                  : entry
              )
            };
          }

          if (!normalizedPassword) {
            result = { ok: false, message: "Password is required for a new user." };
            return current;
          }

          const userId = createId("user");
          result = { ok: true, userId };

          return {
            ...current,
            users: [
              {
                id: userId,
                shopId: currentShopId,
                name: normalizedName,
                email: normalizedEmail,
                phone: normalizedPhone,
                role,
                isActive: true,
                passwordHash: hashSecret(normalizedPassword),
                createdAt: new Date().toISOString()
              },
              ...current.users
            ]
          };
        });

        return result;
      },
      setUserActive: (userId, isActive) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (!["shop_admin", "super_admin"].includes(session.role)) {
          return { ok: false, message: "Only the owner can manage users." };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to update user access."
        };

        setState((current) => {
          const user = current.users.find((entry) => entry.id === userId && entry.shopId === currentShopId);

          if (!user) {
            result = { ok: false, message: "User not found." };
            return current;
          }

          if (!isActive && user.id === session.id) {
            result = { ok: false, message: "You cannot deactivate the current user." };
            return current;
          }

          const activeAdmins = current.users.filter(
            (entry) => entry.shopId === currentShopId && entry.role === "shop_admin" && entry.isActive && entry.id !== userId
          );

          if (!isActive && user.role === "shop_admin" && activeAdmins.length === 0) {
            result = { ok: false, message: "At least one active owner is required." };
            return current;
          }

          result = { ok: true };

          return {
            ...current,
            users: current.users.map((entry) =>
              entry.id === userId
                ? {
                    ...entry,
                    isActive
                  }
                : entry
            )
          };
        });

        return result;
      },
      startBusinessDay: ({ businessDate, openingNote }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (session.role !== "shop_admin") {
          return { ok: false, message: "Only the shop admin can start the business day." };
        }

        let result: { ok: boolean; message?: string } = { ok: false, message: "Unable to start the business day." };

        setState((current) => {
          const openDay = getActiveBusinessDay(current.businessDays, currentShopId);

          if (openDay) {
            result = { ok: false, message: "Close the current business day before starting a new one." };
            return current;
          }

          const shop = current.shops.find((entry) => entry.id === currentShopId);
          const resolvedBusinessDate =
            businessDate?.trim() || getBusinessDateInTimezone(shop?.timezone ?? "Asia/Riyadh", new Date());

          result = { ok: true };

          return {
            ...current,
            businessDays: [
              {
                id: createId("day"),
                shopId: currentShopId,
                businessDate: resolvedBusinessDate,
                openingNote: openingNote?.trim() || undefined,
                startedBy: session.id,
                startedAt: new Date().toISOString()
              },
              ...current.businessDays
            ]
          };
        });

        return result;
      },
      closeBusinessDay: ({ countedCash, note }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (session.role !== "shop_admin") {
          return { ok: false, message: "Only the shop admin can close the business day." };
        }

        let result: { ok: boolean; message?: string } = { ok: false, message: "Unable to close the business day." };

        setState((current) => {
          const openDay = getActiveBusinessDay(current.businessDays, currentShopId);

          if (!openDay) {
            result = { ok: false, message: "Start the business day before closing it." };
            return current;
          }

          const openShifts = current.shifts.filter(
            (shift) => shift.shopId === currentShopId && shift.businessDate === openDay.businessDate && !shift.endedAt
          );

          if (openShifts.length > 0) {
            result = { ok: false, message: "Close all open shifts before ending the business day." };
            return current;
          }

          const shop = current.shops.find((entry) => entry.id === currentShopId);
          const summary = calculateBusinessDaySummary({
            businessDate: openDay.businessDate,
            shopId: currentShopId,
            timeZone: shop?.timezone ?? "Asia/Riyadh",
            bills: current.bills,
            cashMovements: current.cashMovements,
            expenses: current.expenses,
            shifts: current.shifts,
            refunds: current.refunds
          });
          const closedAt = new Date().toISOString();

          result = { ok: true };

          return {
            ...current,
            businessDays: current.businessDays.map((day) =>
              day.id === openDay.id
                ? {
                    ...day,
                    endedAt: closedAt
                  }
                : day
            ),
            dayCloses: [
              {
                id: createId("day_close"),
                shopId: currentShopId,
                businessDate: openDay.businessDate,
                totalSales: summary.totalSales,
                cashSales: summary.cashSales,
                cardSales: summary.cardSales,
                accountSales: summary.accountSales,
                refunds: summary.refunds,
                expenses: summary.expenses,
                netSales: summary.netSales,
                expectedCash: summary.expectedCash,
                countedCash,
                cashDifference: Math.round((countedCash - summary.expectedCash) * 100) / 100,
                note: note?.trim() || undefined,
                closedAt
              },
              ...current.dayCloses
            ]
          };
        });

        return result;
      },
      startShift: ({ openingCash }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (!["shop_admin", "cashier"].includes(session.role)) {
          return { ok: false, message: "Only shop users can start shifts." };
        }

        let result: { ok: boolean; message?: string } = { ok: false, message: "Unable to start the shift." };

        setState((current) => {
          const openDay = getActiveBusinessDay(current.businessDays, currentShopId);

          if (!openDay) {
            result = { ok: false, message: "Start the business day before starting a shift." };
            return current;
          }

          const openShift = getActiveShift(current.shifts, currentShopId, session.id);

          if (openShift) {
            result = { ok: false, message: "Close the current shift before starting a new one." };
            return current;
          }

          result = { ok: true };

          return {
            ...current,
            shifts: [
              {
                id: createId("shift"),
                shopId: currentShopId,
                businessDayId: openDay.id,
                businessDate: openDay.businessDate,
                cashierId: session.id,
                openingCash,
                startedAt: new Date().toISOString()
              },
              ...current.shifts
            ]
          };
        });

        return result;
      },
      endShift: ({ countedCash, note }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        let result: { ok: boolean; message?: string } = { ok: false, message: "Unable to close the shift." };

        setState((current) => {
          const activeShift = getActiveShift(current.shifts, currentShopId, session.id);

          if (!activeShift) {
            result = { ok: false, message: "Start a shift before trying to close it." };
            return current;
          }

          const summary = calculateShiftSummary({
            shift: activeShift,
            bills: current.bills,
            cashMovements: current.cashMovements,
            refunds: current.refunds
          });
          const endedAt = new Date().toISOString();

          result = { ok: true };

          return {
            ...current,
            shifts: current.shifts.map((shift) =>
              shift.id === activeShift.id
                ? {
                    ...shift,
                    countedCash,
                    expectedCash: summary.expectedCash,
                    difference: Math.round((countedCash - summary.expectedCash) * 100) / 100,
                    note: note?.trim() || undefined,
                    endedAt
                  }
                : shift
            )
          };
        });

        return result;
      },
      addCashMovement: ({ type, amount, reason }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        let result: { ok: boolean; message?: string } = { ok: false, message: "Unable to record the cash movement." };

        setState((current) => {
          const openDay = getActiveBusinessDay(current.businessDays, currentShopId);
          const activeShift = getActiveShift(current.shifts, currentShopId, session.id);

          if (!openDay) {
            result = { ok: false, message: "Start the business day before recording cash movement." };
            return current;
          }

          if (!activeShift) {
            result = { ok: false, message: "Start your shift before recording cash movement." };
            return current;
          }

          const movementId = createId("cash");
          const createdAt = new Date().toISOString();

          result = { ok: true };

          return {
            ...current,
            cashMovements: [
              {
                id: movementId,
                shopId: currentShopId,
                businessDate: openDay.businessDate,
                shiftId: activeShift.id,
                createdBy: session.id,
                type,
                amount,
                reason: reason.trim(),
                createdAt
              },
              ...current.cashMovements
            ],
            ledgerEntries: [
              ...buildCashMovementLedgerEntries({
                movement: {
                  id: movementId,
                  shopId: currentShopId,
                  businessDate: openDay.businessDate,
                  shiftId: activeShift.id,
                  createdBy: session.id,
                  type,
                  amount,
                  reason: reason.trim(),
                  createdAt
                },
                createdBy: session.id,
                idFactory: () => createId("ledger")
              }),
              ...current.ledgerEntries
            ]
          };
        });

        return result;
      },
      createExpense: ({ amount, categoryId, categoryName, paymentMethod, vendorName, note }) => {
        if (!currentShopId || !session) {
          return { ok: false, message: "Session unavailable." };
        }

        if (session.role !== "shop_admin") {
          return { ok: false, message: "Only the shop admin can record expenses." };
        }

        const normalizedAmount = Math.round(amount * 100) / 100;
        const normalizedCategoryName = categoryName.trim();

        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
          return { ok: false, message: "Enter an expense amount greater than zero." };
        }

        if (!normalizedCategoryName && !categoryId) {
          return { ok: false, message: "Expense category is required." };
        }

        let result: { ok: boolean; message?: string } = { ok: false, message: "Unable to record expense." };

        setState((current) => {
          const openDay = getActiveBusinessDay(current.businessDays, currentShopId);
          const activeShift = getActiveShift(current.shifts, currentShopId, session.id);

          if (!openDay) {
            result = { ok: false, message: "Start the business day before recording expenses." };
            return current;
          }

          if (!activeShift) {
            result = { ok: false, message: "Start your shift before recording expenses." };
            return current;
          }

          const existingCategory = categoryId
            ? current.expenseCategories.find((category) => category.id === categoryId && category.shopId === currentShopId)
            : current.expenseCategories.find(
                (category) =>
                  category.shopId === currentShopId &&
                  category.name.trim().toLowerCase() === normalizedCategoryName.toLowerCase()
              );
          const createdAt = new Date().toISOString();
          const nextCategoryId = existingCategory?.id ?? createId("expense_cat");
          const nextCategoryName = existingCategory?.name ?? normalizedCategoryName;
          const expenseId = createId("expense");
          const categoryToCreate = existingCategory
            ? []
            : [
                {
                  id: nextCategoryId,
                  shopId: currentShopId,
                  name: nextCategoryName,
                  createdAt
                }
              ];
          const cashMovement =
            paymentMethod === "cash"
              ? [
                  {
                    id: createId("cash"),
                    shopId: currentShopId,
                    businessDate: openDay.businessDate,
                    shiftId: activeShift.id,
                    createdBy: session.id,
                    type: "cash_out" as const,
                    amount: normalizedAmount,
                    reason: `Expense: ${nextCategoryName}${vendorName?.trim() ? ` - ${vendorName.trim()}` : ""}`,
                    createdAt
                  }
                ]
              : [];

          result = { ok: true };

          return {
            ...current,
            expenseCategories: [...categoryToCreate, ...current.expenseCategories],
            expenses: [
              {
                id: expenseId,
                shopId: currentShopId,
                businessDate: openDay.businessDate,
                shiftId: activeShift.id,
                categoryId: nextCategoryId,
                categoryName: nextCategoryName,
                amount: normalizedAmount,
                paymentMethod,
                vendorName: vendorName?.trim() || undefined,
                note: note?.trim() || undefined,
                createdBy: session.id,
                createdAt
              },
              ...current.expenses
            ],
            ledgerEntries: [
              ...buildExpenseLedgerEntries({
                expense: {
                  id: expenseId,
                  shopId: currentShopId,
                  businessDate: openDay.businessDate,
                  shiftId: activeShift.id,
                  categoryId: nextCategoryId,
                  categoryName: nextCategoryName,
                  amount: normalizedAmount,
                  paymentMethod,
                  vendorName: vendorName?.trim() || undefined,
                  note: note?.trim() || undefined,
                  createdBy: session.id,
                  createdAt
                },
                createdBy: session.id,
                idFactory: () => createId("ledger")
              }),
              ...current.ledgerEntries
            ],
            cashMovements: [...cashMovement, ...current.cashMovements]
          };
        });

        return result;
      },
      createBill: (payload) => {
        if (!currentShopId || !session) {
          return {
            ok: false,
            message: "Session unavailable."
          };
        }

        let result: { ok: boolean; billId?: string; message?: string } = {
          ok: false,
          message: "Unable to create bill."
        };

        setState((current) => {
          const accessBlock = getShopAccessBlock(current, currentShopId);

          if (accessBlock) {
            result = { ok: false, message: accessBlock };
            return current;
          }

          const currentSettingsBundle = current.settingsByShop[currentShopId];
          const shop = current.shops.find((entry) => entry.id === currentShopId);
          const activeBusinessDay = getActiveBusinessDay(current.businessDays, currentShopId);
          const activeShift = getActiveShift(current.shifts, currentShopId, session.id);
          const availableProducts = current.products.filter((product) => product.shopId === currentShopId);
          const validItems = payload.items
            .map((item) => {
              const product = availableProducts.find((candidate) => candidate.id === item.productId);

              const normalizedUnitPrice = Math.round(Math.max(item.unitPrice, 0) * 100) / 100;
              const normalizedDiscountType = item.discountType ?? "fixed";
              const grossLineTotal = Math.round(normalizedUnitPrice * Math.max(item.quantity, 0) * 100) / 100;
              const normalizedDiscountValue = normalizeDiscountValue(
                normalizedDiscountType,
                item.discountValue ?? 0,
                grossLineTotal
              );

              if (!product || product.status !== "active" || item.quantity <= 0 || normalizedUnitPrice <= 0) {
                return null;
              }

              return {
                discountType: normalizedDiscountType,
                discountValue: normalizedDiscountValue,
                product,
                quantity: item.quantity,
                unitPrice: normalizedUnitPrice
              };
            })
            .filter(
              (
                item
              ): item is {
                discountType: "fixed" | "percentage";
                discountValue: number;
                product: Product;
                quantity: number;
                unitPrice: number;
              } => item !== null
            );

          if (validItems.length === 0) {
            result = {
              ok: false,
              message: "Add at least one product or service."
            };

            return current;
          }

          const requestedStockByProductId = validItems.reduce<Record<string, number>>((accumulator, item) => {
            if (item.product.kind === "product") {
              accumulator[item.product.id] = (accumulator[item.product.id] ?? 0) + item.quantity;
            }

            return accumulator;
          }, {});
          const oversoldItem = validItems.find(
            (item) =>
              item.product.kind === "product" &&
              (requestedStockByProductId[item.product.id] ?? 0) > item.product.stockQuantity
          );

          if (oversoldItem) {
            result = {
              ok: false,
              message: `Not enough stock for ${oversoldItem.product.name.en}.`
            };

            return current;
          }

          if (!activeBusinessDay) {
            result = {
              ok: false,
              message: "Start the business day before creating bills."
            };

            return current;
          }

          if (!activeShift) {
            result = {
              ok: false,
              message: "Start your shift before creating bills."
            };

            return current;
          }

          const normalizedCustomer = normalizeCustomer(payload.customer);
          const existingCustomer = findExistingCustomer(current.customers, currentShopId, payload.customer);
          const accountCustomerName = payload.customer.name?.trim() || existingCustomer?.name?.trim();
          const accountCustomerPhone = payload.customer.phone?.trim() || existingCustomer?.phone?.trim();
          const taxSettings = currentSettingsBundle?.tax;
          const phoneConflict = findCustomerPhoneConflict(
            current.customers,
            currentShopId,
            payload.customer.id,
            normalizedCustomer.phone
          );

          if (phoneConflict) {
            result = {
              ok: false,
              message: "Another customer already uses this phone number."
            };

            return current;
          }

          if (payload.paymentMethod === "account" && (!accountCustomerName || !accountCustomerPhone)) {
            result = {
              ok: false,
              message: "Account / pay later requires a saved customer with a name and phone number."
            };

            return current;
          }

          const billDiscountBase = Math.round(
            validItems.reduce((sum, item) => {
              const grossLineTotal = Math.round(item.unitPrice * item.quantity * 100) / 100;
              const itemDiscountAmount = calculateDiscountAmount(
                grossLineTotal,
                item.discountType,
                item.discountValue
              );

              return sum + Math.max(0, grossLineTotal - itemDiscountAmount);
            }, 0) * 100
          ) / 100;
          const normalizedBillDiscountValue = normalizeDiscountValue(
            payload.discountType,
            payload.discountValue,
            billDiscountBase
          );
          const totals = calculateBillTotals({
            items: validItems.map((item) => ({
              discountType: item.discountType,
              discountValue: item.discountValue,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxable: item.product.taxable
            })),
            discountType: payload.discountType,
            discountValue: normalizedBillDiscountValue,
            taxEnabled: taxSettings?.enabled ?? false,
            taxRate: taxSettings?.rate ?? 0,
            taxMode: taxSettings?.mode ?? "inclusive"
          });
          const { paidAmount, dueAmount } = calculatePaidAndDue(totals.total, payload.paymentMethod);

          let customerRecord: Customer | undefined;
          let nextCustomers = current.customers;

          if (shouldPersistCustomer(payload.customer)) {
            if (existingCustomer) {
              customerRecord = {
                ...existingCustomer,
                name: normalizedCustomer.name,
                phone: normalizedCustomer.phone,
                email: normalizedCustomer.email,
                whatsapp: normalizedCustomer.whatsapp
              };
              nextCustomers = current.customers.map((customer) =>
                customer.id === existingCustomer.id ? customerRecord! : customer
              );
            } else {
              customerRecord = {
                id: createId("cust"),
                shopId: currentShopId,
                name: normalizedCustomer.name,
                phone: normalizedCustomer.phone,
                email: normalizedCustomer.email,
                whatsapp: normalizedCustomer.whatsapp,
                createdAt: new Date().toISOString()
              };
              nextCustomers = [customerRecord, ...current.customers];
            }
          } else if (existingCustomer) {
            customerRecord = existingCustomer;
          }

          const billId = createId("bill");
          const createdAt = new Date().toISOString();
          const receiptSequence = current.receiptSequencesByShop[currentShopId] ?? 1;
          const billNumber = `REC-${String(receiptSequence).padStart(6, "0")}`;
          const bill = {
            id: billId,
            shopId: currentShopId,
            customerId: customerRecord?.id,
            businessDate:
              activeBusinessDay.businessDate ??
              getBusinessDateInTimezone(shop?.timezone ?? "Asia/Riyadh", new Date(createdAt)),
            shiftId: activeShift.id,
            number: billNumber,
            status: getBillStatus(payload.paymentMethod, dueAmount),
            customerName: normalizedCustomer.name,
            customerPhone: normalizedCustomer.phone,
            customerEmail: normalizedCustomer.email,
            customerWhatsapp: normalizedCustomer.whatsapp,
            subtotal: totals.subtotal,
            itemDiscountAmount: totals.itemDiscountAmount,
            discountType: payload.discountType,
            discountValue: normalizedBillDiscountValue,
            discountAmount: totals.discountAmount,
            taxName: taxSettings?.enabled ? taxSettings.name : undefined,
            taxRate: taxSettings?.enabled ? taxSettings.rate : 0,
            taxMode: taxSettings?.mode ?? "inclusive",
            taxAmount: totals.taxAmount,
            total: totals.total,
            paidAmount,
            dueAmount,
            paymentMethod: payload.paymentMethod,
            cashierId: session.id,
            createdAt
          };

          const billItems = validItems.map((item) => {
            const grossLineTotal = Math.round(item.unitPrice * item.quantity * 100) / 100;
            const itemDiscountAmount = calculateDiscountAmount(
              grossLineTotal,
              item.discountType,
              item.discountValue
            );

            return {
              id: createId("bill_item"),
              billId,
              productId: item.product.id,
              productName: item.product.name,
              productKind: item.product.kind,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              costPrice: item.product.costPrice,
              discountType: item.discountType,
              discountValue: item.discountValue,
              discountAmount: itemDiscountAmount,
              grossLineTotal,
              lineTotal: Math.round((grossLineTotal - itemDiscountAmount) * 100) / 100
            };
          });

          const paymentRecord =
            paidAmount > 0
              ? [
                  {
                    id: createId("payment"),
                    billId,
                    method: payload.paymentMethod,
                    amount: paidAmount,
                    createdAt
                  }
                ]
              : [];

          result = {
            ok: true,
            billId
          };
          const stockMovementProducts = validItems.filter((item) => item.product.kind === "product");

          return {
            ...current,
            customers: nextCustomers,
            receiptSequencesByShop: {
              ...current.receiptSequencesByShop,
              [currentShopId]: receiptSequence + 1
            },
            bills: [bill, ...current.bills],
            billItems: [...billItems, ...current.billItems],
            payments: [...paymentRecord, ...current.payments],
            ledgerEntries: [
              ...buildSaleLedgerEntries({
                bill,
                billItems,
                createdBy: session.id,
                idFactory: () => createId("ledger")
              }),
              ...current.ledgerEntries
            ],
            inventoryBatches: Object.entries(requestedStockByProductId).reduce(
              (batches, [productId, quantity]) => consumeInventoryBatches(batches, productId, quantity),
              current.inventoryBatches
            ),
            inventoryAdjustments: [
              ...stockMovementProducts.map((item) => ({
                id: createId("inv_adj"),
                shopId: currentShopId,
                productId: item.product.id,
                type: "sale" as const,
                quantity: item.quantity,
                beforeQuantity: item.product.stockQuantity,
                afterQuantity: Math.max(0, item.product.stockQuantity - item.quantity),
                reason: `Sale ${bill.number}`,
                referenceId: billId,
                createdBy: session.id,
                createdAt
              })),
              ...current.inventoryAdjustments
            ],
            products: current.products.map((product) => {
              const soldQuantity = requestedStockByProductId[product.id] ?? 0;

              if (soldQuantity <= 0) {
                return product;
              }

              return {
                ...product,
                stockQuantity: Math.max(0, product.stockQuantity - soldQuantity),
                updatedAt: createdAt
              };
            })
          };
        });

        return result;
      },
      updateBillCustomerContact: ({ billId, customerEmail, customerName, customerPhone, customerWhatsapp }) => {
        if (!currentShopId || !session) {
          return {
            ok: false,
            message: "Session unavailable."
          };
        }

        let result: { ok: boolean; message?: string } = {
          ok: false,
          message: "Unable to update customer details."
        };

        setState((current) => {
          const bill = current.bills.find((entry) => entry.id === billId && entry.shopId === currentShopId);

          if (!bill) {
            result = {
              ok: false,
              message: "Bill not found."
            };
            return current;
          }

          const nextName = customerName !== undefined ? customerName.trim() || undefined : bill.customerName;
          const nextPhone = customerPhone !== undefined ? customerPhone.trim() || undefined : bill.customerPhone;
          const nextEmail = customerEmail !== undefined ? customerEmail.trim() || undefined : bill.customerEmail;
          const nextWhatsapp =
            customerWhatsapp !== undefined ? customerWhatsapp.trim() || undefined : bill.customerWhatsapp;
          const customerDraft = {
            id: bill.customerId,
            name: nextName,
            phone: nextPhone,
            email: nextEmail,
            whatsapp: nextWhatsapp
          };
          const phoneConflict = findCustomerPhoneConflict(
            current.customers,
            currentShopId,
            bill.customerId,
            customerDraft.phone
          );

          if (phoneConflict) {
            result = {
              ok: false,
              message: "Another customer already uses this phone number."
            };
            return current;
          }

          const normalizedCustomer = normalizeCustomer(customerDraft);
          let nextCustomers = current.customers;
          let nextCustomerId = bill.customerId;

          if (shouldPersistCustomer(customerDraft)) {
            const existingCustomer =
              current.customers.find((entry) => entry.id === bill.customerId && entry.shopId === currentShopId) ??
              null;

            if (existingCustomer) {
              nextCustomerId = existingCustomer.id;
              nextCustomers = current.customers.map((entry) =>
                entry.id === existingCustomer.id
                  ? {
                      ...entry,
                      name: normalizedCustomer.name,
                      phone: normalizedCustomer.phone,
                      email: normalizedCustomer.email,
                      whatsapp: normalizedCustomer.whatsapp
                    }
                  : entry
              );
            } else {
              nextCustomerId = createId("cust");
              nextCustomers = [
                {
                  id: nextCustomerId,
                  shopId: currentShopId,
                  name: normalizedCustomer.name,
                  phone: normalizedCustomer.phone,
                  email: normalizedCustomer.email,
                  whatsapp: normalizedCustomer.whatsapp,
                  createdAt: new Date().toISOString()
                },
                ...current.customers
              ];
            }
          }

          result = { ok: true };

          return {
            ...current,
            customers: nextCustomers,
            bills: current.bills.map((entry) =>
              entry.id === bill.id
                ? {
                    ...entry,
                    customerId: nextCustomerId,
                    customerName: nextName,
                    customerPhone: nextPhone,
                    customerEmail: nextEmail,
                    customerWhatsapp: nextWhatsapp
                  }
                : entry
            )
          };
        });

        return result;
      },
      createRefund: (payload) => {
        if (!currentShopId || !session) {
          return {
            ok: false,
            message: "Session unavailable."
          };
        }

        if (session.role !== "shop_admin") {
          return {
            ok: false,
            message: "Only the shop admin can create refunds."
          };
        }

        let result: { ok: boolean; refundId?: string; message?: string } = {
          ok: false,
          message: "Unable to create the refund."
        };

        setState((current) => {
          const accessBlock = getShopAccessBlock(current, currentShopId);

          if (accessBlock) {
            result = { ok: false, message: accessBlock };
            return current;
          }

          const bill = current.bills.find((entry) => entry.id === payload.billId && entry.shopId === currentShopId);

          if (!bill) {
            result = {
              ok: false,
              message: "The original bill could not be found."
            };

            return current;
          }

          if (bill.status === "cancelled") {
            result = {
              ok: false,
              message: "Cancelled bills cannot be refunded."
            };

            return current;
          }

          if (payload.payoutMethod === "account" && !bill.customerId) {
            result = {
              ok: false,
              message: "Account adjustment refunds require a saved customer."
            };

            return current;
          }

          const shop = current.shops.find((entry) => entry.id === currentShopId);
          const billItems = current.billItems.filter((item) => item.billId === bill.id);
          const refundState = calculateBillRefundState({
            billId: bill.id,
            billItems,
            refunds: current.refunds,
            refundItems: current.refundItems
          });

          if (refundState.isFullyRefunded) {
            result = {
              ok: false,
              message: "This bill has already been fully refunded."
            };

            return current;
          }

          const activeBusinessDay = getActiveBusinessDay(current.businessDays, currentShopId);
          const activeShift = getActiveShift(current.shifts, currentShopId, session.id);

          if (!activeBusinessDay) {
            result = {
              ok: false,
              message: "Start the business day before creating refunds."
            };

            return current;
          }

          if (!activeShift) {
            result = {
              ok: false,
              message: "Start your shift before creating refunds."
            };

            return current;
          }

          const reason = payload.reason.trim();

          if (!reason) {
            result = {
              ok: false,
              message: "Add a refund reason before saving."
            };

            return current;
          }

          const selectedItems = payload.items
            .map((entry) => {
              const billItem = billItems.find((item) => item.id === entry.billItemId);
              const refundedQuantity = refundState.refundedQuantitiesByBillItemId[entry.billItemId] ?? 0;
              const remainingQuantity = Math.max(0, (billItem?.quantity ?? 0) - refundedQuantity);

              if (!billItem || entry.quantity <= 0 || entry.quantity > remainingQuantity) {
                return null;
              }

              return {
                billItem,
                quantity: entry.quantity
              };
            })
            .filter(
              (entry): entry is { billItem: (typeof billItems)[number]; quantity: number } => entry !== null
            );

          if (selectedItems.length === 0) {
            result = {
              ok: false,
              message: "Select at least one refundable quantity."
            };

            return current;
          }

          const returnDate = new Date().toISOString();
          const businessDate = activeBusinessDay.businessDate;
          const refundId = createId("refund");
          const getNetUnitRevenue = (billItem: (typeof billItems)[number]) =>
            billItem.quantity > 0 ? billItem.lineTotal / billItem.quantity : billItem.unitPrice;
          const amount = Math.round(
            selectedItems.reduce((sum, entry) => sum - getNetUnitRevenue(entry.billItem) * entry.quantity, 0) * 100
          ) / 100;
          const profitAdjustment = Math.round(
            selectedItems.reduce(
              (sum, entry) => sum - (getNetUnitRevenue(entry.billItem) - entry.billItem.costPrice) * entry.quantity,
              0
            ) * 100
          ) / 100;
          const originalSaleDate =
            bill.businessDate ??
            getBusinessDateInTimezone(shop?.timezone ?? "Asia/Riyadh", new Date(bill.createdAt));
          const refundItems = selectedItems.map((entry) => ({
            id: createId("refund_item"),
            refundId,
            billItemId: entry.billItem.id,
            productId: entry.billItem.productId,
            productName: entry.billItem.productName,
            quantity: entry.quantity,
            unitPrice: Math.round(getNetUnitRevenue(entry.billItem) * 100) / 100,
            costPrice: entry.billItem.costPrice,
            refundAmount: Math.round(-(getNetUnitRevenue(entry.billItem) * entry.quantity) * 100) / 100,
            profitAdjustment:
              Math.round(
                -((getNetUnitRevenue(entry.billItem) - entry.billItem.costPrice) * entry.quantity) * 100
              ) / 100
          }));

          const combinedRefundedQuantities = { ...refundState.refundedQuantitiesByBillItemId };

          refundItems.forEach((refundItem) => {
            combinedRefundedQuantities[refundItem.billItemId] =
              (combinedRefundedQuantities[refundItem.billItemId] ?? 0) + refundItem.quantity;
          });

          const fullyRefunded =
            billItems.length > 0 &&
            billItems.every((item) => (combinedRefundedQuantities[item.id] ?? 0) >= item.quantity);

          result = {
            ok: true,
            refundId
          };
          const stockReturnAdjustments = current.products
            .filter((product) => product.kind === "product")
            .map((product) => {
              const returnedQuantity = refundItems
                .filter((refundItem) => refundItem.productId === product.id)
                .reduce((sum, refundItem) => sum + refundItem.quantity, 0);

              if (returnedQuantity <= 0) {
                return null;
              }

              return {
                id: createId("inv_adj"),
                shopId: currentShopId,
                productId: product.id,
                type: "refund" as const,
                quantity: returnedQuantity,
                beforeQuantity: product.stockQuantity,
                afterQuantity: product.stockQuantity + returnedQuantity,
                reason: `Refund ${bill.number}: ${reason}`,
                referenceId: refundId,
                createdBy: session.id,
                createdAt: returnDate
              };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
          const refundRecord = {
            id: refundId,
            shopId: currentShopId,
            originalBillId: bill.id,
            originalSaleDate,
            businessDate,
            shiftId: activeShift?.id,
            paymentMethod: payload.payoutMethod,
            createdBy: session.id,
            returnDate,
            reason,
            amount,
            profitAdjustment
          };

          return {
            ...current,
            refunds: [refundRecord, ...current.refunds],
            refundItems: [...refundItems, ...current.refundItems],
            ledgerEntries: [
              ...buildRefundLedgerEntries({
                bill,
                refund: refundRecord,
                refundItems,
                billItems,
                createdBy: session.id,
                idFactory: () => createId("ledger")
              }),
              ...current.ledgerEntries
            ],
            inventoryAdjustments: [...stockReturnAdjustments, ...current.inventoryAdjustments],
            inventoryBatches: [
              ...stockReturnAdjustments.map((adjustment) => ({
                id: createId("batch"),
                shopId: currentShopId,
                productId: adjustment.productId,
                batchNumber: `RETURN-${bill.number}`,
                quantity: adjustment.quantity,
                remainingQuantity: adjustment.quantity,
                costPrice:
                  current.products.find((product) => product.id === adjustment.productId)?.costPrice ?? 0,
                receivedAt: returnDate,
                referenceId: refundId,
                createdBy: session.id
              })),
              ...current.inventoryBatches
            ],
            products: current.products.map((product) => {
              const returnedQuantity = refundItems
                .filter((refundItem) => refundItem.productId === product.id)
                .reduce((sum, refundItem) => sum + refundItem.quantity, 0);

              if (returnedQuantity === 0) {
                return product;
              }

              return {
                ...product,
                stockQuantity: product.stockQuantity + returnedQuantity,
                updatedAt: returnDate
              };
            }),
            bills: current.bills.map((entry) =>
              entry.id === bill.id && fullyRefunded
                ? {
                    ...entry,
                    status: "refunded"
                  }
                : entry
            )
          };
        });

        return result;
      },
      upsertDictionaryEntry: (entry) => {
        setState((current) => {
          const existing = current.dictionaryEntries.find(
            (dictionaryEntry) => dictionaryEntry.key === entry.key && dictionaryEntry.locale === entry.locale
          );

          if (existing) {
            return {
              ...current,
              dictionaryEntries: current.dictionaryEntries.map((dictionaryEntry) =>
                dictionaryEntry.id === existing.id
                  ? {
                      ...dictionaryEntry,
                      value: entry.value,
                      updatedAt: new Date().toISOString()
                    }
                  : dictionaryEntry
              )
            };
          }

          return {
            ...current,
            dictionaryEntries: [
              {
                id: createId("dict"),
                updatedAt: new Date().toISOString(),
                ...entry
              },
              ...current.dictionaryEntries
            ]
          };
        });
      },
      removeDictionaryEntry: (key, locale) => {
        setState((current) => ({
          ...current,
          dictionaryEntries: current.dictionaryEntries.filter(
            (entry) => !(entry.key === key && entry.locale === locale)
          )
        }));
      },
      exportDataBackup: () =>
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            product: "Simple POS",
            version: 1,
            state
          },
          null,
          2
        ),
      importDataBackup: (raw) => {
        try {
          const parsed = JSON.parse(raw) as { state?: DemoAppState } | DemoAppState;
          const importedState = "state" in parsed && parsed.state ? parsed.state : parsed;
          const normalizedState = normalizeStoredState(importedState as DemoAppState, ownerBootstrap);

          setState(normalizedState);

          return { ok: true };
        } catch {
          return {
            ok: false,
            message: "This backup file could not be imported."
          };
        }
      }
    }),
    [
      currentBusinessDay,
      currentLicense,
      currentSettings,
      currentShift,
      currentShop,
      currentShopId,
      currentUsers,
      dictionaryOverrides,
      isHydrated,
      session,
      state
    ]
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dir = getDirection(state.ui.locale);
    document.documentElement.lang = state.ui.locale;
  }, [state.ui.locale]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function usePosApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("usePosApp must be used inside AppProvider");
  }

  return context;
}
