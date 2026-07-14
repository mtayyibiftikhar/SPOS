"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Copy,
  CreditCard,
  FileClock,
  KeyRound,
  LayoutDashboard,
  Lock,
  Mail,
  MonitorSmartphone,
  Palette,
  ReceiptText,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCog,
  UserRoundPlus,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import type { BillingCycle, BrandProfile, DeviceActivation, LicenseStatus, ProductKey, ProductKeyStatus, Shop, User } from "@/types/pos";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { licenseStatusLabelKeys } from "@/lib/i18n";
import { deleteImageAssetFromCloud, resizeImageFileToDataUrl, uploadImageAssetToCloud } from "@/lib/image-upload";
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
  { id: "stores", label: "Stores", description: "Status groups", icon: Building2 },
  { id: "keys", label: "Activation keys", description: "Copy and revoke", icon: KeyRound },
  { id: "billing", label: "Billing", description: "Packages and paid", icon: CreditCard },
  { id: "reports", label: "Reports", description: "Licenses and sales", icon: BarChart3 },
  { id: "branding", label: "Branding", description: "POS company", icon: Palette },
  { id: "team", label: "Owner team", description: "Portal access", icon: UsersRound },
  { id: "access", label: "Access", description: "Support and reset", icon: UserCog },
  { id: "audit", label: "Audit", description: "Activity trail", icon: FileClock }
] as const;

type OwnerSectionId = (typeof ownerSections)[number]["id"];
type StoreFilter = "all" | "active" | "trial" | "expiring" | "locked" | "expired";
type ReportRange = "today" | "week" | "month" | "year" | "custom";
type BillingFilter = "all" | "paid" | "pending" | "cancelled";

