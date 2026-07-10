"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BarChart3,
  Bell,
  Building2,
  Copy,
  CreditCard,
  FileClock,
  KeyRound,
  LayoutDashboard,
  Lock,
  Mail,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCog,
  UserRoundPlus,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import type { BillingCycle, DeviceActivation, LicenseStatus, ProductKey, ProductKeyStatus, Shop, User } from "@/types/pos";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { licenseStatusLabelKeys } from "@/lib/i18n";
import { resizeImageFileToDataUrl, uploadImageAssetToCloud } from "@/lib/image-upload";
import {
  ownerClearShopDataScopeDescriptions,
  ownerClearShopDataScopeLabels,
  type OwnerClearShopDataScope
} from "@/lib/shop-data-reset";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

const licenseStatuses: LicenseStatus[] = ["trial", "active", "expired", "locked"];
const productKeyStatuses: ProductKeyStatus[] = ["unused", "active", "expired", "locked", "revoked"];

const ownerSections = [
  { id: "overview", label: "Overview", description: "Owner health", icon: LayoutDashboard },
  { id: "create", label: "Create shop", description: "Prepare client", icon: UserRoundPlus },
  { id: "stores", label: "Stores", description: "Status groups", icon: Building2 },
  { id: "keys", label: "Activation keys", description: "Copy and revoke", icon: KeyRound },
  { id: "billing", label: "Billing", description: "Packages and paid", icon: CreditCard },
  { id: "reports", label: "Reports", description: "Licenses and sales", icon: BarChart3 },
  { id: "branding", label: "Branding", description: "POS company", icon: Palette },
  { id: "access", label: "Access", description: "Support and reset", icon: UserCog },
  { id: "audit", label: "Audit", description: "Activity trail", icon: FileClock }
] as const;

type OwnerSectionId = (typeof ownerSections)[number]["id"];
type StoreFilter = "all" | "active" | "trial" | "expiring" | "locked" | "expired";
type ReportRange = "today" | "week" | "month" | "year" | "custom";

type OwnerCloudSummary = {
  devices: Array<{
    activated_at: string | null;
    browser_info: string | null;
    id: string;
    last_seen_at: string | null;
    product_key_id: string;
    shop_id: string;
  }>;
  productKeys: Array<{
    allowed_devices: number;
    expires_at: string | null;
    id: string;
    key_preview: string;
    shop_id: string;
    status: ProductKeyStatus;
  }>;
  profiles: Array<{
    created_at: string | null;
    email: string;
    id: string;
    is_active: boolean;
    last_login_at: string | null;
    name: string;
    phone: string | null;
    role: User["role"];
    shop_id: string | null;
  }>;
  shops: Array<{
    address: string | null;
    email: string | null;
    id: string;
    license_status: LicenseStatus;
    name: string;
    phone: string | null;
    plan_name: string | null;
  }>;
};

function dateInputValue(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function keyVariant(status: ProductKeyStatus) {
  if (status === "active") {
    return "success" as const;
  }

  if (status === "locked" || status === "revoked" || status === "expired") {
    return "danger" as const;
  }

  return "warning" as const;
}

function licenseVariant(status?: LicenseStatus) {
  if (status === "active") {
    return "success" as const;
  }

  if (status === "locked" || status === "expired") {
    return "danger" as const;
  }

  return "warning" as const;
}

function getEffectiveLicenseStatus(license: { status: LicenseStatus; expiresAt?: string; autoLockDaysAfterExpiry?: number } | undefined) {
  if (!license) {
    return "locked" as LicenseStatus;
  }

  if (license.status === "locked") {
    return "locked" as LicenseStatus;
  }

  if (license.expiresAt) {
    const expiry = new Date(license.expiresAt);
    const now = new Date();

    if (Number.isFinite(expiry.getTime()) && now.getTime() > expiry.getTime()) {
      const daysExpired = Math.floor((now.getTime() - expiry.getTime()) / 86_400_000);
      return daysExpired >= (license.autoLockDaysAfterExpiry ?? 0) ? "locked" : "expired";
    }
  }

  return license.status;
}

function daysUntil(value?: string) {
  if (!value) {
    return null;
  }

  const expiry = new Date(value);

  if (!Number.isFinite(expiry.getTime())) {
    return null;
  }

  return Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
}

function buildRange(range: ReportRange, customStart: string, customEnd: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  }

  if (range === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  }

  if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  if (range === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }

  if (range === "custom") {
    const from = customStart ? new Date(`${customStart}T00:00:00`) : start;
    const to = customEnd ? new Date(`${customEnd}T23:59:59`) : end;

    return { start: from, end: to };
  }

  return { start, end };
}

