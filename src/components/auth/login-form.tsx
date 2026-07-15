"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Globe2, KeyRound, LockKeyhole, LogOut, Mail, Phone, Quote, ShieldCheck, Store } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DemoAppState } from "@/types/pos";

const DEVICE_FINGERPRINT_KEY = "simple-pos-device-fingerprint";
const CLOUD_ACTIVATION_STORAGE_KEY = "simple-pos-cloud-activation-state-v3";

type CloudActivationResponse = {
  ok: boolean;
  message?: string;
  cloudState?: Partial<
    Pick<
      DemoAppState,
      "brand" | "categories" | "deviceActivations" | "licenses" | "productKeys" | "settingsByShop" | "shops" | "users"
    >
  > | null;
  hasShopAdmin?: boolean;
  shopId?: string;
};

type ShopCloudLoginResponse = {
  ok: boolean;
  message?: string;
  user?: DemoAppState["users"][number];
};

type OwnerCloudLoginResponse = ShopCloudLoginResponse;

function getBrowserInfo() {
  return typeof window === "undefined" ? "" : window.navigator.userAgent;
}

function getDeviceFingerprint() {
  if (typeof window === "undefined") {
    return "server-device";
  }

  const existingFingerprint = window.localStorage.getItem(DEVICE_FINGERPRINT_KEY);

  if (existingFingerprint) {
    return existingFingerprint;
  }

  const fingerprint =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(DEVICE_FINGERPRINT_KEY, fingerprint);

  return fingerprint;
}

function getPortalMode() {
  if (typeof window === "undefined") {
    return "pos" as const;
  }

  const hostname = window.location.hostname.toLowerCase();
  const isOwnerHost = hostname === "owner.globalfsms.com" || hostname.startsWith("owner.");

  return isOwnerHost || window.location.port === "3001" ? ("owner" as const) : ("pos" as const);
}