type OwnerCloudSummary = {
  brand?: Partial<BrandProfile> | null;
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
  packages: Array<{
    billing_cycle: BillingCycle;
    created_at: string;
    currency: string;
    duration_days: number;
    id: string;
    is_active: boolean;
    name: string;
    price: number;
    updated_at: string;
  }>;
  subscriptionPayments: Array<{
    amount: number;
    created_at: string;
    currency: string;
    id: string;
    note: string | null;
    package_id: string | null;
    payment_method: string | null;
    period_end: string | null;
    period_start: string | null;
    shop_id: string;
    status: "paid" | "pending" | "cancelled";
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
  licenses: Array<{
    auto_lock_days_after_expiry: number | null;
    expires_at: string | null;
    id: string;
    last_payment_at: string | null;
    lock_reason: string | null;
    locked_at: string | null;
    shop_id: string;
    status: LicenseStatus;
  }>;
  shops: Array<{
    address: string | null;
    auto_payment_enabled?: boolean | null;
    billing_cycle?: BillingCycle | null;
    cancelled_at?: string | null;
    city?: string | null;
    country?: string | null;
    created_at?: string | null;
    email: string | null;
    id: string;
    last_owner_payment_at?: string | null;
    license_status: LicenseStatus;
    name: string;
    package_price?: number | null;
    phone: string | null;
    plan_name: string | null;
    total_paid?: number | null;
  }>;
};

type OwnerStoreUser = User & {
  cloudShopId?: string;
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

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultPlanName(billingCycle: BillingCycle) {
  return `${billingCycle[0].toUpperCase()}${billingCycle.slice(1)} package`;
}

function getExpiryDateForBillingCycle(billingCycle: BillingCycle) {
  return getExtendedExpiryDate(billingCycle);
}

function getExtendedExpiryDate(billingCycle: BillingCycle, currentExpiry?: string) {
  const current = currentExpiry ? new Date(currentExpiry) : new Date();
  const expiry = Number.isFinite(current.getTime()) && current.getTime() > Date.now() ? current : new Date();

  if (billingCycle === "monthly") {
    expiry.setMonth(expiry.getMonth() + 1);
  }

  if (billingCycle === "quarterly") {
    expiry.setMonth(expiry.getMonth() + 3);
  }

  if (billingCycle === "yearly") {
    expiry.setFullYear(expiry.getFullYear() + 1);
  }

  return formatDateInput(expiry);
}

function previewProductKey(value: string) {
  const normalized = value.trim();

  return normalized.length <= 12 ? normalized : `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

function normalizedMatch(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function mergeUsers(localUsers: User[], cloudUsers: OwnerStoreUser[]): OwnerStoreUser[] {
  const usersByEmailOrId = new Map<string, OwnerStoreUser>();

  for (const user of localUsers) {
    usersByEmailOrId.set(user.email.trim().toLowerCase() || user.id, user);
  }

  for (const user of cloudUsers) {
    usersByEmailOrId.set(user.email.trim().toLowerCase() || user.id, user);
  }

  return Array.from(
    usersByEmailOrId.values()
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
        "group flex min-w-fit items-center justify-center gap-2 rounded-[18px] border px-3 py-2 text-left transition hover:-translate-y-0.5",
        active
          ? "border-white/80 bg-[linear-gradient(135deg,#ffffff_0%,#f4fff9_46%,#f6f1ff_100%)] text-slate-950 shadow-[0_20px_46px_rgba(16,185,129,0.18)]"
          : "border-white/70 bg-white/58 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] hover:border-emerald-200 hover:bg-white/86 hover:shadow-[0_16px_34px_rgba(88,28,135,0.08)]"
      )}
      onClick={onClick}
      type="button"
    >
      <span className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]",
        active
          ? "bg-[linear-gradient(135deg,#059669_0%,#7c3aed_100%)] text-white shadow-[0_14px_30px_rgba(124,58,237,0.22)]"
          : "bg-[linear-gradient(135deg,#ecfdf5_0%,#f5f3ff_100%)] text-slate-700"
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-950">{label}</span>
        <span className="sr-only">{description}</span>
      </span>
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
        "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition hover:-translate-y-0.5",
        active
          ? "border-white/80 bg-[linear-gradient(135deg,#ecfdf5_0%,#f5f3ff_100%)] text-slate-950 shadow-[0_16px_36px_rgba(124,58,237,0.12)]"
          : "border-white/70 bg-white/72 text-slate-700 hover:border-emerald-200 hover:bg-white"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
      <span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs", active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100")}>{count}</span>
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
    ownerHydrateCloudState,
    ownerLogoutAllShopDevices,
    ownerRemoveDeviceActivation,
    ownerResetShopUserPassword,
    ownerSetLicense,
    ownerSetProductKeyStatus,
    ownerStartSupportSession,
    ownerUpdateShopProfile,
    saveOwnerPortalUser,
    setBrandProfile,
    setOwnerPortalUserActive,
    session,
    state,
    t
  } = usePosApp();
  const [activeSection, setActiveSection] = useState<OwnerSectionId>("overview");
  const [brandingView, setBrandingView] = useState<"menu" | "identity" | "login" | "dashboard" | "receipt" | "loading" | "support" | "team">("menu");
  const [accessDetailOpen, setAccessDetailOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");
  const [selectedShopId, setSelectedShopId] = useState(state.shops[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [storeDetailOpen, setStoreDetailOpen] = useState(false);
  const [storeCreateOpen, setStoreCreateOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeCountryFilter, setStoreCountryFilter] = useState("all");
  const [storeCityFilter, setStoreCityFilter] = useState("all");
  const [storeCreatedFrom, setStoreCreatedFrom] = useState("");
  const [storeCreatedTo, setStoreCreatedTo] = useState("");
  const [storePage, setStorePage] = useState(1);
  const [lastGeneratedKey, setLastGeneratedKey] = useState<{ key: string; shopId: string } | null>(null);
  const [createShopForm, setCreateShopForm] = useState({
    shopName: "",
    email: "",
    setupEmail: "",
    setupPassword: "",
    phone: "",
    address: "",
    country: "Saudi Arabia",
    city: "",
    planName: getDefaultPlanName("monthly"),
    billingCycle: "monthly" as BillingCycle,
    packagePrice: 0,
    totalPaid: 0,
    licenseStatus: "active" as LicenseStatus,
    expiresAt: getExpiryDateForBillingCycle("monthly"),
    allowedDevices: 2,
    autoLockDaysAfterExpiry: 3
  });
  const [licenseDrafts, setLicenseDrafts] = useState<
    Record<string, { status: LicenseStatus; expiresAt: string; planName: string; billingCycle: BillingCycle; packagePrice: number; totalPaid: number; autoPaymentEnabled: boolean; allowedDevices: number; autoLockDaysAfterExpiry: number; lockReason: string }>
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
  const [loginHeroImagesText, setLoginHeroImagesText] = useState((state.brand.loginHeroImages ?? []).join("\n"));
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
  const [ownerUserForm, setOwnerUserForm] = useState({
    id: "",
    name: "",
    email: "",
    phone: "",
    role: "support" as Extract<User["role"], "super_admin" | "support">,
    password: ""
  });
  const [clearDataConfirmName, setClearDataConfirmName] = useState("");
  const [clearDataScope, setClearDataScope] = useState<OwnerClearShopDataScope>("bills");
  const [isClearingShopData, setIsClearingShopData] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [isDeletingShop, setIsDeletingShop] = useState(false);
  const [reportRange, setReportRange] = useState<ReportRange>("month");
  const [billingFilter, setBillingFilter] = useState<BillingFilter>("all");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [packageForm, setPackageForm] = useState({
    name: "",
    billingCycle: "monthly" as BillingCycle,
    durationDays: 30,
    price: 0
  });
  const [isSavingPackage, setIsSavingPackage] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const ownerUser = state.users.find((user) => user.role === "super_admin" && user.isActive);
  const isFullOwner = session?.role === "super_admin";
  const ownerPortalUsers = state.users.filter((user) => !user.shopId && ["super_admin", "support"].includes(user.role));

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
          cache: "no-store"
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
          brand: payload.brand,
          devices: payload.devices,
          licenses: payload.licenses,
          packages: payload.packages,
          productKeys: payload.productKeys,
          profiles: payload.profiles,
          shops: payload.shops,
          subscriptionPayments: payload.subscriptionPayments
        });

        const cloudShopIdToStateId = new Map<string, string>();
        const hydratedShops = payload.shops.map((cloudShop) => {
          const existingShop = state.shops.find(
            (shop) =>
              shop.id === cloudShop.id ||
              (normalizedMatch(shop.email) && normalizedMatch(shop.email) === normalizedMatch(cloudShop.email)) ||
              (normalizedMatch(shop.phone) && normalizedMatch(shop.phone) === normalizedMatch(cloudShop.phone)) ||
              (normalizedMatch(shop.name) && normalizedMatch(shop.name) === normalizedMatch(cloudShop.name))
          );
          const stateShopId = existingShop?.id ?? cloudShop.id;

          cloudShopIdToStateId.set(cloudShop.id, stateShopId);

          return {
            ...existingShop,
            id: stateShopId,
            name: cloudShop.name,
            slug: existingShop?.slug ?? `shop-${cloudShop.id.slice(0, 8)}`,
            email: cloudShop.email ?? existingShop?.email,
            phone: cloudShop.phone ?? existingShop?.phone ?? "",
            address: cloudShop.address ?? existingShop?.address ?? "",
            country: cloudShop.country ?? existingShop?.country ?? "Saudi Arabia",
            city: cloudShop.city ?? existingShop?.city ?? "",
            currency: existingShop?.currency ?? "SAR",
            timezone: existingShop?.timezone ?? "Asia/Riyadh",
            planName: cloudShop.plan_name ?? existingShop?.planName ?? "Standard",
            billingCycle: cloudShop.billing_cycle ?? existingShop?.billingCycle ?? "monthly",
            packagePrice: Number(cloudShop.package_price ?? existingShop?.packagePrice ?? 0),
            totalPaid: Number(cloudShop.total_paid ?? existingShop?.totalPaid ?? 0),
            lastOwnerPaymentAt: cloudShop.last_owner_payment_at ?? existingShop?.lastOwnerPaymentAt,
            autoPaymentEnabled: cloudShop.auto_payment_enabled ?? existingShop?.autoPaymentEnabled ?? false,
            cancelledAt: cloudShop.cancelled_at ?? existingShop?.cancelledAt,
            licenseStatus: cloudShop.license_status,
            createdAt: cloudShop.created_at ?? existingShop?.createdAt ?? new Date().toISOString()
          } satisfies Shop;
        });
        const hydratedLicenses = payload.licenses
          .filter((license) => cloudShopIdToStateId.has(license.shop_id))
          .map((license) => ({
            id: license.id,
            shopId: cloudShopIdToStateId.get(license.shop_id)!,
            status: license.status,
            expiresAt: license.expires_at ?? undefined,
            lastPaymentAt: license.last_payment_at ?? undefined,
            autoLockDaysAfterExpiry: license.auto_lock_days_after_expiry ?? 7,
            lockedAt: license.locked_at ?? undefined,
            lockReason: license.lock_reason ?? undefined
          }));
        const hydratedUsers = payload.profiles
          .filter((profile) => !profile.shop_id || cloudShopIdToStateId.has(profile.shop_id))
          .map((profile) => ({
            id: profile.id,
            shopId: profile.shop_id ? cloudShopIdToStateId.get(profile.shop_id)! : undefined,
            name: profile.name,
            email: profile.email,
            phone: profile.phone ?? undefined,
            role: profile.role,
            isActive: profile.is_active,
            lastLoginAt: profile.last_login_at ?? undefined,
            createdAt: profile.created_at ?? new Date().toISOString()
          }));
        const hydratedDevices = payload.devices
          .filter((device) => cloudShopIdToStateId.has(device.shop_id))
          .map((device) => ({
            id: device.id,
            shopId: cloudShopIdToStateId.get(device.shop_id)!,
            productKeyId: device.product_key_id,
            browserInfo: device.browser_info ?? "Unknown browser",
            activatedAt: device.activated_at ?? new Date().toISOString(),
            lastSeenAt: device.last_seen_at ?? device.activated_at ?? new Date().toISOString()
          }));

        ownerHydrateCloudState({
          devices: hydratedDevices,
          licenses: hydratedLicenses,
          shops: hydratedShops,
          users: hydratedUsers
        });

        if (payload.brand) {
          const brand = {
            ...state.brand,
            ...payload.brand
          };

          setBrandProfile(brand);
          setPosName(brand.posName);
          setCompanyName(brand.companyName);
          setCompanyLogoUrl(brand.logoUrl ?? "");
          setCompanyAddress(brand.address ?? "");
          setCompanyWebsite(brand.website ?? "");
          setSupportWhatsapp(brand.supportWhatsapp);
          setSupportEmail(brand.supportEmail);
          setSupportPhone(brand.supportPhone);
          setReceiptImprintEnabled(brand.receiptImprintEnabled);
          setReceiptImprintText(brand.receiptImprintText);
          setLoadingTitle(brand.loadingTitle);
          setLoadingMessage(brand.loadingMessage);
          setLoginHeroImagesText((brand.loginHeroImages ?? []).join("\n"));
          setLoginQuotesText(brand.loginQuotes.join("\n"));
          setLoginAdEnabled(brand.loginAdEnabled);
          setLoginAdTitle(brand.loginAdTitle);
          setLoginAdMessage(brand.loginAdMessage);
          setLoginAdImageUrl(brand.loginAdImageUrl ?? "");
          setLoginAdCtaLabel(brand.loginAdCtaLabel ?? "");
          setLoginAdCtaUrl(brand.loginAdCtaUrl ?? "");
        }
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
    const cloudUsers: OwnerStoreUser[] =
      cloudSummary?.profiles
        .filter((profile) => profile.shop_id && cloudShopIds.includes(profile.shop_id))
        .map((profile) => ({
          cloudShopId: profile.shop_id ?? undefined,
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

  const storeCountries = Array.from(new Set(ownerMetrics.rows.map((row) => row.shop.country || "Unspecified"))).sort();
  const storeCities = Array.from(
    new Set(
      ownerMetrics.rows
        .filter((row) => storeCountryFilter === "all" || (row.shop.country || "Unspecified") === storeCountryFilter)
        .map((row) => row.shop.city || "Unspecified")
    )
  ).sort();
  const filteredStoreRows = ownerMetrics.rows.filter((row) => {
    const normalizedSearch = storeSearch.trim().toLowerCase();
    const matchesSearch =
      !normalizedSearch ||
      [row.shop.name, row.shop.email, row.shop.phone, row.shop.address, row.shop.city, row.shop.country, row.shop.planName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    const matchesFilter =
      storeFilter === "all"
        ? true
        : storeFilter === "expiring"
          ? row.expiryDays !== null && row.expiryDays >= 0 && row.expiryDays <= 7 && row.status !== "locked"
          : row.status === storeFilter;

    const createdAt = new Date(row.shop.createdAt).getTime();
    const createdFrom = storeCreatedFrom ? new Date(`${storeCreatedFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const createdTo = storeCreatedTo ? new Date(`${storeCreatedTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    const matchesCountry = storeCountryFilter === "all" || (row.shop.country || "Unspecified") === storeCountryFilter;
    const matchesCity = storeCityFilter === "all" || (row.shop.city || "Unspecified") === storeCityFilter;

    return matchesSearch && matchesFilter && matchesCountry && matchesCity && createdAt >= createdFrom && createdAt <= createdTo;
  });
  const storesPerPage = 12;
  const totalStorePages = Math.max(1, Math.ceil(filteredStoreRows.length / storesPerPage));
  const visibleStoreRows = filteredStoreRows.slice((Math.min(storePage, totalStorePages) - 1) * storesPerPage, Math.min(storePage, totalStorePages) * storesPerPage);

  const reportMetrics = useMemo(() => {
    const { start, end } = buildRange(reportRange, customStart, customEnd);
    const createdStores = ownerMetrics.rows.filter((row) => inRange(row.shop.createdAt, start, end));
    const periodPayments = (cloudSummary?.subscriptionPayments ?? []).filter(
      (payment) => payment.status === "paid" && inRange(payment.created_at, start, end)
    );
    const paidStoreIds = new Set(periodPayments.map((payment) => payment.shop_id));
    const fallbackPaidStores = ownerMetrics.rows.filter(
      (row) => (row.shop.totalPaid ?? 0) > 0 && inRange(row.shop.lastOwnerPaymentAt, start, end)
    );
    const revenue =
      periodPayments.length > 0
        ? periodPayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
        : fallbackPaidStores.reduce((sum, row) => sum + (row.shop.totalPaid ?? 0), 0);
    const pendingBalance = ownerMetrics.rows.reduce(
      (sum, row) => sum + Math.max((row.shop.packagePrice ?? 0) - (row.shop.totalPaid ?? 0), 0),
      0
    );

    return {
      start,
      end,
      createdStores,
      revenue,
      pendingBalance,
      paidStores: periodPayments.length > 0 ? paidStoreIds.size : fallbackPaidStores.length,
      activeStores: ownerMetrics.counts.active,
      expiringSoon: ownerMetrics.counts.expiring,
      lockedStores: ownerMetrics.counts.locked,
      expiredStores: ownerMetrics.counts.expired
    };
  }, [cloudSummary?.subscriptionPayments, customEnd, customStart, ownerMetrics, reportRange]);

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

  const logoutAllConnectedDevices = (shopId: string) => {
    const result = ownerLogoutAllShopDevices({ shopId });

    if (result.ok) {
      setCloudSummary((current) =>
        current
          ? {
              ...current,
              devices: current.devices.filter((entry) => entry.shop_id !== shopId)
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
        autoPaymentEnabled: shop?.autoPaymentEnabled ?? false,
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
        address: "",
        country: "Saudi Arabia",
        city: "",
        planName: getDefaultPlanName(current.billingCycle),
        licenseStatus: "active",
        expiresAt: getExpiryDateForBillingCycle(current.billingCycle)
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
        autoPaymentEnabled: draft.autoPaymentEnabled,
        allowedDevices: draft.allowedDevices,
        autoLockDaysAfterExpiry: draft.autoLockDaysAfterExpiry,
        lockReason: draft.lockReason
      })
    );
  };

  const recordStorePayment = async (shopId: string) => {
    const draft = getLicenseDraft(shopId);
    const amount = Math.max(0, Number(paymentAmount));

    if (amount <= 0) {
      setMessage("Enter a payment amount greater than zero.");
      return;
    }

    const nextExpiry = getExtendedExpiryDate(draft.billingCycle, draft.expiresAt);

    try {
      const response = await fetch("/api/owner/record-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount,
          billingCycle: draft.billingCycle,
          expiresAt: nextExpiry,
          packagePrice: draft.packagePrice,
          shopId
        })
      });
      const payload = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "Unable to record this payment in cloud billing.");
        return;
      }
    } catch {
      setMessage("Unable to reach cloud billing. The payment was not recorded.");
      return;
    }

    const result = ownerSetLicense({
      shopId,
      status: "active",
      expiresAt: nextExpiry,
      planName: draft.planName,
      billingCycle: draft.billingCycle,
      packagePrice: draft.packagePrice,
      totalPaid: draft.totalPaid + amount,
      autoPaymentEnabled: draft.autoPaymentEnabled,
      allowedDevices: draft.allowedDevices,
      autoLockDaysAfterExpiry: draft.autoLockDaysAfterExpiry,
      lockReason: ""
    });

    if (result.ok) {
      updateLicenseDraft(shopId, { status: "active", expiresAt: nextExpiry, totalPaid: draft.totalPaid + amount });
      setPaymentAmount(0);
    }

    showResult(result);
  };

  const createOwnerPackage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!packageForm.name.trim() || packageForm.price < 0 || packageForm.durationDays < 1) {
      setMessage("Enter a package name, valid duration, and non-negative price.");
      return;
    }

    setIsSavingPackage(true);

    try {
      const response = await fetch("/api/owner/packages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(packageForm)
      });
      const payload = (await response.json()) as { ok: boolean; message?: string; package?: OwnerCloudSummary["packages"][number] };

      if (!response.ok || !payload.ok || !payload.package) {
        setMessage(payload.message ?? "Unable to create package.");
        return;
      }

      setCloudSummary((current) =>
        current
          ? {
              ...current,
              packages: [...current.packages.filter((entry) => entry.id !== payload.package!.id), payload.package!]
            }
          : current
      );
      setPackageForm({ name: "", billingCycle: "monthly", durationDays: 30, price: 0 });
      setMessage("Package created and ready to assign.");
    } catch {
      setMessage("Unable to reach cloud package management.");
    } finally {
      setIsSavingPackage(false);
    }
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

  const deleteSelectedShop = async () => {
    if (!selectedShop || isDeletingShop) {
      return;
    }

    setIsDeletingShop(true);

    try {
      const deletedShopId = selectedShop.id;
      const result = await ownerDeleteShop({ shopId: deletedShopId, confirmName: deleteConfirmName });

      showResult(result);

      if (result.ok) {
        setDeleteConfirmName("");
        const remainingShop = state.shops.find((shop) => shop.id !== deletedShopId);
        setSelectedShopId(remainingShop?.id ?? "");
      }
    } finally {
      setIsDeletingShop(false);
    }
  };

  const loadCompanyLogo = async (file?: File) => {
    if (!file) {
      return;
    }

    setBrandingAssetMessage(null);

    try {
      const result = await resizeImageFileToDataUrl(file, {
        maxBytes: 180 * 1024,
        maxWidth: 520,
        maxHeight: 260,
        minQuality: 0.6,
        outputType: "image/jpeg",
        paddingRatio: 0.06,
        quality: 0.86,
        trimWhitespace: true
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
        maxBytes: 760 * 1024,
        maxWidth: 1280,
        maxHeight: 720,
        minQuality: 0.58,
        outputType: "image/jpeg",
        quality: 0.78
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
          ? `Dashboard announcement image saved securely in Supabase Storage at ${result.width}x${result.height}.`
          : `Dashboard announcement image optimized to ${result.width}x${result.height}. Cloud upload fallback was used.`
      });
    } catch (error) {
      setBrandingAssetMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "Dashboard announcement image upload failed."
      });
    }
  };

  const getLoginHeroImages = () => loginHeroImagesText.split("\n").map((entry) => entry.trim()).filter(Boolean);

  const removeLoginHeroImage = async (imageUrlToRemove: string) => {
    setLoginHeroImagesText((current) =>
      current
        .split("\n")
        .map((entry) => entry.trim())
        .filter((imageUrl) => imageUrl && imageUrl !== imageUrlToRemove)
        .join("\n")
    );
    setBrandingSavedAt(null);

    try {
      const result = await deleteImageAssetFromCloud({
        ownerEmail: ownerUser?.email,
        url: imageUrlToRemove
      });

      setBrandingAssetMessage({
        tone: "success",
        message: result.deleted
          ? "Login hero image removed from rotation and Supabase Storage. Save branding to publish the change."
          : "External image removed from rotation. Save branding to publish the change."
      });
    } catch (error) {
      setBrandingAssetMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "Image removed from rotation, but storage cleanup failed."
      });
    }
  };

  const loadLoginHeroImages = async (files?: FileList | File[]) => {
    const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      return;
    }

    setBrandingAssetMessage(null);

    try {
      const uploadedUrls: string[] = [];
      let lastSize = "";

      for (const file of imageFiles) {
        const result = await resizeImageFileToDataUrl(file, {
          maxBytes: 760 * 1024,
          maxWidth: 1600,
          maxHeight: 1100,
          minQuality: 0.58,
          outputType: "image/jpeg",
          quality: 0.8
        });
        const upload = await uploadImageAssetToCloud({
          dataUrl: result.dataUrl,
          fileName: file.name,
          ownerEmail: ownerUser?.email,
          scope: "owner-login-hero"
        });

        uploadedUrls.push(upload.url);
        lastSize = `${result.width}x${result.height}`;
      }

      setLoginHeroImagesText((current) => {
        const existing = current.split("\n").map((entry) => entry.trim()).filter(Boolean);

        return Array.from(new Set([...existing, ...uploadedUrls])).join("\n");
      });
      setBrandingSavedAt(null);
      setBrandingAssetMessage({
        tone: "success",
        message: `${uploadedUrls.length} login hero picture${uploadedUrls.length === 1 ? "" : "s"} added securely at ${lastSize}. Save branding to publish them to every POS login.`
      });
    } catch (error) {
      setBrandingAssetMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "Login hero image upload failed."
      });
    }
  };

  const saveBrandingProfile = () => {
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
      loginHeroImages: loginHeroImagesText
        .split("\n")
        .map((imageUrl) => imageUrl.trim())
        .filter(Boolean),
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
  };

  const resetOwnerUserForm = () => {
    setOwnerUserForm({
      id: "",
      name: "",
      email: "",
      phone: "",
      role: "support",
      password: ""
    });
  };

  const editOwnerPortalUser = (user: User) => {
    setOwnerUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      role: user.role === "super_admin" ? "super_admin" : "support",
      password: ""
    });
    setBrandingView("team");
  };

  const saveOwnerTeamUser = async () => {
    try {
      const response = await fetch("/api/owner/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ownerUserForm)
      });
      const payload = (await response.json()) as { ok: boolean; message?: string; user?: User };

      if (!payload.ok || !payload.user) {
        showResult({ ok: false, message: payload.message ?? "Unable to save owner portal user." });
        return;
      }

      const result = saveOwnerPortalUser({
        ...ownerUserForm,
        id: payload.user.id
      });
      showResult(result);

      if (result.ok) resetOwnerUserForm();
    } catch {
      showResult({ ok: false, message: "Unable to reach owner team management." });
    }
  };

  const updateOwnerTeamUserAccess = async (user: User, isActive: boolean) => {
    try {
      const response = await fetch("/api/owner/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, isActive })
      });
      const payload = (await response.json()) as { ok: boolean; message?: string };

      if (!payload.ok) {
        showResult({ ok: false, message: payload.message ?? "Unable to update owner user access." });
        return;
      }

      showResult(setOwnerPortalUserActive(user.id, isActive));
    } catch {
      showResult({ ok: false, message: "Unable to reach owner team management." });
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
                ? "border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_46%,#f5f3ff_100%)] text-slate-950 shadow-[0_18px_38px_rgba(16,185,129,0.12)]"
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
            <p className={cn("mt-2 text-xs leading-5", selectedShopSafeId === row.shop.id ? "text-slate-600" : "text-slate-500")}>
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
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: ShieldCheck,
            label: "Active stores",
            value: ownerMetrics.counts.active,
            tone: "bg-emerald-50 text-emerald-800",
            filter: "active" as StoreFilter
          },
          {
            icon: Building2,
            label: "Total stores",
            value: ownerMetrics.counts.all,
            tone: "bg-[linear-gradient(135deg,#059669_0%,#7c3aed_100%)] text-white shadow-[0_14px_34px_rgba(124,58,237,0.18)]",
            filter: "all" as StoreFilter
          },
          {
            icon: Bell,
            label: "Expiring soon",
            value: ownerMetrics.counts.expiring,
            tone: "bg-amber-50 text-amber-800",
            filter: "expiring" as StoreFilter
          },
          {
            icon: Lock,
            label: "Locked stores",
            value: ownerMetrics.counts.locked,
            tone: "bg-rose-50 text-rose-800",
            filter: "locked" as StoreFilter
          }
        ].map((item) => {
          const Icon = item.icon;

          return (
            <button
              className="overflow-hidden rounded-[28px] text-left transition hover:-translate-y-1"
              key={item.label}
              onClick={() => { setStoreFilter(item.filter); setStoreDetailOpen(false); setStoreCreateOpen(false); setActiveSection("stores"); }}
              type="button"
            >
            <Card className="h-full p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-3 font-display text-4xl font-semibold text-slate-950">{item.value}</p>
                </div>
                <span className={cn("inline-flex h-14 w-14 items-center justify-center rounded-[22px]", item.tone)}>
                  <Icon className="h-6 w-6" />
                </span>
              </div>
            </Card>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Next owner actions</p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Run the POS business from one clean flow</h2>
              </div>
              <Badge variant="success">{state.brand.posName}</Badge>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {[
                { label: "Manage stores", icon: Building2, section: "stores" as OwnerSectionId },
                { label: "Generate keys", icon: KeyRound, section: "keys" as OwnerSectionId },
                { label: "Store billing", icon: CreditCard, section: "billing" as OwnerSectionId },
                { label: "Brand the POS", icon: Palette, section: "branding" as OwnerSectionId }
              ].map((action) => {
                const Icon = action.icon;

                return (
                  <button
                    className="group rounded-[26px] border border-white/80 bg-white/82 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white hover:shadow-[0_18px_38px_rgba(124,58,237,0.10)]"
                    key={action.label}
                    onClick={() => {
                      setActiveSection(action.section);
                      if (action.section === "branding") {
                        setBrandingView("menu");
                      }
                    }}
                    type="button"
                  >
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#059669_0%,#7c3aed_100%)] text-white shadow-[0_14px_30px_rgba(124,58,237,0.18)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <p className="mt-4 font-display text-xl font-semibold text-slate-950">{action.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Latest stores</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">Quick status</h2>
          <div className="mt-5 grid gap-3">
            {ownerMetrics.rows.slice(0, 5).map((row) => (
              <button
                className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-emerald-200 hover:bg-white"
                key={row.shop.id}
                onClick={() => {
                  setSelectedShopId(row.shop.id);
                  setStoreDetailOpen(true);
                  setActiveSection("stores");
                }}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">{row.shop.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.users.length} users | {row.devices.length} devices</p>
                  </div>
                  <Badge variant={licenseVariant(row.status)}>{row.status}</Badge>
                </div>
              </button>
            ))}
            {ownerMetrics.rows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                No stores yet. Create the first shop to issue an activation key.
              </div>
            ) : null}
          </div>
        </Card>

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
          <span className="text-sm font-semibold text-slate-950">Phone with country code</span>
          <Input inputMode="tel" placeholder="+966501234567" value={createShopForm.phone} onChange={(event) => setCreateShopForm((current) => ({ ...current, phone: event.target.value }))} />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold text-slate-950">Address</span>
          <Input value={createShopForm.address} onChange={(event) => setCreateShopForm((current) => ({ ...current, address: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Country</span>
          <Input value={createShopForm.country} onChange={(event) => setCreateShopForm((current) => ({ ...current, country: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">City</span>
          <Input value={createShopForm.city} onChange={(event) => setCreateShopForm((current) => ({ ...current, city: event.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-950">Billing cycle</span>
          <Select
            value={createShopForm.billingCycle}
            onChange={(event) => {
              const billingCycle = event.target.value as BillingCycle;

              setCreateShopForm((current) => ({
                ...current,
                billingCycle,
                expiresAt: getExpiryDateForBillingCycle(billingCycle),
                planName: getDefaultPlanName(billingCycle)
              }));
            }}
          >
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
          <span className="text-sm font-semibold text-slate-950">Expiry date</span>
          <Input type="date" value={createShopForm.expiresAt} onChange={(event) => setCreateShopForm((current) => ({ ...current, expiresAt: event.target.value }))} />
          <span className="block text-xs leading-5 text-slate-500">
            Auto-filled from today based on the billing cycle. You can still adjust it if needed.
          </span>
        </label>
        <label className="flex min-h-[82px] items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            checked={createShopForm.licenseStatus === "trial"}
            className="h-5 w-5 accent-emerald-600"
            type="checkbox"
            onChange={(event) =>
              setCreateShopForm((current) => ({
                ...current,
                licenseStatus: event.target.checked ? "trial" : "active"
              }))
            }
          />
          <span>
            <span className="block text-sm font-semibold text-slate-950">Give trial</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              Leave unchecked to create the shop as active.
            </span>
          </span>
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

    if (storeCreateOpen) {
      return (
        <div className="grid gap-4">
          <Button className="w-fit" onClick={() => setStoreCreateOpen(false)} type="button" variant="secondary">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to stores
          </Button>
          {renderCreateShop()}
        </div>
      );
    }

    if (!storeDetailOpen) {
      return (
        <div className="grid gap-5">
          <Card className="p-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_repeat(4,minmax(140px,0.38fr))_auto] xl:items-end">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Search stores</span>
              <Input
                placeholder="Name, email, phone, city, country"
                value={storeSearch}
                onChange={(event) => {
                  setStoreSearch(event.target.value);
                  setStorePage(1);
                }}
              />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Country</span>
                <Select value={storeCountryFilter} onChange={(event) => { setStoreCountryFilter(event.target.value); setStoreCityFilter("all"); setStorePage(1); }}>
                  <option value="all">All countries</option>
                  {storeCountries.map((country) => <option key={country} value={country}>{country}</option>)}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">City</span>
                <Select value={storeCityFilter} onChange={(event) => { setStoreCityFilter(event.target.value); setStorePage(1); }}>
                  <option value="all">All cities</option>
                  {storeCities.map((city) => <option key={city} value={city}>{city}</option>)}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Created from</span>
                <Input type="date" value={storeCreatedFrom} onChange={(event) => { setStoreCreatedFrom(event.target.value); setStorePage(1); }} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Created to</span>
                <Input type="date" value={storeCreatedTo} onChange={(event) => { setStoreCreatedTo(event.target.value); setStorePage(1); }} />
              </label>
              <Button onClick={() => setStoreCreateOpen(true)} type="button">
                <UserRoundPlus className="mr-2 h-4 w-4" />
                New store
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ["all", "All"],
                  ["active", "Active"],
                  ["trial", "Trial"],
                  ["expiring", "Expiring"],
                  ["locked", "Locked"],
                  ["expired", "Expired"]
                ].map(([id, label]) => (
                  <StoreFilterButton
                    active={storeFilter === id}
                    count={ownerMetrics.counts[id as StoreFilter]}
                    key={id}
                    label={label}
                    onClick={() => { setStoreFilter(id as StoreFilter); setStorePage(1); }}
                  />
                ))}
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleStoreRows.map((row) => (
              <button
                className="rounded-[28px] border border-white/80 bg-white/86 p-5 text-left shadow-[0_18px_48px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_20px_46px_rgba(124,58,237,0.10)]"
                key={row.shop.id}
                onClick={() => {
                  setSelectedShopId(row.shop.id);
                  setStoreDetailOpen(true);
                }}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-2xl font-semibold text-slate-950">{row.shop.name}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{row.shop.email || row.shop.phone || "No contact saved"}</p>
                  </div>
                  <Badge variant={licenseVariant(row.status)}>{row.status}</Badge>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="font-display text-xl font-semibold text-slate-950">{row.users.length}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Users</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="font-display text-xl font-semibold text-slate-950">{row.devices.length}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Devices</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="font-display text-xl font-semibold text-slate-950">{row.productKeys.length}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Keys</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {filteredStoreRows.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="font-display text-2xl font-semibold text-slate-950">No stores found</p>
            </Card>
          ) : null}
          {filteredStoreRows.length > 0 ? (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-slate-600">Showing {(Math.min(storePage, totalStorePages) - 1) * storesPerPage + 1}-{Math.min(Math.min(storePage, totalStorePages) * storesPerPage, filteredStoreRows.length)} of {filteredStoreRows.length}</p>
              <div className="flex items-center gap-2">
                <Button disabled={storePage <= 1} onClick={() => setStorePage((page) => Math.max(1, page - 1))} size="sm" variant="secondary">Previous</Button>
                <Badge variant="neutral">Page {Math.min(storePage, totalStorePages)} / {totalStorePages}</Badge>
                <Button disabled={storePage >= totalStorePages} onClick={() => setStorePage((page) => Math.min(totalStorePages, page + 1))} size="sm" variant="secondary">Next</Button>
              </div>
            </Card>
          ) : null}
        </div>
      );
    }

    return (
      <div className="grid gap-6">
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={() => setStoreDetailOpen(false)} type="button" variant="secondary">
              Back to stores
            </Button>
            <div className="flex flex-wrap gap-2">
              <Badge variant={licenseVariant(getEffectiveLicenseStatus(selectedLicense))}>{getEffectiveLicenseStatus(selectedLicense)}</Badge>
              <Badge variant="neutral">{selectedUsers.length} users</Badge>
              <Badge variant="neutral">{selectedDevices.length} devices</Badge>
            </div>
          </div>
        </Card>

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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-2xl font-semibold text-slate-950">Connected devices</h3>
                  {selectedShop && selectedDevices.length > 0 ? (
                    <Button size="sm" onClick={() => logoutAllConnectedDevices(selectedShop.id)} variant="danger">
                      Log out all devices
                    </Button>
                  ) : null}
                </div>
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
                    disabled={deleteConfirmName !== selectedShop.name || isDeletingShop}
                    onClick={() => void deleteSelectedShop()}
                    variant="danger"
                  >
                    {isDeletingShop ? "Deleting..." : "Delete store"}
                  </Button>
                </div>
              </Card>
            ) : null}
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
    const billingStatusFor = (row: (typeof ownerMetrics.rows)[number]): BillingFilter => {
      if (row.shop.cancelledAt || row.status === "expired") return "cancelled";
      if ((row.shop.packagePrice ?? 0) > 0 && (row.shop.totalPaid ?? 0) >= (row.shop.packagePrice ?? 0)) return "paid";
      return "pending";
    };
    const billingCounts = {
      all: ownerMetrics.rows.length,
      paid: ownerMetrics.rows.filter((row) => billingStatusFor(row) === "paid").length,
      pending: ownerMetrics.rows.filter((row) => billingStatusFor(row) === "pending").length,
      cancelled: ownerMetrics.rows.filter((row) => billingStatusFor(row) === "cancelled").length
    };
    const billingRows = billingFilter === "all" ? ownerMetrics.rows : ownerMetrics.rows.filter((row) => billingStatusFor(row) === billingFilter);
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { id: "paid" as BillingFilter, label: "Paid stores", value: billingCounts.paid },
            { id: "pending" as BillingFilter, label: "Pending payments", value: billingCounts.pending },
            { id: "cancelled" as BillingFilter, label: "Cancelled / expired", value: billingCounts.cancelled },
            { id: "all" as BillingFilter, label: "Total collected", value: formatCurrency(recurring.totalPaid, "SAR", locale) }
          ].map((item) => (
            <button className="text-left transition hover:-translate-y-1" key={item.label} onClick={() => setBillingFilter(item.id)} type="button">
            <Card className={cn("h-full p-5", billingFilter === item.id && "border-emerald-300 bg-emerald-50/60")}>
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 font-display text-2xl font-semibold text-slate-950">{item.value}</p>
            </Card>
            </button>
          ))}
        </div>

        <Card className="p-6">
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <form className="grid gap-4" onSubmit={createOwnerPackage}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">Package catalog</p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">Create reusable package</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-950">Package name</span>
                  <Input value={packageForm.name} onChange={(event) => setPackageForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-950">Billing cycle</span>
                  <Select
                    value={packageForm.billingCycle}
                    onChange={(event) => {
                      const billingCycle = event.target.value as BillingCycle;
                      setPackageForm((current) => ({
                        ...current,
                        billingCycle,
                        durationDays: billingCycle === "monthly" ? 30 : billingCycle === "quarterly" ? 90 : 365
                      }));
                    }}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </Select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-950">Price (SAR)</span>
                  <Input min={0} type="number" value={packageForm.price} onChange={(event) => setPackageForm((current) => ({ ...current, price: Number(event.target.value) }))} />
                </label>
              </div>
              <Button disabled={isSavingPackage} type="submit">{isSavingPackage ? "Creating package..." : "Create package"}</Button>
            </form>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Available packages</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(cloudSummary?.packages ?? []).length > 0 ? (
                  cloudSummary!.packages.map((ownerPackage) => (
                    <button
                      className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50"
                      key={ownerPackage.id}
                      onClick={() => {
                        if (!selectedShop) return;
                        updateLicenseDraft(selectedShop.id, {
                          billingCycle: ownerPackage.billing_cycle,
                          packagePrice: Number(ownerPackage.price),
                          planName: ownerPackage.name
                        });
                        setMessage(`${ownerPackage.name} applied to ${selectedShop.name}. Save billing to confirm.`);
                      }}
                      type="button"
                    >
                      <p className="font-semibold text-slate-950">{ownerPackage.name}</p>
                      <p className="mt-1 text-sm capitalize text-slate-500">{ownerPackage.billing_cycle} | {ownerPackage.duration_days} days</p>
                      <p className="mt-3 font-display text-xl font-semibold text-emerald-700">{formatCurrency(Number(ownerPackage.price), ownerPackage.currency, locale)}</p>
                    </button>
                  ))
                ) : (
                  <p className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm text-slate-600 sm:col-span-2">
                    No reusable packages yet. Create the first package here.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>

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
              <label className="space-y-2 xl:col-span-2">
                <span className="text-sm font-semibold text-slate-950">Record payment and renew</span>
                <Input min={0} type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(Number(event.target.value))} />
              </label>
              <label className="flex items-center gap-3 rounded-3xl border border-violet-200 bg-violet-50 p-4 text-sm font-semibold text-slate-900">
                <input
                  checked={draft.autoPaymentEnabled}
                  onChange={(event) => updateLicenseDraft(selectedShop.id, { autoPaymentEnabled: event.target.checked })}
                  type="checkbox"
                />
                Auto-payment ready
                <span className="font-normal text-slate-500">Activates only after a payment gateway is connected.</span>
              </label>
              <Button className="self-end" onClick={() => recordStorePayment(selectedShop.id)}>
                Record payment
              </Button>
              <Button className="self-end" onClick={() => saveLicense(selectedShop.id)} variant="secondary">
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
          {billingRows.map((row) => (
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
              Subscription revenue, new stores, payment position, and license health for the selected period.
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
          { label: "Subscription revenue", value: formatCurrency(reportMetrics.revenue, "SAR", locale) },
          { label: "New stores", value: reportMetrics.createdStores.length },
          { label: "Paid stores", value: reportMetrics.paidStores },
          { label: "Pending balance", value: formatCurrency(reportMetrics.pendingBalance, "SAR", locale) },
          { label: "Active stores", value: reportMetrics.activeStores },
          { label: "Expiring soon", value: reportMetrics.expiringSoon },
          { label: "Locked stores", value: reportMetrics.lockedStores },
          { label: "Expired stores", value: reportMetrics.expiredStores }
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

  const renderBranding = () => {
    const brandingSections = [
      { id: "identity", label: "Owner screen identity", description: "Edit owner portal name, company name, logo, address, and website.", icon: Palette },
      { id: "team", label: "Owner team", description: "Add owners and customer service reps for the owner portal.", icon: UsersRound },
      { id: "login", label: "Login pictures", description: "Manage POS login hero images and random quotes.", icon: MonitorSmartphone },
      { id: "dashboard", label: "Dashboard image", description: "Control the optional dashboard image/announcement block.", icon: Bell },
      { id: "receipt", label: "Receipt imprint", description: "Control whether POS company branding appears on receipts.", icon: ReceiptText },
      { id: "loading", label: "Loading screen", description: "Set the branded loading screen title and short message.", icon: ShieldCheck },
      { id: "support", label: "Support contacts", description: "WhatsApp, email, and phone shown to stores.", icon: UserCog }
    ] as const;
    const activeBrandingSection = brandingSections.find((section) => section.id === brandingView);

    if (brandingView === "menu") {
      return (
        <Card className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Owner branding</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Choose what to edit</h2>
            </div>
            <Badge variant={brandingSavedAt ? "success" : "warning"}>
              {brandingSavedAt ? `Saved at ${brandingSavedAt}` : "Not saved yet"}
            </Badge>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {brandingSections.map((section) => {
              const Icon = section.icon;

              return (
                <button
                  className="rounded-[28px] border border-white/80 bg-white/86 p-5 text-left shadow-[0_18px_48px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_20px_46px_rgba(124,58,237,0.10)]"
                  key={section.id}
                  onClick={() => setBrandingView(section.id)}
                  type="button"
                >
                  <span className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-4 font-display text-2xl font-semibold text-slate-950">{section.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{section.description}</p>
                </button>
              );
            })}
          </div>
        </Card>
      );
    }

    return (
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Button onClick={() => setBrandingView("menu")} type="button" variant="secondary">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to branding sections
            </Button>
            <h2 className="mt-4 font-display text-3xl font-semibold text-slate-950">
              {activeBrandingSection?.label ?? "Branding"}
            </h2>
          </div>
          <Badge variant={brandingSavedAt ? "success" : "warning"}>
            {brandingSavedAt ? `Saved at ${brandingSavedAt}` : "Not saved yet"}
          </Badge>
        </div>

        <form
          className="mt-6 grid gap-5"
          onChangeCapture={() => setBrandingSavedAt(null)}
          onSubmit={(event) => {
            event.preventDefault();
            saveBrandingProfile();
          }}
        >
          {brandingView === "identity" ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-950">Owner portal / POS name</span>
                  <Input value={posName} onChange={(event) => setPosName(event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-950">POS company name</span>
                  <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-slate-950">Company address</span>
                  <Input value={companyAddress} onChange={(event) => setCompanyAddress(event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-950">Website</span>
                  <Input value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-950">Main owner logo</span>
                  <Input accept="image/*" className="h-auto py-3" type="file" onChange={(event) => void loadCompanyLogo(event.target.files?.[0])} />
                  <span className="block text-xs leading-5 text-slate-500">Recommended: square 512x512 JPG/PNG.</span>
                </label>
              </div>
              <div className="rounded-[32px] border border-slate-200 bg-slate-50 p-5">
                {companyLogoUrl ? (
                  <img alt={companyName} className="mx-auto h-28 w-28 rounded-[28px] object-cover shadow-[0_18px_40px_rgba(15,23,42,0.12)]" src={companyLogoUrl} />
                ) : (
                  <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#059669_0%,#7c3aed_100%)] font-display text-3xl font-semibold text-white shadow-[0_18px_40px_rgba(124,58,237,0.18)]">
                    {posName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <p className="mt-4 text-center font-display text-2xl font-semibold text-slate-950">{posName}</p>
                <p className="mt-1 truncate text-center text-sm text-slate-500">{companyName}</p>
                {companyLogoUrl ? (
                  <Button className="mt-4 w-full" onClick={() => setCompanyLogoUrl("")} type="button" variant="secondary">
                    Remove logo
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {brandingView === "support" ? (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">Support WhatsApp</span><Input value={supportWhatsapp} onChange={(event) => setSupportWhatsapp(event.target.value)} /></label>
              <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">Support email</span><Input value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} /></label>
              <label className="space-y-2"><span className="text-sm font-semibold text-slate-950">Support phone</span><Input value={supportPhone} onChange={(event) => setSupportPhone(event.target.value)} /></label>
            </div>
          ) : null}

          {brandingView === "receipt" ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-950">
                <input checked={receiptImprintEnabled} className="h-5 w-5 accent-emerald-600" onChange={(event) => setReceiptImprintEnabled(event.target.checked)} type="checkbox" />
                Print POS company imprint on receipts
              </label>
              <label className="mt-4 block space-y-2">
                <span className="text-sm font-semibold text-slate-950">Receipt imprint text</span>
                <Input value={receiptImprintText} onChange={(event) => setReceiptImprintText(event.target.value)} />
              </label>
            </div>
          ) : null}

          {brandingView === "loading" ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-950">Loading title</span>
                  <Input value={loadingTitle} onChange={(event) => setLoadingTitle(event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-950">Loading message</span>
                  <Input value={loadingMessage} onChange={(event) => setLoadingMessage(event.target.value)} />
                </label>
              </div>
            </div>
          ) : null}

          {brandingView === "login" ? (
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-950">POS login hero pictures</p>
                <p className="mt-2 text-sm font-semibold text-slate-500">Recommended size: 1600 x 1100 px.</p>
                <Input
                  accept="image/*"
                  className="mt-4 h-auto py-3"
                  multiple
                  type="file"
                  onChange={(event) => void loadLoginHeroImages(event.target.files ?? undefined)}
                />
                <Textarea
                  className="mt-4 min-h-28"
                  placeholder="One hero image URL per line"
                  value={loginHeroImagesText}
                  onChange={(event) => setLoginHeroImagesText(event.target.value)}
                />
                {getLoginHeroImages().length > 0 ? (
                  <div className="mt-4 grid max-h-[460px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                    {getLoginHeroImages().map((imageUrl, index) => (
                      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.08)]" key={`${imageUrl}-${index}`}>
                        <img alt={`Login hero preview ${index + 1}`} className="aspect-video w-full object-cover" src={imageUrl} />
                        <div className="flex items-center justify-between gap-3 p-3">
                          <p className="min-w-0 truncate text-xs text-slate-500">Image {index + 1}</p>
                          <Button onClick={() => void removeLoginHeroImage(imageUrl)} size="sm" type="button" variant="danger">Remove</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-950">POS login quotes</p>
                <p className="mt-2 text-sm font-semibold text-slate-500">One quote per line.</p>
                <Textarea className="mt-4 min-h-64" value={loginQuotesText} onChange={(event) => setLoginQuotesText(event.target.value)} />
              </div>
            </div>
          ) : null}

          {brandingView === "dashboard" ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <label className="flex items-center gap-3 text-sm font-semibold text-slate-950">
                  <input checked={loginAdEnabled} className="h-5 w-5 accent-slate-950" onChange={(event) => setLoginAdEnabled(event.target.checked)} type="checkbox" />
                  Show dashboard image
                </label>
                <p className="mt-2 text-sm font-semibold text-slate-500">Recommended size: 1600 x 900 px.</p>
                <div className="mt-4 grid gap-3">
                  <Input accept="image/*" className="h-auto py-3" type="file" onChange={(event) => void loadLoginAdImage(event.target.files?.[0])} />
                  <Input placeholder="Optional click URL" value={loginAdCtaUrl} onChange={(event) => setLoginAdCtaUrl(event.target.value)} />
                </div>
              </div>
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                {loginAdImageUrl ? (
                  <img alt="Dashboard image preview" className="aspect-video w-full object-cover" src={loginAdImageUrl} />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-slate-100 text-sm font-semibold text-slate-500">No dashboard image</div>
                )}
                {loginAdImageUrl ? (
                  <div className="p-3">
                    <Button onClick={() => setLoginAdImageUrl("")} size="sm" type="button" variant="secondary">Remove image</Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {brandingView === "team" ? (
            <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
              <div className="rounded-[32px] border border-slate-200 bg-white p-5">
                <h3 className="font-display text-2xl font-semibold text-slate-950">{ownerUserForm.id ? "Edit owner user" : "Add owner user"}</h3>
                {!isFullOwner ? (
                  <p className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                    Only a full owner can add or edit owner portal users.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3">
                    <Input placeholder="Full name" value={ownerUserForm.name} onChange={(event) => setOwnerUserForm((current) => ({ ...current, name: event.target.value }))} />
                    <Input placeholder="Email" type="email" value={ownerUserForm.email} onChange={(event) => setOwnerUserForm((current) => ({ ...current, email: event.target.value }))} />
                    <Input placeholder="Phone" value={ownerUserForm.phone} onChange={(event) => setOwnerUserForm((current) => ({ ...current, phone: event.target.value }))} />
                    <Select value={ownerUserForm.role} onChange={(event) => setOwnerUserForm((current) => ({ ...current, role: event.target.value as Extract<User["role"], "super_admin" | "support"> }))}>
                      <option value="super_admin">Owner - full control</option>
                      <option value="support">Customer service rep</option>
                    </Select>
                    <Input
                      minLength={8}
                      placeholder={ownerUserForm.id ? "New password (leave blank to keep)" : "Create password"}
                      type="password"
                      value={ownerUserForm.password}
                      onChange={(event) => setOwnerUserForm((current) => ({ ...current, password: event.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void saveOwnerTeamUser()} type="button">{ownerUserForm.id ? "Save owner user" : "Add owner user"}</Button>
                      <Button onClick={resetOwnerUserForm} type="button" variant="secondary">Clear</Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid gap-3">
                {ownerPortalUsers.map((user) => (
                  <div className="rounded-[26px] border border-slate-200 bg-white p-4" key={user.id}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-display text-xl font-semibold text-slate-950">{user.name}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={user.isActive ? "success" : "danger"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                        <Badge variant={user.role === "super_admin" ? "warning" : "neutral"}>{user.role === "super_admin" ? "Owner" : "Customer service"}</Badge>
                      </div>
                    </div>
                    {isFullOwner ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button onClick={() => editOwnerPortalUser(user)} size="sm" type="button" variant="secondary">Edit</Button>
                        <Button
                          onClick={() => void updateOwnerTeamUserAccess(user, !user.isActive)}
                          size="sm"
                          type="button"
                          variant={user.isActive ? "danger" : "secondary"}
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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

          {brandingView !== "team" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">{brandingSavedAt ? "Branding saved" : "Save branding"}</Button>
              <Badge variant={brandingSavedAt ? "success" : "warning"}>
                {brandingSavedAt ? `Saved at ${brandingSavedAt}` : "Not saved yet"}
              </Badge>
            </div>
          ) : null}
        </form>
      </Card>
    );
  };

  const renderAccess = () => {
    const selectedResetUser = selectedUsers.find((user) => user.id === selectedResetUserId);

    if (!accessDetailOpen) {
      return (
        <div className="grid gap-5">
          <Card className="p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <Input
                placeholder="Search store before support access"
                value={storeSearch}
                onChange={(event) => setStoreSearch(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "All"],
                  ["active", "Active"],
                  ["trial", "Trial"],
                  ["expiring", "Expiring"],
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
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredStoreRows.map((row) => (
              <button
                className="rounded-[28px] border border-white/80 bg-white/86 p-5 text-left shadow-[0_18px_48px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_20px_46px_rgba(124,58,237,0.10)]"
                key={row.shop.id}
                onClick={() => {
                  setSelectedShopId(row.shop.id);
                  setSelectedResetUserId("");
                  setAccessDetailOpen(true);
                }}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-2xl font-semibold text-slate-950">{row.shop.name}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{row.shop.email || row.shop.phone || "No contact saved"}</p>
                  </div>
                  <Badge variant={licenseVariant(row.status)}>{row.status}</Badge>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="font-display text-xl font-semibold text-slate-950">{row.users.length}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Users</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="font-display text-xl font-semibold text-slate-950">{row.devices.length}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Devices</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {filteredStoreRows.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="font-display text-2xl font-semibold text-slate-950">No stores found</p>
            </Card>
          ) : null}
        </div>
      );
    }

    return (
      <div className="grid gap-5">
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={() => setAccessDetailOpen(false)} type="button" variant="secondary">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to store selection
            </Button>
            <div className="flex flex-wrap gap-2">
              <Badge variant={licenseVariant(getEffectiveLicenseStatus(selectedLicense))}>{getEffectiveLicenseStatus(selectedLicense)}</Badge>
              <Badge variant="neutral">{selectedUsers.length} users</Badge>
              <Badge variant="neutral">{selectedDevices.length} devices</Badge>
            </div>
          </div>
        </Card>

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
                          shopId: selectedResetUser.cloudShopId ?? selectedShop.id,
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
    <div className="space-y-5">
      <div className="sticky top-2 z-30">
        <Card className="overflow-x-auto border-white/80 bg-white/82 p-2 text-slate-950 shadow-[0_20px_54px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
          <nav className="flex min-w-max items-center gap-2" aria-label="Owner portal navigation">
            {ownerSections.map((section) => (
              <SectionButton
                active={activeSection === section.id}
                description={section.description}
                icon={section.icon}
                key={section.id}
                label={section.label}
                onClick={() => {
                  setActiveSection(section.id);
                  if (section.id === "stores") {
                    setStoreDetailOpen(false);
                    setStoreCreateOpen(false);
                  }
                  if (section.id === "branding") {
                    setBrandingView("menu");
                  }
                  if (section.id === "access") {
                    setAccessDetailOpen(false);
                  }
                  if (section.id === "team") {
                    setBrandingView("team");
                  }
                }}
              />
            ))}
          </nav>
        </Card>
      </div>

      <section className="min-w-0 space-y-4">
        {message ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">{message}</div> : null}

        {activeSection === "overview" ? renderOverview() : null}
        {activeSection === "stores" ? renderStores() : null}
        {activeSection === "keys" ? renderKeys() : null}
        {activeSection === "billing" ? renderBilling() : null}
        {activeSection === "reports" ? renderReports() : null}
        {activeSection === "branding" ? renderBranding() : null}
        {activeSection === "team" ? renderBranding() : null}
        {activeSection === "access" ? renderAccess() : null}
        {activeSection === "audit" ? renderAudit() : null}
      </section>
    </div>
  );
}