function previewProductKey(value: string) {
  const normalized = value.trim();

  return normalized.length <= 12 ? normalized : `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

function normalizedMatch(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function mergeUsers(localUsers: User[], cloudUsers: User[]) {
  return Array.from(
    new Map([...cloudUsers, ...localUsers].map((user) => [user.email.trim().toLowerCase() || user.id, user])).values()
  );
}

function mergeDevices(localDevices: DeviceActivation[], cloudDevices: DeviceActivation[]) {
  return Array.from(new Map([...cloudDevices, ...localDevices].map((device) => [device.id, device])).values()).sort(
    (left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)
  );
}

function inRange(value: string | undefined, start: Date, end: Date) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return false;
  }

  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function buildActivationEmailHref(shop: Shop, key: string) {
  const subject = encodeURIComponent(`POS activation key for ${shop.name}`);
  const body = encodeURIComponent(
    [
      `Hello ${shop.name},`,
      "",
      "Your POS account is ready. Use this activation key during installation:",
      "",
      key,
      "",
      "After the key is accepted, create the store admin user inside the POS registration screen.",
      "",
      "Keep this key private. Contact support if you need more device access."
    ].join("\n")
  );

  return `mailto:${shop.email ?? ""}?subject=${subject}&body=${body}`;
}

function SectionButton({
  active,
  description,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  description: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5",
        active ? "border-slate-950 bg-slate-950 text-white shadow-[0_22px_44px_rgba(15,23,42,0.16)]" : "border-slate-200 bg-white hover:border-emerald-200"
      )}
      onClick={onClick}
      type="button"
    >
      <span className={cn("inline-flex rounded-2xl p-2", active ? "bg-white/15" : "bg-emerald-50 text-emerald-700")}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 text-sm font-semibold">{label}</p>
      <p className={cn("mt-1 text-xs leading-5", active ? "text-white/70" : "text-slate-500")}>{description}</p>
    </button>
  );
}

function StoreFilterButton({
  active,
  count,
  label,
  onClick
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
        active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
      <span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs", active ? "bg-white/15" : "bg-slate-100")}>{count}</span>
    </button>
  );
}

export default function OwnerPage() {
  const {
    locale,
    ownerClearShopData,
    ownerCreateShop,
    ownerDeleteShop,
    ownerDeleteProductKey,
    ownerGenerateProductKey,
    ownerRemoveDeviceActivation,
    ownerResetShopUserPassword,
    ownerSetLicense,
    ownerSetProductKeyStatus,
    ownerStartSupportSession,
    ownerUpdateShopProfile,
    setBrandProfile,
    state,
    t
  } = usePosApp();
  const [activeSection, setActiveSection] = useState<OwnerSectionId>("overview");
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");
  const [selectedShopId, setSelectedShopId] = useState(state.shops[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [lastGeneratedKey, setLastGeneratedKey] = useState<{ key: string; shopId: string } | null>(null);
  const [createShopForm, setCreateShopForm] = useState({
    shopName: "",
    email: "",
    setupEmail: "",
    setupPassword: "",
    phone: "",
    address: "",
    planName: "Starter",
    billingCycle: "monthly" as BillingCycle,
    packagePrice: 0,
    totalPaid: 0,
    licenseStatus: "trial" as LicenseStatus,
    expiresAt: "",
    allowedDevices: 2,
    autoLockDaysAfterExpiry: 3
  });
  const [licenseDrafts, setLicenseDrafts] = useState<
    Record<string, { status: LicenseStatus; expiresAt: string; planName: string; billingCycle: BillingCycle; packagePrice: number; totalPaid: number; allowedDevices: number; autoLockDaysAfterExpiry: number; lockReason: string }>
  >({});
  const [shopProfileDrafts, setShopProfileDrafts] = useState<
    Record<string, { shopName: string; email: string; setupEmail: string; setupPassword: string; phone: string; address: string }>
  >({});
  const [cloudSummary, setCloudSummary] = useState<OwnerCloudSummary | null>(null);
  const [cloudSummaryStatus, setCloudSummaryStatus] = useState<string | null>(null);
  const [posName, setPosName] = useState(state.brand.posName);
  const [companyName, setCompanyName] = useState(state.brand.companyName);
  const [companyLogoUrl, setCompanyLogoUrl] = useState(state.brand.logoUrl ?? "");
  const [companyAddress, setCompanyAddress] = useState(state.brand.address ?? "");
  const [companyWebsite, setCompanyWebsite] = useState(state.brand.website ?? "");
  const [supportWhatsapp, setSupportWhatsapp] = useState(state.brand.supportWhatsapp);
  const [supportEmail, setSupportEmail] = useState(state.brand.supportEmail);
  const [supportPhone, setSupportPhone] = useState(state.brand.supportPhone);
  const [receiptImprintEnabled, setReceiptImprintEnabled] = useState(state.brand.receiptImprintEnabled);
  const [receiptImprintText, setReceiptImprintText] = useState(state.brand.receiptImprintText);
  const [loadingTitle, setLoadingTitle] = useState(state.brand.loadingTitle);
  const [loadingMessage, setLoadingMessage] = useState(state.brand.loadingMessage);
  const [loginQuotesText, setLoginQuotesText] = useState(state.brand.loginQuotes.join("\n"));
  const [loginAdEnabled, setLoginAdEnabled] = useState(state.brand.loginAdEnabled);
  const [loginAdTitle, setLoginAdTitle] = useState(state.brand.loginAdTitle);
  const [loginAdMessage, setLoginAdMessage] = useState(state.brand.loginAdMessage);
  const [loginAdImageUrl, setLoginAdImageUrl] = useState(state.brand.loginAdImageUrl ?? "");
  const [loginAdCtaLabel, setLoginAdCtaLabel] = useState(state.brand.loginAdCtaLabel ?? "");
  const [loginAdCtaUrl, setLoginAdCtaUrl] = useState(state.brand.loginAdCtaUrl ?? "");
  const [brandingSavedAt, setBrandingSavedAt] = useState<string | null>(null);
  const [brandingAssetMessage, setBrandingAssetMessage] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [supportReasons, setSupportReasons] = useState<Record<string, string>>({});
  const [selectedResetUserId, setSelectedResetUserId] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [clearDataConfirmName, setClearDataConfirmName] = useState("");
  const [clearDataScope, setClearDataScope] = useState<OwnerClearShopDataScope>("bills");
  const [isClearingShopData, setIsClearingShopData] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [reportRange, setReportRange] = useState<ReportRange>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const ownerUser = state.users.find((user) => user.role === "super_admin" && user.isActive);

  const selectedShop = state.shops.find((shop) => shop.id === selectedShopId) ?? state.shops[0];
  const selectedShopSafeId = selectedShop?.id ?? "";
  const selectedLicense = state.licenses.find((license) => license.shopId === selectedShopSafeId);

  useEffect(() => {
    if (!ownerUser?.email) {
      return;
    }

    let active = true;

    const loadCloudSummary = async () => {
      try {
        const response = await fetch("/api/owner/cloud-summary", {
          cache: "no-store",
          headers: {
            "x-owner-email": ownerUser.email
          }
        });
        const payload = (await response.json()) as ({ ok: true } & OwnerCloudSummary) | { ok: false; message?: string };

        if (!active) {
          return;
        }

        if (!payload.ok) {
          setCloudSummaryStatus(payload.message ?? "Cloud summary is unavailable.");
          return;
        }

        setCloudSummary({
          devices: payload.devices,
          productKeys: payload.productKeys,
          profiles: payload.profiles,
          shops: payload.shops
        });
        setCloudSummaryStatus(`Cloud summary synced at ${new Date().toLocaleTimeString()}.`);
      } catch {
        if (active) {
          setCloudSummaryStatus("Cloud summary is unavailable.");
        }
      }
    };

    void loadCloudSummary();

    return () => {
      active = false;
    };
  }, [ownerUser?.email]);

  const getCloudShopIds = (shop: Shop) => {
    const localKeyPreviews = state.productKeys
      .filter((key) => key.shopId === shop.id)
      .map((key) => previewProductKey(key.key));

    return (
      cloudSummary?.shops
        .filter((cloudShop) => {
          const cloudKeyPreviews = cloudSummary.productKeys
            .filter((key) => key.shop_id === cloudShop.id)
            .map((key) => key.key_preview);

          return (
            cloudShop.id === shop.id ||
            cloudKeyPreviews.some((preview) => localKeyPreviews.includes(preview)) ||
            (normalizedMatch(cloudShop.email) && normalizedMatch(cloudShop.email) === normalizedMatch(shop.email)) ||
            (normalizedMatch(cloudShop.phone) && normalizedMatch(cloudShop.phone) === normalizedMatch(shop.phone)) ||
            (normalizedMatch(cloudShop.name) && normalizedMatch(cloudShop.name) === normalizedMatch(shop.name))
          );
        })
        .map((cloudShop) => cloudShop.id) ?? []
    );
  };

  const getStoreUsers = (shop: Shop) => {
    const cloudShopIds = getCloudShopIds(shop);
    const localUsers = state.users.filter((user) => user.shopId === shop.id);
    const cloudUsers: User[] =
      cloudSummary?.profiles
        .filter((profile) => profile.shop_id && cloudShopIds.includes(profile.shop_id))
        .map((profile) => ({
          id: profile.id,
          shopId: shop.id,
          name: profile.name,
          email: profile.email,
          phone: profile.phone ?? undefined,
          role: profile.role,
          isActive: profile.is_active,
          lastLoginAt: profile.last_login_at ?? undefined,
          createdAt: profile.created_at ?? new Date().toISOString()
        })) ?? [];

    return mergeUsers(localUsers, cloudUsers);
  };

  const getStoreDevices = (shop: Shop) => {
    const cloudShopIds = getCloudShopIds(shop);
    const localDevices = state.deviceActivations.filter((device) => device.shopId === shop.id);
    const cloudDevices: DeviceActivation[] =
      cloudSummary?.devices
        .filter((device) => cloudShopIds.includes(device.shop_id))
        .map((device) => ({
          id: device.id,
          shopId: shop.id,
          productKeyId: device.product_key_id,
          browserInfo: device.browser_info ?? "Unknown browser",
          activatedAt: device.activated_at ?? new Date().toISOString(),
          lastSeenAt: device.last_seen_at ?? device.activated_at ?? new Date().toISOString()
        })) ?? [];

    return mergeDevices(localDevices, cloudDevices);
  };

  const selectedUsers = selectedShop ? getStoreUsers(selectedShop) : [];
  const selectedKeys = state.productKeys.filter((key) => key.shopId === selectedShopSafeId);
  const selectedDevices = selectedShop ? getStoreDevices(selectedShop) : [];

  const ownerMetrics = useMemo(() => {
    const rows = state.shops.map((shop) => {
      const license = state.licenses.find((entry) => entry.shopId === shop.id);
      const status = getEffectiveLicenseStatus(license);
      const expiryDays = daysUntil(license?.expiresAt);
      const productKeys = state.productKeys.filter((entry) => entry.shopId === shop.id);
      const users = getStoreUsers(shop);
      const devices = getStoreDevices(shop);

      return { shop, license, status, expiryDays, productKeys, users, devices };
    });

    const counts = {
      all: rows.length,
      active: rows.filter((row) => row.status === "active").length,
      trial: rows.filter((row) => row.status === "trial").length,
      expiring: rows.filter((row) => row.expiryDays !== null && row.expiryDays >= 0 && row.expiryDays <= 7 && row.status !== "locked").length,
      locked: rows.filter((row) => row.status === "locked").length,
      expired: rows.filter((row) => row.status === "expired").length
    };

    return { rows, counts };
  }, [cloudSummary, state.deviceActivations, state.licenses, state.productKeys, state.shops, state.users]);

  const filteredStoreRows = ownerMetrics.rows.filter((row) => {
    if (storeFilter === "all") {
      return true;
    }

    if (storeFilter === "expiring") {
      return row.expiryDays !== null && row.expiryDays >= 0 && row.expiryDays <= 7 && row.status !== "locked";
    }

    return row.status === storeFilter;
  });

  const reportMetrics = useMemo(() => {
    const { start, end } = buildRange(reportRange, customStart, customEnd);
    const bills = state.bills.filter((bill) => bill.status !== "cancelled" && inRange(bill.createdAt, start, end));
    const refunds = state.refunds.filter((refund) => inRange(refund.returnDate, start, end));
    const customerSales = bills.reduce((sum, bill) => sum + bill.total, 0);
    const refundTotal = refunds.reduce((sum, refund) => sum + Math.abs(refund.amount), 0);
    const netSales = customerSales - refundTotal;
    const paid = bills.reduce((sum, bill) => sum + bill.paidAmount, 0);
    const due = bills.reduce((sum, bill) => sum + bill.dueAmount, 0);
    const activeUsers = ownerMetrics.rows.reduce((sum, row) => sum + row.users.filter((user) => user.isActive).length, 0);
    const connectedDevices = ownerMetrics.rows.reduce((sum, row) => sum + row.devices.length, 0);
    const expiringSoon = ownerMetrics.counts.expiring;

    return { start, end, bills, refunds, customerSales, refundTotal, netSales, paid, due, activeUsers, connectedDevices, expiringSoon };
  }, [customEnd, customStart, ownerMetrics, reportRange, state.bills, state.refunds]);

  const showResult = (result: { ok: boolean; message?: string; productKey?: string; shopId?: string }, contextShopId?: string) => {
    if (result.ok) {
      if (result.productKey) {
        setLastGeneratedKey({ key: result.productKey, shopId: contextShopId ?? result.shopId ?? selectedShopSafeId });
        setMessage("Activation key is ready. Copy it or email it to the store owner.");
        return;
      }

      setMessage(result.message ?? "Saved.");
      return;
    }

    setMessage(result.message ?? "Action failed.");
  };

  const removeConnectedDevice = (device: DeviceActivation) => {
    const result = ownerRemoveDeviceActivation({
      browserInfo: device.browserInfo,
      deviceActivationId: device.id,
      shopId: device.shopId
    });

    if (result.ok) {
      setCloudSummary((current) =>
        current
          ? {
              ...current,
              devices: current.devices.filter((entry) => entry.id !== device.id)
            }
          : current
      );
    }

    showResult(result);
  };

  const getLicenseDraft = (shopId: string) => {
    const shop = state.shops.find((entry) => entry.id === shopId);
    const license = state.licenses.find((entry) => entry.shopId === shopId);
    const productKey = state.productKeys.find((entry) => entry.shopId === shopId);

    return (
      licenseDrafts[shopId] ?? {
        status: license?.status ?? "trial",
        expiresAt: dateInputValue(license?.expiresAt),
        planName: shop?.planName ?? "Starter",
        billingCycle: shop?.billingCycle ?? "monthly",
        packagePrice: shop?.packagePrice ?? 0,
        totalPaid: shop?.totalPaid ?? 0,
        allowedDevices: productKey?.allowedDevices ?? 2,
        autoLockDaysAfterExpiry: license?.autoLockDaysAfterExpiry ?? 3,
        lockReason: license?.lockReason ?? "Payment not received."
      }
    );
  };

  const getShopProfileDraft = (shop: Shop) =>
    shopProfileDrafts[shop.id] ?? {
      shopName: shop.name,
      email: shop.email ?? "",
      setupEmail: shop.setupEmail ?? "",
      setupPassword: "",
      phone: shop.phone ?? "",
      address: shop.address ?? ""
    };

  const updateLicenseDraft = (shopId: string, values: Partial<ReturnType<typeof getLicenseDraft>>) => {
    setLicenseDrafts((current) => ({
      ...current,
      [shopId]: {
        ...getLicenseDraft(shopId),
        ...values
      }
    }));
  };

  const updateShopProfileDraft = (shop: Shop, values: Partial<ReturnType<typeof getShopProfileDraft>>) => {
    setShopProfileDrafts((current) => ({
      ...current,
      [shop.id]: {
        ...getShopProfileDraft(shop),
        ...values
      }
    }));
  };

  const saveShopProfile = (shop: Shop) => {
    const draft = getShopProfileDraft(shop);
    const result = ownerUpdateShopProfile({
      shopId: shop.id,
      shopName: draft.shopName,
      email: draft.email,
      setupEmail: draft.setupEmail,
      setupPassword: draft.setupPassword,
      phone: draft.phone,
      address: draft.address
    });

    showResult(result);

    if (result.ok) {
      setShopProfileDrafts((current) => ({
        ...current,
        [shop.id]: {
          ...draft,
          setupPassword: ""
        }
      }));
    }
  };

  const copyActivationKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setMessage("Activation key copied.");
    } catch {
      setMessage(`Copy failed. Select and copy manually: ${key}`);
    }
  };

  const createShop = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = ownerCreateShop(createShopForm);

    showResult(result, result.shopId);

    if (result.ok) {
      setSelectedShopId(result.shopId ?? selectedShopSafeId);
      setActiveSection("keys");
      setCreateShopForm((current) => ({
        ...current,
        shopName: "",
        email: "",
        setupEmail: "",
        setupPassword: "",
        phone: "",
        address: ""
      }));
    }
  };

  const saveLicense = (shopId: string, statusOverride?: LicenseStatus) => {
    const draft = getLicenseDraft(shopId);

    showResult(
      ownerSetLicense({
        shopId,
        status: statusOverride ?? draft.status,
        expiresAt: draft.expiresAt,
        planName: draft.planName,
        billingCycle: draft.billingCycle,
        packagePrice: draft.packagePrice,
        totalPaid: draft.totalPaid,
        allowedDevices: draft.allowedDevices,
        autoLockDaysAfterExpiry: draft.autoLockDaysAfterExpiry,
        lockReason: draft.lockReason
      })
    );
  };

  const generateKey = (shopId: string) => {
    const draft = getLicenseDraft(shopId);
    showResult(ownerGenerateProductKey({ shopId, allowedDevices: draft.allowedDevices, expiresAt: draft.expiresAt }), shopId);
  };

  const clearSelectedShopData = async () => {
    if (!selectedShop || isClearingShopData) {
      return;
    }

    setIsClearingShopData(true);

    try {
      const result = await ownerClearShopData({
        confirmName: clearDataConfirmName,
        scope: clearDataScope,
        shopId: selectedShop.id
      });

      showResult(result);

      if (result.ok) {
        setClearDataConfirmName("");
      }
    } finally {
      setIsClearingShopData(false);
    }
  };

  const loadCompanyLogo = async (file?: File) => {
    if (!file) {
      return;
    }

    setBrandingAssetMessage(null);

    try {
      const result = await resizeImageFileToDataUrl(file, {
        maxWidth: 512,
        maxHeight: 512,
        outputType: "image/jpeg",
        quality: 0.9
      });
      const upload = await uploadImageAssetToCloud({
        dataUrl: result.dataUrl,
        fileName: file.name,
        ownerEmail: ownerUser?.email,
        scope: "owner-logo"
      });

      setCompanyLogoUrl(upload.url);
      setBrandingSavedAt(null);
      setBrandingAssetMessage({
        tone: "success",
        message: upload.storedInCloud
          ? `Company logo saved securely in Supabase Storage at ${result.width}x${result.height}.`
          : `Company logo optimized to ${result.width}x${result.height}. Cloud upload fallback was used.`
      });
    } catch (error) {
      setBrandingAssetMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "Company logo upload failed."
      });
    }
  };

  const loadLoginAdImage = async (file?: File) => {
    if (!file) {
      return;
    }

    setBrandingAssetMessage(null);

    try {
      const result = await resizeImageFileToDataUrl(file, {
        maxWidth: 1600,
        maxHeight: 900,
        outputType: "image/jpeg",
        quality: 0.86
      });
      const upload = await uploadImageAssetToCloud({
        dataUrl: result.dataUrl,
        fileName: file.name,
        ownerEmail: ownerUser?.email,
        scope: "owner-ad"
      });

      setLoginAdImageUrl(upload.url);
      setBrandingSavedAt(null);
      setBrandingAssetMessage({
        tone: "success",
        message: upload.storedInCloud
          ? `Login ad saved securely in Supabase Storage at ${result.width}x${result.height}.`
          : `Login ad optimized to ${result.width}x${result.height}. Cloud upload fallback was used.`
      });
    } catch (error) {
      setBrandingAssetMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "Login ad image upload failed."
      });
    }
  };

  const renderStorePicker = () => (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Client stores</p>
          <h3 className="mt-1 font-display text-xl font-semibold text-slate-950">Select store</h3>
        </div>
        <Badge variant="neutral">{state.shops.length}</Badge>
      </div>
      <div className="mt-4 grid max-h-[520px] gap-2 overflow-y-auto pr-1">
        {filteredStoreRows.map((row) => (
          <button
            className={cn(
              "rounded-[22px] border p-4 text-left transition",
              selectedShopSafeId === row.shop.id
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-950 hover:border-emerald-200"
            )}
            key={row.shop.id}
            onClick={() => setSelectedShopId(row.shop.id)}
            type="button"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{row.shop.name}</p>
              <Badge variant={licenseVariant(row.status)}>{row.status}</Badge>
            </div>
            <p className={cn("mt-2 text-xs leading-5", selectedShopSafeId === row.shop.id ? "text-white/70" : "text-slate-500")}>
              {row.shop.planName} | {row.users.length} users | {row.devices.length} devices
            </p>
          </button>
        ))}
        {filteredStoreRows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">No stores in this status.</p>
        ) : null}
      </div>
    </Card>
  );

  const renderActivationCard = () => {
    if (!lastGeneratedKey) {
      return null;
    }

    const shop = state.shops.find((entry) => entry.id === lastGeneratedKey.shopId);

    if (!shop) {
      return null;
    }

    return (
      <Card className="border-emerald-200 bg-emerald-50/80 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Activation key ready</p>
            <p className="mt-2 break-all font-mono text-sm font-semibold text-slate-950">{lastGeneratedKey.key}</p>
            <p className="mt-2 text-xs text-slate-600">{lastGeneratedKey.key.length} characters for {shop.name}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => copyActivationKey(lastGeneratedKey.key)} variant="secondary">
              <Copy className="mr-2 h-4 w-4" />
              Copy key
            </Button>
            <Button asChild>
              <a href={buildActivationEmailHref(shop, lastGeneratedKey.key)}>
                <Mail className="mr-2 h-4 w-4" />
                Email key
              </a>
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  const renderOverview = () => (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total stores", value: ownerMetrics.counts.all, icon: Building2 },
          { label: "Active stores", value: ownerMetrics.counts.active, icon: ShieldCheck },
          { label: "Going to expire", value: ownerMetrics.counts.expiring, icon: Bell },
          { label: "Locked stores", value: ownerMetrics.counts.locked, icon: Lock }
        ].map((item) => {
          const Icon = item.icon;

          return (
            <Card className="p-5" key={item.label}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-slate-950">{item.value}</p>
                </div>
                <span className="rounded-2xl bg-slate-950 p-3 text-white">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { title: "Create client shop", desc: "Prepare shop, license, device limit, and first key. Store admin is created during installation.", section: "create" as OwnerSectionId, icon: UserRoundPlus },
          { title: "Control active shops", desc: "Filter active, locked, expired, and expiring stores without mixing CRM tickets into owner work.", section: "stores" as OwnerSectionId, icon: Building2 },
          { title: "Owner reports", desc: "Track processed sales, active users, devices, license status, expiring shops, and locked shops.", section: "reports" as OwnerSectionId, icon: BarChart3 }
        ].map((item) => {
          const Icon = item.icon;

          return (
            <Card className="p-6" key={item.title}>
              <span className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-display text-2xl font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.desc}</p>
              <Button className="mt-5" onClick={() => setActiveSection(item.section)} variant="secondary">
                Open
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderCreateShop = () => (
    <Card className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Shop setup</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Create shop and activation key</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Owner side prepares the shop setup login, license, device limit, and activation key. The store creates its own admin user during installation.
          </p>
        </div>
        <Badge variant="success">Local setup credentials</Badge>
      </div>

      <form className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={createShop}>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Shop name</span>
          <Input value={createShopForm.shopName} onChange={(event) => setCreateShopForm((current) => ({ ...current, shopName: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Store owner email</span>
          <Input type="email" value={createShopForm.email} onChange={(event) => setCreateShopForm((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Setup login email</span>
          <Input type="email" value={createShopForm.setupEmail} onChange={(event) => setCreateShopForm((current) => ({ ...current, setupEmail: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Setup login password</span>
          <Input minLength={8} type="password" value={createShopForm.setupPassword} onChange={(event) => setCreateShopForm((current) => ({ ...current, setupPassword: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Phone</span>
          <Input value={createShopForm.phone} onChange={(event) => setCreateShopForm((current) => ({ ...current, phone: event.target.value }))} />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold text-slate-950">Address</span>
          <Input value={createShopForm.address} onChange={(event) => setCreateShopForm((current) => ({ ...current, address: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Plan</span>
          <Input value={createShopForm.planName} onChange={(event) => setCreateShopForm((current) => ({ ...current, planName: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Billing cycle</span>
          <Select value={createShopForm.billingCycle} onChange={(event) => setCreateShopForm((current) => ({ ...current, billingCycle: event.target.value as BillingCycle }))}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Package amount</span>
          <Input min={0} type="number" value={createShopForm.packagePrice} onChange={(event) => setCreateShopForm((current) => ({ ...current, packagePrice: Number(event.target.value) }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Amount paid</span>
          <Input min={0} type="number" value={createShopForm.totalPaid} onChange={(event) => setCreateShopForm((current) => ({ ...current, totalPaid: Number(event.target.value) }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">License status</span>
          <Select value={createShopForm.licenseStatus} onChange={(event) => setCreateShopForm((current) => ({ ...current, licenseStatus: event.target.value as LicenseStatus }))}>
            {licenseStatuses.map((status) => (
              <option key={status} value={status}>
                {t(licenseStatusLabelKeys[status])}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Expiry date</span>
          <Input type="date" value={createShopForm.expiresAt} onChange={(event) => setCreateShopForm((current) => ({ ...current, expiresAt: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Allowed devices</span>
          <Input min={1} type="number" value={createShopForm.allowedDevices} onChange={(event) => setCreateShopForm((current) => ({ ...current, allowedDevices: Number(event.target.value) }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Auto-lock days after expiry</span>
          <Input min={0} type="number" value={createShopForm.autoLockDaysAfterExpiry} onChange={(event) => setCreateShopForm((current) => ({ ...current, autoLockDaysAfterExpiry: Number(event.target.value) }))} />
        </label>
        <Button className="xl:col-span-3" type="submit">
          Create shop and key
        </Button>
      </form>
    </Card>
  );

  const renderStores = () => {
    const draft = selectedShopSafeId ? getLicenseDraft(selectedShopSafeId) : null;
    const profileDraft = selectedShop ? getShopProfileDraft(selectedShop) : null;

    return (
      <div className="grid gap-6">
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["active", "Active"],
              ["trial", "Trial"],
              ["expiring", "Going to expire"],
              ["locked", "Locked"],
              ["expired", "Expired"]
            ].map(([id, label]) => (
              <StoreFilterButton
                active={storeFilter === id}
                count={ownerMetrics.counts[id as StoreFilter]}
                key={id}
                label={label}
                onClick={() => setStoreFilter(id as StoreFilter)}
              />
            ))}
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          {renderStorePicker()}

          <div className="grid gap-5">
            <Card className="p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">License control</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">{selectedShop?.name ?? "No store selected"}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {selectedShop?.address || "No address saved."}
                  </p>
                  {selectedShop?.setupEmail ? (
                    <p className="mt-2 text-sm font-semibold text-slate-700">Setup login: {selectedShop.setupEmail}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={licenseVariant(getEffectiveLicenseStatus(selectedLicense))}>{getEffectiveLicenseStatus(selectedLicense)}</Badge>
                  <Badge variant="neutral">{selectedUsers.length} users</Badge>
                  <Badge variant="neutral">{selectedDevices.length} devices</Badge>
                </div>
              </div>

              {selectedShop && draft ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">License status</span>
                    <Select value={draft.status} onChange={(event) => updateLicenseDraft(selectedShop.id, { status: event.target.value as LicenseStatus })}>
                      {licenseStatuses.map((status) => (
                        <option key={status} value={status}>
                          {t(licenseStatusLabelKeys[status])}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Plan</span>
                    <Input value={draft.planName} onChange={(event) => updateLicenseDraft(selectedShop.id, { planName: event.target.value })} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Expiry date</span>
                    <Input type="date" value={draft.expiresAt} onChange={(event) => updateLicenseDraft(selectedShop.id, { expiresAt: event.target.value })} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Allowed devices</span>
                    <Input min={1} type="number" value={draft.allowedDevices} onChange={(event) => updateLicenseDraft(selectedShop.id, { allowedDevices: Number(event.target.value) })} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Auto-lock after expiry</span>
                    <Input min={0} type="number" value={draft.autoLockDaysAfterExpiry} onChange={(event) => updateLicenseDraft(selectedShop.id, { autoLockDaysAfterExpiry: Number(event.target.value) })} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Lock reason</span>
                    <Input value={draft.lockReason} onChange={(event) => updateLicenseDraft(selectedShop.id, { lockReason: event.target.value })} />
                  </label>
                  <div className="flex flex-wrap gap-2 xl:col-span-3">
                    <Button onClick={() => saveLicense(selectedShop.id)} variant="secondary">Save license and device limit</Button>
                    <Button onClick={() => saveLicense(selectedShop.id, "locked")} variant="danger">
                      <Lock className="mr-2 h-4 w-4" />
                      Lock now
                    </Button>
                    <Button onClick={() => saveLicense(selectedShop.id, "active")}>
                      <Unlock className="mr-2 h-4 w-4" />
                      Unlock now
                    </Button>
                    <Button onClick={() => generateKey(selectedShop.id)} variant="secondary">
                      <KeyRound className="mr-2 h-4 w-4" />
                      Generate new key
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>

            {selectedShop && profileDraft ? (
              <Card className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Store profile</p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">Edit store details and setup login</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      These details control the shop setup screen and the saved shop profile. Leave password blank to keep the existing password.
                    </p>
                  </div>
                  <Badge variant="neutral">Owner editable</Badge>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Store name</span>
                    <Input value={profileDraft.shopName} onChange={(event) => updateShopProfileDraft(selectedShop, { shopName: event.target.value })} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Store email</span>
                    <Input type="email" value={profileDraft.email} onChange={(event) => updateShopProfileDraft(selectedShop, { email: event.target.value })} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Setup login email</span>
                    <Input type="email" value={profileDraft.setupEmail} onChange={(event) => updateShopProfileDraft(selectedShop, { setupEmail: event.target.value })} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">New setup password</span>
                    <Input minLength={8} placeholder="Leave blank to keep current" type="password" value={profileDraft.setupPassword} onChange={(event) => updateShopProfileDraft(selectedShop, { setupPassword: event.target.value })} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Phone</span>
                    <Input value={profileDraft.phone} onChange={(event) => updateShopProfileDraft(selectedShop, { phone: event.target.value })} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Address</span>
                    <Input value={profileDraft.address} onChange={(event) => updateShopProfileDraft(selectedShop, { address: event.target.value })} />
                  </label>
                  <Button className="xl:col-span-3" onClick={() => saveShopProfile(selectedShop)} variant="secondary">
                    Save store profile
                  </Button>
                </div>
              </Card>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="font-display text-2xl font-semibold text-slate-950">Connected devices</h3>
                <div className="mt-4 grid max-h-[360px] gap-3 overflow-y-auto pr-1">
                  {selectedDevices.length > 0 ? (
                    selectedDevices.map((device) => (
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4" key={device.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="rounded-2xl bg-white p-2 text-slate-950">
                              <MonitorSmartphone className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold text-slate-950">{device.browserInfo}</p>
                              <p className="mt-1 text-xs text-slate-500">Last seen {formatDateTime(device.lastSeenAt, locale)}</p>
                            </div>
                          </div>
                          <Button size="sm" onClick={() => removeConnectedDevice(device)} variant="danger">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">No devices activated yet.</p>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-display text-2xl font-semibold text-slate-950">Store users</h3>
                <div className="mt-4 grid max-h-[360px] gap-3 overflow-y-auto pr-1">
                  {selectedUsers.length > 0 ? (
                    selectedUsers.map((user) => (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4" key={user.id}>
                        <div>
                          <p className="font-semibold text-slate-950">{user.name}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={user.isActive ? "success" : "neutral"}>{user.isActive ? "active" : "inactive"}</Badge>
                          <Badge variant="neutral">{user.role}</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                      No user yet. Store admin will appear after installation with the activation key.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            {selectedShop ? (
              <Card className="border-amber-200 bg-amber-50/60 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Data reset</p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">Clear selected store data</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      This keeps the store account, users, license, activation key, devices, and settings. Type the exact store name before clearing:{" "}
                      <span className="font-semibold">{selectedShop.name}</span>
                    </p>
                  </div>
                  <Badge variant="warning">Cloud reset</Badge>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-[0.65fr_1fr_auto] lg:items-end">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Clear type</span>
                    <Select value={clearDataScope} onChange={(event) => setClearDataScope(event.target.value as OwnerClearShopDataScope)}>
                      {(["bills", "products", "all"] as const).map((scope) => (
                        <option key={scope} value={scope}>
                          {ownerClearShopDataScopeLabels[scope]}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Confirm store name</span>
                    <Input
                      placeholder={selectedShop.name}
                      value={clearDataConfirmName}
                      onChange={(event) => setClearDataConfirmName(event.target.value)}
                    />
                  </label>
                  <Button
                    disabled={clearDataConfirmName !== selectedShop.name || isClearingShopData}
                    onClick={() => void clearSelectedShopData()}
                    variant="danger"
                  >
                    {isClearingShopData ? "Clearing..." : "Clear data"}
                  </Button>
                </div>
                <p className="mt-3 rounded-3xl border border-amber-200 bg-white/70 p-4 text-sm leading-6 text-slate-700">
                  {ownerClearShopDataScopeDescriptions[clearDataScope]}
                </p>
              </Card>
            ) : null}

            {selectedShop ? (
              <Card className="border-red-100 bg-red-50/50 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-700">Danger zone</p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">Delete store and all local data</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Use this only for reset testing. Type the exact store name: <span className="font-semibold">{selectedShop.name}</span>
                    </p>
                  </div>
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                  <Input
                    placeholder={selectedShop.name}
                    value={deleteConfirmName}
                    onChange={(event) => setDeleteConfirmName(event.target.value)}
                  />
                  <Button
                    disabled={deleteConfirmName !== selectedShop.name}
                    onClick={() => {
                      const result = ownerDeleteShop({ shopId: selectedShop.id, confirmName: deleteConfirmName });
                      showResult(result);
                      if (result.ok) {
                        setDeleteConfirmName("");
                        const remainingShop = state.shops.find((shop) => shop.id !== selectedShop.id);
                        setSelectedShopId(remainingShop?.id ?? "");
                      }
                    }}
                    variant="danger"
                  >
                    Delete store
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderKeyRow = (productKey: ProductKey) => {
    const shop = state.shops.find((entry) => entry.id === productKey.shopId);

    return (
      <div className="grid gap-4 border-t border-slate-200 p-4 xl:grid-cols-[1.2fr_0.35fr_0.35fr_1fr] xl:items-center" key={productKey.id}>
        <div>
          <p className="break-all font-mono text-sm font-semibold text-slate-950">{productKey.key}</p>
          <p className="mt-1 text-xs text-slate-500">
            {productKey.key.length} chars | {shop?.name ?? "Unknown shop"} | Expires {formatDateTime(productKey.expiresAt, locale)}
          </p>
        </div>
        <Badge variant={keyVariant(productKey.status)}>{productKey.status}</Badge>
        <span className="text-sm font-semibold text-slate-700">{productKey.allowedDevices} devices</span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => copyActivationKey(productKey.key)} variant="secondary">
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
          <Button asChild size="sm" variant="secondary">
            <a href={shop ? buildActivationEmailHref(shop, productKey.key) : "mailto:"}>
              <Mail className="mr-2 h-4 w-4" />
              Email
            </a>
          </Button>
          <Select value={productKey.status} onChange={(event) => showResult(ownerSetProductKeyStatus({ productKeyId: productKey.id, status: event.target.value as ProductKeyStatus }))}>
            {productKeyStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            onClick={() => showResult(ownerDeleteProductKey({ productKeyId: productKey.id }), productKey.shopId)}
            variant="danger"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    );
  };

  const renderKeys = () => (
    <div className="grid gap-6">
      {renderActivationCard()}
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Activation control</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Product keys</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Keys are 30+ characters, copyable, emailable, revocable, and bound to device limits.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[280px_auto]">
            <Select value={selectedShopSafeId} onChange={(event) => setSelectedShopId(event.target.value)}>
              {state.shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </Select>
            <Button disabled={!selectedShop} onClick={() => selectedShop && generateKey(selectedShop.id)}>
              <KeyRound className="mr-2 h-4 w-4" />
              Generate key
            </Button>
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="grid gap-2 bg-slate-50 p-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 xl:grid-cols-[1.2fr_0.35fr_0.35fr_1fr]">
          <span>Activation key</span>
          <span>Status</span>
          <span>Limit</span>
          <span>Actions</span>
        </div>
        {(selectedShop ? selectedKeys : state.productKeys).length > 0 ? (
          (selectedShop ? selectedKeys : state.productKeys).map(renderKeyRow)
        ) : (
          <p className="p-6 text-sm text-slate-600">No product keys for this store yet.</p>
        )}
      </Card>
    </div>
  );

  const renderBilling = () => {
    const draft = selectedShopSafeId ? getLicenseDraft(selectedShopSafeId) : null;
    const recurring = state.shops.reduce(
      (totals, shop) => {
        const amount = shop.packagePrice ?? 0;
        const cycle = shop.billingCycle ?? "monthly";

        return {
          ...totals,
          [cycle]: totals[cycle] + amount,
          totalPaid: totals.totalPaid + (shop.totalPaid ?? 0),
          openPackageBalance: totals.openPackageBalance + Math.max(amount - (shop.totalPaid ?? 0), 0)
        };
      },
      { monthly: 0, quarterly: 0, yearly: 0, totalPaid: 0, openPackageBalance: 0 } satisfies Record<BillingCycle, number> & {
        totalPaid: number;
        openPackageBalance: number;
      }
    );

    return (
      <div className="grid gap-6">
        <Card className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Owner billing</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Packages and store payments</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Track what each store is paying, the billing cycle, total amount collected, and the package balance.
              </p>
            </div>
            <Select className="max-w-sm" value={selectedShopSafeId} onChange={(event) => setSelectedShopId(event.target.value)}>
              {state.shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </Select>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Monthly packages", value: formatCurrency(recurring.monthly, "SAR", locale) },
            { label: "Quarterly packages", value: formatCurrency(recurring.quarterly, "SAR", locale) },
            { label: "Yearly packages", value: formatCurrency(recurring.yearly, "SAR", locale) },
            { label: "Total collected", value: formatCurrency(recurring.totalPaid, "SAR", locale) },
            { label: "Open package balance", value: formatCurrency(recurring.openPackageBalance, "SAR", locale) }
          ].map((item) => (
            <Card className="p-5" key={item.label}>
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 font-display text-2xl font-semibold text-slate-950">{item.value}</p>
            </Card>
          ))}
        </div>

        {selectedShop && draft ? (
          <Card className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Selected store</p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">{selectedShop.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Update this store&apos;s package and payment record. This is owner billing, separate from the shop&apos;s POS sales.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={licenseVariant(draft.status)}>{draft.status}</Badge>
                <Badge variant="neutral">{draft.allowedDevices} devices</Badge>
                <Badge variant="success">{selectedShop.billingCycle ?? "monthly"}</Badge>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-950">Plan name</span>
                <Input value={draft.planName} onChange={(event) => updateLicenseDraft(selectedShop.id, { planName: event.target.value })} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-950">Billing cycle</span>
                <Select value={draft.billingCycle} onChange={(event) => updateLicenseDraft(selectedShop.id, { billingCycle: event.target.value as BillingCycle })}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-950">Package amount</span>
                <Input min={0} type="number" value={draft.packagePrice} onChange={(event) => updateLicenseDraft(selectedShop.id, { packagePrice: Number(event.target.value) })} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-950">Total paid</span>
                <Input min={0} type="number" value={draft.totalPaid} onChange={(event) => updateLicenseDraft(selectedShop.id, { totalPaid: Number(event.target.value) })} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-950">License status</span>
                <Select value={draft.status} onChange={(event) => updateLicenseDraft(selectedShop.id, { status: event.target.value as LicenseStatus })}>
                  {licenseStatuses.map((status) => (
                    <option key={status} value={status}>{t(licenseStatusLabelKeys[status])}</option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-950">Expiry date</span>
                <Input type="date" value={draft.expiresAt} onChange={(event) => updateLicenseDraft(selectedShop.id, { expiresAt: event.target.value })} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-950">Device limit</span>
                <Input min={1} type="number" value={draft.allowedDevices} onChange={(event) => updateLicenseDraft(selectedShop.id, { allowedDevices: Number(event.target.value) })} />
              </label>
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Balance</p>
                <p className="mt-2 font-display text-2xl font-semibold text-slate-950">
                  {formatCurrency(Math.max(draft.packagePrice - draft.totalPaid, 0), "SAR", locale)}
                </p>
              </div>
              <Button className="xl:col-span-4" onClick={() => saveLicense(selectedShop.id)}>
                Save billing and license
              </Button>
            </div>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <div className="grid gap-2 bg-slate-50 p-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 xl:grid-cols-[1fr_0.35fr_0.35fr_0.35fr_0.35fr_0.35fr]">
            <span>Store</span>
            <span>Cycle</span>
            <span>Package</span>
            <span>Total paid</span>
            <span>Status</span>
            <span>Expiry</span>
          </div>
          {ownerMetrics.rows.map((row) => (
            <div className="grid gap-3 border-t border-slate-200 p-4 xl:grid-cols-[1fr_0.35fr_0.35fr_0.35fr_0.35fr_0.35fr] xl:items-center" key={row.shop.id}>
              <div>
                <p className="font-semibold text-slate-950">{row.shop.name}</p>
                <p className="text-sm text-slate-500">{row.shop.email || row.shop.phone || "No contact saved"}</p>
              </div>
              <span className="text-sm font-semibold capitalize text-slate-700">{row.shop.billingCycle ?? "monthly"}</span>
              <span className="text-sm font-semibold text-slate-700">{formatCurrency(row.shop.packagePrice ?? 0, "SAR", locale)}</span>
              <span className="text-sm font-semibold text-slate-700">{formatCurrency(row.shop.totalPaid ?? 0, "SAR", locale)}</span>
              <Badge variant={licenseVariant(row.status)}>{row.status}</Badge>
              <span className="text-sm text-slate-600">{row.license?.expiresAt ? formatDateTime(row.license.expiresAt, locale) : "No expiry"}</span>
            </div>
          ))}
        </Card>
      </div>
    );
  };

  const renderReports = () => (
    <div className="grid gap-6">
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Owner reporting</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Business and license reports</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This reports client POS activity and license health. Owner subscription revenue comes next when payment collection is connected.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[180px_150px_150px]">
            <Select value={reportRange} onChange={(event) => setReportRange(event.target.value as ReportRange)}>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="custom">Custom</option>
            </Select>
            <Input disabled={reportRange !== "custom"} type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
            <Input disabled={reportRange !== "custom"} type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Processed sales", value: formatCurrency(reportMetrics.customerSales, "SAR", locale) },
          { label: "Refunds", value: formatCurrency(reportMetrics.refundTotal, "SAR", locale) },
          { label: "Net processed", value: formatCurrency(reportMetrics.netSales, "SAR", locale) },
          { label: "Open dues", value: formatCurrency(reportMetrics.due, "SAR", locale) },
          { label: "Active users", value: reportMetrics.activeUsers },
          { label: "Connected devices", value: reportMetrics.connectedDevices },
          { label: "Expiring soon", value: reportMetrics.expiringSoon },
          { label: "Locked stores", value: ownerMetrics.counts.locked }
        ].map((item) => (
          <Card className="p-5" key={item.label}>
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 font-display text-2xl font-semibold text-slate-950">{item.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="grid gap-2 bg-slate-50 p-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 xl:grid-cols-[1fr_0.35fr_0.35fr_0.35fr_0.35fr]">
          <span>Store</span>
          <span>Status</span>
          <span>Users</span>
          <span>Devices</span>
          <span>Expiry</span>
        </div>
        {ownerMetrics.rows.map((row) => (
          <div className="grid gap-3 border-t border-slate-200 p-4 xl:grid-cols-[1fr_0.35fr_0.35fr_0.35fr_0.35fr] xl:items-center" key={row.shop.id}>
            <div>
              <p className="font-semibold text-slate-950">{row.shop.name}</p>
              <p className="text-sm text-slate-500">{row.shop.email || row.shop.phone || "No contact saved"}</p>
            </div>
            <Badge variant={licenseVariant(row.status)}>{row.status}</Badge>
            <span className="text-sm font-semibold text-slate-700">{row.users.length}</span>
            <span className="text-sm font-semibold text-slate-700">{row.devices.length}</span>
            <span className="text-sm text-slate-600">{row.license?.expiresAt ? formatDateTime(row.license.expiresAt, locale) : "No expiry"}</span>
          </div>
        ))}
      </Card>
    </div>
  );

  const renderBranding = () => (
    <Card className="p-6">
      <h2 className="font-display text-3xl font-semibold text-slate-950">POS company branding</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Control POS name, logo, loading screen, support details, and optional receipt imprint.</p>
      <form
        className="mt-6 grid gap-5"
        onChangeCapture={() => setBrandingSavedAt(null)}
        onSubmit={(event) => {
          event.preventDefault();
          setBrandProfile({
            posName,
            companyName,
            logoUrl: companyLogoUrl.trim() || undefined,
            address: companyAddress.trim() || undefined,
            website: companyWebsite.trim() || undefined,
            supportWhatsapp,
            supportEmail,
            supportPhone,
            receiptImprintEnabled,
            receiptImprintText,
            loadingTitle,
            loadingMessage,
            loginQuotes: loginQuotesText
              .split("\n")
              .map((quote) => quote.trim())
              .filter(Boolean),
            loginAdEnabled,
            loginAdTitle,
            loginAdMessage,
            loginAdImageUrl: loginAdImageUrl.trim() || undefined,
            loginAdCtaLabel: loginAdCtaLabel.trim() || undefined,
            loginAdCtaUrl: loginAdCtaUrl.trim() || undefined
          });
          setBrandingSavedAt(new Date().toLocaleTimeString());
          setMessage("Branding saved.");
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">POS product name</span><Input value={posName} onChange={(event) => setPosName(event.target.value)} /></label>
          <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">POS company name</span><Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label>
          <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">Company address</span><Input value={companyAddress} onChange={(event) => setCompanyAddress(event.target.value)} /></label>
          <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">Website</span><Input value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} /></label>
          <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">Support WhatsApp</span><Input value={supportWhatsapp} onChange={(event) => setSupportWhatsapp(event.target.value)} /></label>
          <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">Support email</span><Input value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} /></label>
          <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">Support phone</span><Input value={supportPhone} onChange={(event) => setSupportPhone(event.target.value)} /></label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-950">POS company logo</span>
            <Input accept="image/*" className="h-auto py-3" type="file" onChange={(event) => void loadCompanyLogo(event.target.files?.[0])} />
            <span className="block text-xs leading-5 text-slate-500">Recommended: square 512x512 JPG/PNG.</span>
          </label>
        </div>

        {brandingAssetMessage ? (
          <div
            className={
              brandingAssetMessage.tone === "success"
                ? "rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800"
                : "rounded-3xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-medium text-rose-800"
            }
          >
            {brandingAssetMessage.message}
          </div>
        ) : null}

        {companyLogoUrl ? (
          <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <img alt={companyName} className="h-14 w-14 rounded-2xl object-cover" src={companyLogoUrl} />
            <div className="min-w-0">
              <p className="font-semibold text-slate-950">{companyName}</p>
              <p className="truncate text-sm text-slate-500">{companyWebsite || supportEmail}</p>
            </div>
            <Button className="ml-auto" onClick={() => setCompanyLogoUrl("")} type="button" variant="secondary">Remove logo</Button>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-950">
              <input checked={receiptImprintEnabled} className="h-5 w-5 accent-emerald-600" onChange={(event) => setReceiptImprintEnabled(event.target.checked)} type="checkbox" />
              Print POS company imprint on receipts
            </label>
            <label className="mt-4 block space-y-2"><span className="text-sm font-semibold text-slate-950">Receipt imprint text</span><Input value={receiptImprintText} onChange={(event) => setReceiptImprintText(event.target.value)} /></label>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-950">Loading screen</p>
            <div className="mt-4 grid gap-3">
              <Input value={loadingTitle} onChange={(event) => setLoadingTitle(event.target.value)} />
              <Input value={loadingMessage} onChange={(event) => setLoadingMessage(event.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-950">POS login quotes</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Add one quote per line. The POS login screen shows the first available quote for now.
            </p>
            <Textarea
              className="mt-4 min-h-36"
              value={loginQuotesText}
              onChange={(event) => setLoginQuotesText(event.target.value)}
            />
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-950">
              <input
                checked={loginAdEnabled}
                className="h-5 w-5 accent-emerald-600"
                onChange={(event) => setLoginAdEnabled(event.target.checked)}
                type="checkbox"
              />
              Show ad/announcement box on POS login
            </label>
            <div className="mt-4 grid gap-3">
              <Input placeholder="Ad title" value={loginAdTitle} onChange={(event) => setLoginAdTitle(event.target.value)} />
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-950">Login ad picture</span>
                <Input accept="image/*" className="h-auto py-3" type="file" onChange={(event) => void loadLoginAdImage(event.target.files?.[0])} />
                <span className="block text-xs leading-5 text-slate-600">
                  Recommended ad size: 1600x900, 16:9 landscape. It is shown wide on the POS login screen.
                </span>
              </label>
              {loginAdImageUrl ? (
                <div className="overflow-hidden rounded-[28px] border border-emerald-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                  <img alt="Login ad preview" className="aspect-video w-full object-cover" src={loginAdImageUrl} />
                  <div className="flex items-center justify-between gap-3 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Ad image preview</p>
                    <Button onClick={() => setLoginAdImageUrl("")} size="sm" type="button" variant="secondary">Remove image</Button>
                  </div>
                </div>
              ) : null}
              <Textarea
                className="min-h-28"
                placeholder="Ad message"
                value={loginAdMessage}
                onChange={(event) => setLoginAdMessage(event.target.value)}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="CTA label"
                  value={loginAdCtaLabel}
                  onChange={(event) => setLoginAdCtaLabel(event.target.value)}
                />
                <Input
                  placeholder="CTA URL"
                  value={loginAdCtaUrl}
                  onChange={(event) => setLoginAdCtaUrl(event.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">{brandingSavedAt ? "Branding saved" : "Save branding"}</Button>
          <Badge variant={brandingSavedAt ? "success" : "warning"}>
            {brandingSavedAt ? `Saved at ${brandingSavedAt}` : "Not saved yet"}
          </Badge>
        </div>
      </form>
    </Card>
  );

  const renderAccess = () => {
    const selectedResetUser = selectedUsers.find((user) => user.id === selectedResetUserId);

    return (
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        {renderStorePicker()}
        <div className="grid gap-5">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Professional support access</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">{selectedShop?.name ?? "No store selected"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              No hidden master password. Use timed impersonation or reset a store user password with audit logs. The old password is never shown.
            </p>

            {selectedShop ? (
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="font-display text-2xl font-semibold text-slate-950">Timed support session</h3>
                  <Textarea className="mt-4" placeholder="Reason for support access" value={supportReasons[selectedShop.id] ?? ""} onChange={(event) => setSupportReasons((current) => ({ ...current, [selectedShop.id]: event.target.value }))} />
                  <Button className="mt-4" onClick={() => showResult(ownerStartSupportSession({ shopId: selectedShop.id, reason: supportReasons[selectedShop.id] ?? "", minutes: 60 }))}>
                    Start 60 minute session
                  </Button>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <h3 className="font-display text-2xl font-semibold text-slate-950">Reset store user password</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Use this when a cashier or shop admin forgets the POS sign-in password. For live users, this updates Supabase Auth.
                  </p>
                  <div className="mt-4 grid gap-3">
                    <Select value={selectedResetUserId} onChange={(event) => setSelectedResetUserId(event.target.value)}>
                      <option value="">Select store user</option>
                      {selectedUsers.map((user) => (
                        <option key={user.id} value={user.id}>{user.name} - {user.email}</option>
                      ))}
                    </Select>
                    <Input minLength={8} placeholder="New temporary password" type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} />
                    <Button
                      disabled={!selectedResetUser || isResettingPassword}
                      onClick={async () => {
                        if (!selectedShop || !selectedResetUser) {
                          return;
                        }

                        setIsResettingPassword(true);
                        try {
                          const result = await ownerResetShopUserPassword({
                            email: selectedResetUser.email,
                            password: temporaryPassword,
                            shopId: selectedShop.id,
                            userId: selectedResetUser.id
                          });
                          showResult(result);
                          if (result.ok) {
                            setTemporaryPassword("");
                          }
                        } finally {
                          setIsResettingPassword(false);
                        }
                      }}
                      variant="secondary"
                    >
                      {isResettingPassword ? "Resetting password..." : "Save temporary password"}
                    </Button>
                    {selectedResetUser ? (
                      <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-medium leading-5 text-emerald-900">
                        Selected: {selectedResetUser.name} ({selectedResetUser.role}). Give the new password to the user securely.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    );
  };

  const renderAudit = () => (
    <Card className="p-6">
      <h2 className="font-display text-3xl font-semibold text-slate-950">Audit log</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Owner actions, support sessions, key updates, license controls, and access resets.</p>
      <div className="mt-6 max-h-[620px] space-y-3 overflow-y-auto pr-2">
        {state.auditLogs.length > 0 ? (
          state.auditLogs.map((log) => {
            const shop = log.shopId ? state.shops.find((entry) => entry.id === log.shopId) : null;

            return (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4" key={log.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{log.action}</p>
                  <span className="text-xs text-slate-500">{formatDateTime(log.createdAt, locale)}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{log.detail ?? "No detail saved."}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{shop?.name ?? "Global"} | Actor {log.actorId}</p>
              </div>
            );
          })
        ) : (
          <p className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">No audit events yet.</p>
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Owner portal</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-slate-950">POS company command center</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Separate owner workspace for shops, licensing, activation, reports, branding, access, and audit.</p>
          </div>
          <Badge variant="success">{state.brand.posName}</Badge>
        </div>
      </div>

      {message ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">{message}</div> : null}

      <Card className="p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9">
          {ownerSections.map((section) => (
            <SectionButton active={activeSection === section.id} description={section.description} icon={section.icon} key={section.id} label={section.label} onClick={() => setActiveSection(section.id)} />
          ))}
        </div>
      </Card>

      {activeSection === "overview" ? renderOverview() : null}
      {activeSection === "create" ? renderCreateShop() : null}
      {activeSection === "stores" ? renderStores() : null}
      {activeSection === "keys" ? renderKeys() : null}
      {activeSection === "billing" ? renderBilling() : null}
      {activeSection === "reports" ? renderReports() : null}
      {activeSection === "branding" ? renderBranding() : null}
      {activeSection === "access" ? renderAccess() : null}
      {activeSection === "audit" ? renderAudit() : null}
    </div>
  );
}