function isLocalDemoHost() {
  if (typeof window === "undefined") {
    return false;
  }

  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function cacheCloudActivationState(productKey: string, cloudState: CloudActivationResponse["cloudState"]) {
  if (typeof window === "undefined" || !cloudState) {
    return;
  }

  window.sessionStorage.setItem(
    CLOUD_ACTIVATION_STORAGE_KEY,
    JSON.stringify({
      productKey,
      state: cloudState
    })
  );
}

export function LoginForm() {
  const router = useRouter();
  const { activateProductKey, completeCloudLogin, logoutStoreDevice, mergeCloudActivationState, state, login, t } = usePosApp();
  const [mode, setMode] = useState<"pos" | "owner">("pos");
  const [browserInfo, setBrowserInfo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [storeLogoutOpen, setStoreLogoutOpen] = useState(false);
  const [storeLogoutPassword, setStoreLogoutPassword] = useState("");
  const [storeLogoutMessage, setStoreLogoutMessage] = useState<string | null>(null);
  const hasLoadedPublicBrand = useRef(false);

  useEffect(() => {
    setMode(getPortalMode());
    setBrowserInfo(getBrowserInfo());
    setQuoteIndex(Math.floor(Math.random() * Math.max(1, state.brand.loginQuotes.length)));
    setHeroImageIndex(Math.floor(Math.random() * Math.max(1, state.brand.loginHeroImages?.length ?? 0)));
  }, [state.brand.loginHeroImages?.length, state.brand.loginQuotes.length]);

  useEffect(() => {
    if (hasLoadedPublicBrand.current) {
      return;
    }

    hasLoadedPublicBrand.current = true;
    let active = true;

    const loadPublicBrand = async () => {
      try {
        const response = await fetch("/api/brand", { cache: "no-store" });
        const payload = (await response.json()) as { brand?: DemoAppState["brand"] | null; ok: boolean };

        if (active && payload.ok && payload.brand) {
          mergeCloudActivationState({ brand: payload.brand });
        }
      } catch {
        // Branding is cosmetic; the login must keep working even if this fetch is offline.
      }
    };

    void loadPublicBrand();

    return () => {
      active = false;
    };
  }, [mergeCloudActivationState]);

  const activatedProductKey = useMemo(() => {
    const activatedDevice = state.deviceActivations
      .filter((activation) => activation.browserInfo === browserInfo)
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))[0];

    if (!activatedDevice) {
      return undefined;
    }

    return state.productKeys.find(
      (productKey) =>
        productKey.id === activatedDevice.productKeyId &&
        productKey.shopId === activatedDevice.shopId &&
        productKey.status === "active"
    );
  }, [browserInfo, state.deviceActivations, state.productKeys]);

  const activatedShop = activatedProductKey
    ? state.shops.find((shop) => shop.id === activatedProductKey.shopId) ?? null
    : null;
  const activatedProductKeyAliases = useMemo(
    () =>
      activatedProductKey
        ? state.productKeys.filter((productKey) => productKey.key.trim() === activatedProductKey.key.trim())
        : [],
    [activatedProductKey, state.productKeys]
  );
  const activatedShopIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...(activatedShop ? [activatedShop.id] : []),
          ...activatedProductKeyAliases.map((productKey) => productKey.shopId)
        ])
      ),
    [activatedProductKeyAliases, activatedShop]
  );
  const activatedShopHasAdmin = Boolean(
    activatedShop && state.users.some((user) => user.shopId && activatedShopIds.includes(user.shopId) && user.role === "shop_admin")
  );
  const activatedSettings = activatedShop ? state.settingsByShop[activatedShop.id] : null;
  const shopLogo = activatedSettings?.pos.logoUrl;
  const visibleQuotes = state.brand.loginQuotes.filter((quote) => quote.trim());
  const visibleQuote = visibleQuotes[quoteIndex % Math.max(visibleQuotes.length, 1)] ?? "Fast billing. Clean records. Confident closing.";
  const visibleHeroImages = (state.brand.loginHeroImages ?? []).filter((imageUrl) => imageUrl.trim());
  const heroImage =
    visibleHeroImages[heroImageIndex % Math.max(visibleHeroImages.length, 1)] ??
    state.brand.logoUrl;
  const brandInitials = state.brand.posName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const shopInitials = (activatedShop?.name ?? "Store")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const brandWebsite = state.brand.website?.trim()
    ? /^https?:\/\//i.test(state.brand.website)
      ? state.brand.website
      : `https://${state.brand.website}`
    : null;
  const brandPhone = state.brand.supportPhone?.trim() || state.brand.supportWhatsapp?.trim();
  const registeredShopUsers = useMemo(
    () =>
      activatedShop
        ? state.users
            .filter((user) => user.shopId && activatedShopIds.includes(user.shopId) && user.isActive && user.role !== "support")
            .sort((left, right) => {
              if (left.role === right.role) {
                return left.name.localeCompare(right.name);
              }

              return left.role === "shop_admin" ? -1 : 1;
            })
        : [],
    [activatedShop, activatedShopIds, state.users]
  );
  const selectedUser = registeredShopUsers.find((user) => user.id === selectedUserId) ?? registeredShopUsers[0];
  const ownerUser = state.users.find((user) => user.role === "super_admin" && user.isActive);
  const isOwnerMode = mode === "owner";
  const requiresActivation = !isOwnerMode && !activatedShop;
  const requiresFirstRunSetup = !isOwnerMode && Boolean(activatedShop) && !activatedShopHasAdmin;

  useEffect(() => {
    if (isOwnerMode) {
      setEmail(ownerUser?.email ?? "");
      return;
    }

    if (activatedShop && activatedShopHasAdmin) {
      const preferredUser = registeredShopUsers.find((user) => user.role === "shop_admin") ?? registeredShopUsers[0];

      setSelectedUserId((current) => {
        const currentUserStillExists = registeredShopUsers.some((user) => user.id === current);

        return currentUserStillExists ? current : preferredUser?.id ?? "";
      });
      setEmail(preferredUser?.email ?? "");
    }
  }, [activatedShop, activatedShopHasAdmin, isOwnerMode, ownerUser?.email, registeredShopUsers, state.users]);

  useEffect(() => {
    if (!isOwnerMode && selectedUser) {
      setEmail(selectedUser.email);
    }
  }, [isOwnerMode, selectedUser]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    if (isOwnerMode) {
      try {
        const response = await fetch("/api/auth/owner-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const payload = (await response.json()) as OwnerCloudLoginResponse;

        if (!payload.ok || !payload.user) {
          setError(payload.message ?? t("login.error"));
          return;
        }

        const cloudResult = completeCloudLogin({ user: payload.user, workspace: "owner" });

        if (!cloudResult.ok) {
          setError(cloudResult.message ?? t("login.error"));
          return;
        }

        router.push("/owner");
      } catch {
        setError("Unable to reach the owner authentication service.");
      } finally {
        setIsPending(false);
      }

      return;
    }

    const result = login({
      email,
      password,
      workspace: "shop"
    });

    if (result.ok) {
      router.push(result.workspace === "owner" ? "/owner" : "/dashboard");
      setIsPending(false);
      return;
    }

    if (!activatedShop) {
      setError(result.message ?? t("login.error"));
      setIsPending(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/shop-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password,
          shopId: activatedShop.id
        })
      });
      const payload = (await response.json()) as ShopCloudLoginResponse;

      if (!payload.ok || !payload.user) {
        setError(payload.message ?? result.message ?? t("login.error"));
        setIsPending(false);
        return;
      }

      const cloudResult = completeCloudLogin({
        user: payload.user,
        workspace: "shop"
      });

      if (!cloudResult.ok) {
        setError(cloudResult.message ?? t("login.error"));
        setIsPending(false);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError(result.message ?? t("login.error"));
    } finally {
      setIsPending(false);
    }
  };

  const activateKey = async () => {
    setActivationMessage(null);
    setError(null);
    const normalizedActivationKey = activationKey.trim();
    const productKeysBeforeActivation = state.productKeys.filter(
      (productKey) => productKey.key.trim() === normalizedActivationKey
    );
    const shopIdsBeforeActivation = productKeysBeforeActivation.map((productKey) => productKey.shopId);
    const shopAlreadyHasAdmin =
      shopIdsBeforeActivation.length > 0
        ? state.users.some((user) => user.shopId && shopIdsBeforeActivation.includes(user.shopId) && user.role === "shop_admin")
        : false;

    setIsPending(true);

    try {
      const response = await fetch("/api/activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          browserInfo: browserInfo || getBrowserInfo(),
          deviceFingerprint: getDeviceFingerprint(),
          productKey: normalizedActivationKey
        })
      });
      const payload = (await response.json()) as CloudActivationResponse;

      if (payload.ok && payload.cloudState) {
        cacheCloudActivationState(normalizedActivationKey, payload.cloudState);
        mergeCloudActivationState(payload.cloudState);

        if (!payload.hasShopAdmin && !shopAlreadyHasAdmin) {
          setActivationMessage("Activation accepted. Complete the first-time store setup to create the shop admin.");
          router.push(`/register?key=${encodeURIComponent(normalizedActivationKey)}`);
          setIsPending(false);
          return;
        }

        setActivationMessage("Store activated on this device. You can now sign in with the store users.");
        setIsPending(false);
        return;
      }

      if (!isLocalDemoHost() || (response.status !== 404 && response.status !== 500)) {
        setActivationMessage(payload.message ?? "Product key activation failed.");
        setIsPending(false);
        return;
      }
    } catch {
      if (!isLocalDemoHost()) {
        setActivationMessage("Could not reach the online activation service. Please refresh and try again.");
        setIsPending(false);
        return;
      }

      // Keep the local fallback available for localhost/demo mode only.
    }

    const result = activateProductKey({
      key: normalizedActivationKey,
      browserInfo: browserInfo || getBrowserInfo()
    });

    if (!result.ok) {
      setActivationMessage(result.message ?? "Product key activation failed.");
      setIsPending(false);
      return;
    }

    if (!shopAlreadyHasAdmin) {
      setActivationMessage("Activation accepted. Complete the first-time store setup to create the shop admin.");
      router.push(`/register?key=${encodeURIComponent(normalizedActivationKey)}`);
      setIsPending(false);
      return;
    }

    setActivationMessage("Store activated on this device. You can now sign in with the store users.");
    setIsPending(false);
  };

  const handleStoreLogout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStoreLogoutMessage(null);

    if (!activatedShop) {
      setStoreLogoutMessage("No active store found on this device.");
      return;
    }

    const result = logoutStoreDevice({
      shopId: activatedShop.id,
      browserInfo: browserInfo || getBrowserInfo(),
      adminPassword: storeLogoutPassword
    });

    if (!result.ok) {
      setStoreLogoutMessage(result.message ?? "Could not log out this store.");
      return;
    }

    setStoreLogoutPassword("");
    setStoreLogoutOpen(false);
    setPassword("");
    setSelectedUserId("");
    setEmail("");
    setActivationMessage(result.message ?? "Store logged out from this device.");
  };

  return (
    <div className="w-full">
      <Card className="overflow-hidden rounded-[34px] border-0 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <div className="grid min-h-[560px] lg:grid-cols-[0.95fr_1.05fr]">
          <section className="order-2 flex min-w-0 flex-col justify-between gap-6 border-t border-slate-100 bg-[#f5f1ff] p-7 sm:p-10 lg:order-1 lg:border-r lg:border-t-0">
            <div>
              <div className="flex min-w-0 items-center gap-4">
                {state.brand.logoUrl ? (
                  <img alt={state.brand.companyName} className="h-14 w-14 object-contain" src={state.brand.logoUrl} />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-gradient-to-br from-emerald-100 to-sky-100 font-display text-lg font-semibold text-slate-800 ring-1 ring-slate-200/70">
                    {brandInitials || "POS"}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                    {isOwnerMode ? "Owner portal" : requiresActivation ? state.brand.posName : state.brand.companyName}
                  </p>
                  {!requiresActivation ? (
                    <h1 className="mt-2 max-w-[420px] font-display text-4xl font-medium leading-tight text-slate-950 sm:text-5xl">
                      {state.brand.posName}
                    </h1>
                  ) : null}
                </div>
              </div>

              <div className="mt-7 flex items-start gap-3 px-2">
                <Quote className="mt-1 h-6 w-6 shrink-0 text-emerald-600" />
                <p className="font-display text-xl font-medium leading-snug text-slate-900 sm:text-2xl">
                  {visibleQuote}
                </p>
              </div>

              <div className="relative -mx-2 mt-5 overflow-hidden rounded-[42px] bg-[#f5f1ff]">
                {heroImage ? (
                  <img
                    alt={state.brand.posName}
                    className="h-[310px] w-full max-w-full scale-[1.02] rounded-[42px] object-cover sm:h-[360px] lg:h-[390px]"
                    src={heroImage}
                  />
                ) : (
                  <div className="h-[310px] w-full rounded-[42px] bg-[radial-gradient(circle_at_20%_20%,_rgba(245,158,11,0.24),_transparent_30%),radial-gradient(circle_at_80%_10%,_rgba(16,185,129,0.22),_transparent_28%),linear-gradient(135deg,#e2f7ef_0%,#f8fafc_48%,#fff7df_100%)] sm:h-[360px] lg:h-[390px]" />
                )}
                <div
                  className="pointer-events-none absolute inset-0 rounded-[42px]"
                  style={{
                    background:
                      "linear-gradient(to right, #f5f1ff 0%, transparent 9%, transparent 91%, #f5f1ff 100%), linear-gradient(to bottom, #f5f1ff 0%, transparent 10%, transparent 90%, #f5f1ff 100%)",
                  }}
                />
              </div>
            </div>
          </section>

          <section className="order-1 flex min-w-0 flex-col justify-between p-7 sm:p-10 lg:order-2">
            <div className="flex justify-end">
              <LocaleSwitcher className="min-w-[170px]" showLabel={false} />
            </div>
            <div className="mx-auto flex w-full max-w-[450px] flex-1 flex-col justify-center py-8">
        {requiresFirstRunSetup ? (
          <div>
            <span className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
              <Store className="h-5 w-5" />
            </span>
            <h2 className="mt-5 font-display text-4xl font-medium text-slate-950">Create first admin</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {activatedShop?.name} is already created and this device is activated. Add the first admin login once; after that this screen becomes the normal staff sign-in.
            </p>
            <div className="mt-7 space-y-4">
              <Button asChild className="w-full">
                <Link href={`/register?key=${encodeURIComponent(activatedProductKey?.key ?? "")}`}>Create first admin</Link>
              </Button>
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                Store details come from the activation key; this step only creates the first user login.
              </p>
            </div>
          </div>
        ) : requiresActivation ? (
          <div>
            <span className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
              <KeyRound className="h-5 w-5" />
            </span>
            <h2 className="mt-5 font-display text-4xl font-medium text-slate-950">Activate store POS</h2>
            <div className="mt-7 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-950">Activation key</span>
                <Input autoComplete="off" className="h-14 rounded-[10px] border-slate-400 bg-white font-mono text-base focus:border-blue-600" placeholder="SPOS-KSA-..." value={activationKey} onChange={(event) => setActivationKey(event.target.value)} />
              </label>
              {activationMessage ? (
                <p className={cn("rounded-2xl px-4 py-3 text-sm font-semibold", activationMessage.includes("accepted") || activationMessage.includes("activated") ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
                  {activationMessage}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:items-center sm:justify-end">
                <Button asChild className="rounded-full px-5" variant="ghost">
                  <Link href="/register">First-time setup</Link>
                </Button>
                <Button className="rounded-full px-7" disabled={isPending} onClick={activateKey}>
                {isPending ? "Verifying..." : "Verify activation key"}
              </Button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {isOwnerMode ? (
              <div>
                <span className="inline-flex rounded-2xl bg-slate-950 p-3 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Owner sign in</p>
                <h2 className="mt-2 font-display text-4xl font-medium text-slate-950">Open owner portal</h2>
              </div>
            ) : (
              <div className="flex items-center gap-4 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                {shopLogo ? (
                  <img alt={activatedShop?.name ?? "Shop"} className="h-16 w-16 shrink-0 object-contain" src={shopLogo} />
                ) : (
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] bg-gradient-to-br from-emerald-100 to-sky-100 font-display text-lg font-semibold text-slate-800 ring-1 ring-slate-200/70">
                    {shopInitials}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Staff sign in</p>
                  <h2 className="mt-1 truncate font-display text-3xl font-medium text-slate-950">{activatedShop?.name}</h2>
                  {activatedShop?.address || activatedShop?.phone ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">
                      {[activatedShop.address, activatedShop.phone].filter(Boolean).join(" | ")}
                    </p>
                  ) : null}
                </div>
              </div>
            )}

            <form className="mt-7 space-y-5" onSubmit={submit}>
              {isOwnerMode ? (
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-950">{t("login.email")}</span>
                  <Input autoComplete="email" className="h-14 rounded-[10px] border-slate-400 bg-white text-base focus:border-blue-600" value={email} onChange={(event) => setEmail(event.target.value)} />
                </label>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-950">Registered user</span>
                  <Select
                    className="h-14 rounded-[10px] border-slate-400 bg-white text-base focus:border-blue-600"
                    value={selectedUser?.id ?? ""}
                    onChange={(event) => {
                      const nextUser = registeredShopUsers.find((user) => user.id === event.target.value);

                      setSelectedUserId(event.target.value);
                      setEmail(nextUser?.email ?? "");
                    }}
                  >
                    {registeredShopUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} - {user.role === "shop_admin" ? "Admin" : "Cashier"}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-950">{t("login.password")}</span>
                <Input autoComplete="current-password" className="h-14 rounded-[10px] border-slate-400 bg-white text-base focus:border-blue-600" minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>

              {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

              <div className="flex justify-end pt-3">
                <Button className="rounded-full px-8" disabled={isPending} type="submit">
                {isPending ? t("login.openingWorkspace") : (
                  <span className="inline-flex items-center gap-2">
                    <LockKeyhole className="h-4 w-4" />
                    {t("common.signIn")}
                  </span>
                )}
              </Button>
              </div>
            </form>

            {!isOwnerMode && activatedShop ? (
              <div className="mt-6 border-t border-slate-200 pt-5">
                {!storeLogoutOpen ? (
                  <button
                    className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-red-700"
                    onClick={() => {
                      setStoreLogoutOpen(true);
                      setStoreLogoutMessage(null);
                    }}
                    type="button"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out this store from this device
                  </button>
                ) : (
                  <form className="rounded-[28px] border border-red-100 bg-red-50/60 p-4" onSubmit={handleStoreLogout}>
                    <div className="flex items-start gap-3">
                      <span className="rounded-2xl bg-white p-2 text-red-700">
                        <LogOut className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-semibold text-slate-950">Confirm store logout</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          Enter a store admin password. This removes activation from this browser only.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                      <Input
                        autoComplete="current-password"
                        minLength={8}
                        placeholder="Admin password"
                        type="password"
                        value={storeLogoutPassword}
                        onChange={(event) => setStoreLogoutPassword(event.target.value)}
                      />
                      <Button type="submit" variant="danger">
                        Confirm
                      </Button>
                      <Button
                        onClick={() => {
                          setStoreLogoutOpen(false);
                          setStoreLogoutPassword("");
                          setStoreLogoutMessage(null);
                        }}
                        type="button"
                        variant="secondary"
                      >
                        Cancel
                      </Button>
                    </div>
                    {storeLogoutMessage ? <p className="mt-3 text-sm font-semibold text-red-700">{storeLogoutMessage}</p> : null}
                  </form>
                )}
              </div>
            ) : null}
          </div>
        )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 border-t border-slate-100 pt-5 text-xs font-semibold text-slate-500">
              <span className="uppercase tracking-[0.18em] text-slate-400">{state.brand.companyName}</span>
              {brandWebsite ? (
                <a className="inline-flex items-center gap-1.5 transition hover:text-emerald-700" href={brandWebsite} rel="noreferrer" target="_blank">
                  <Globe2 className="h-3.5 w-3.5" />
                  {state.brand.website?.replace(/^https?:\/\//i, "")}
                </a>
              ) : null}
              {state.brand.supportEmail ? (
                <a className="inline-flex items-center gap-1.5 transition hover:text-sky-700" href={`mailto:${state.brand.supportEmail}`}>
                  <Mail className="h-3.5 w-3.5" />
                  {state.brand.supportEmail}
                </a>
              ) : null}
              {brandPhone ? (
                <a className="inline-flex items-center gap-1.5 transition hover:text-amber-700" href={`tel:${brandPhone.replace(/[^+\d]/g, "")}`}>
                  <Phone className="h-3.5 w-3.5" />
                  {brandPhone}
                </a>
              ) : null}
            </div>
          </section>
        </div>
      </Card>
    </div>
  );
}
