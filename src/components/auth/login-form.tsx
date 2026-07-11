"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LockKeyhole, LogOut, ShieldCheck, Sparkles, Store, UserRound } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DemoAppState } from "@/types/pos";

const DEVICE_FINGERPRINT_KEY = "simple-pos-device-fingerprint";
const CLOUD_ACTIVATION_STORAGE_KEY = "simple-pos-cloud-activation-state";

type CloudActivationResponse = {
  ok: boolean;
  message?: string;
  cloudState?: Partial<
    Pick<
      DemoAppState,
      "categories" | "deviceActivations" | "licenses" | "productKeys" | "settingsByShop" | "shops" | "users"
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

  useEffect(() => {
    setMode(getPortalMode());
    setBrowserInfo(getBrowserInfo());
    setQuoteIndex(Math.floor(Math.random() * Math.max(1, state.brand.loginQuotes.length)));
    setHeroImageIndex(Math.floor(Math.random() * Math.max(1, state.brand.loginHeroImages?.length ?? 0)));
  }, [state.brand.loginHeroImages?.length, state.brand.loginQuotes.length]);

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
    state.brand.logoUrl ??
    shopLogo;
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

    const result = login({
      email,
      password,
      workspace: isOwnerMode ? "owner" : "shop"
    });

    if (result.ok) {
      router.push(result.workspace === "owner" ? "/owner" : "/dashboard");
      setIsPending(false);
      return;
    }

    if (isOwnerMode || !activatedShop) {
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
    <div className="grid gap-5 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] lg:overflow-hidden">
      <Card className="relative overflow-hidden border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_34%),linear-gradient(145deg,#ffffff_0%,#eef8f3_100%)] p-4 sm:p-6 lg:h-full lg:p-7">
        <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="absolute bottom-[-150px] left-[-120px] h-80 w-80 rounded-full bg-amber-200/35 blur-3xl" />

        <div className="relative flex h-full min-h-[540px] flex-col gap-5 lg:min-h-0">
          <div className="flex shrink-0 items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              {shopLogo ? (
                <img alt={activatedShop?.name ?? state.brand.posName} className="h-14 w-14 rounded-[22px] object-cover shadow-[0_18px_40px_rgba(15,23,42,0.16)]" src={shopLogo} />
              ) : state.brand.logoUrl ? (
                <img alt={state.brand.companyName} className="h-14 w-14 rounded-[22px] object-cover shadow-[0_18px_40px_rgba(15,23,42,0.16)]" src={state.brand.logoUrl} />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-[22px] bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
                  <Store className="h-7 w-7" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  {isOwnerMode ? "Owner portal" : activatedShop ? "Store POS" : "POS activation"}
                </p>
                <h1 className="mt-1 truncate font-display text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
                  {isOwnerMode ? state.brand.posName : activatedShop?.name ?? "Activate this store"}
                </h1>
              </div>
            </div>
            <LocaleSwitcher className="min-w-[150px]" showLabel={false} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-[36px] border border-white/80 bg-slate-950 shadow-[0_30px_90px_rgba(15,23,42,0.18)]">
              {heroImage ? (
                <img alt={state.brand.posName} className="h-full w-full object-cover" src={heroImage} />
              ) : (
                <div className="grid h-full min-h-[360px] place-items-center bg-[radial-gradient(circle_at_30%_20%,_rgba(16,185,129,0.42),_transparent_32%),radial-gradient(circle_at_80%_10%,_rgba(245,158,11,0.34),_transparent_26%),linear-gradient(135deg,#020617_0%,#064e3b_100%)]">
                  <div className="text-center text-white">
                    <Sparkles className="mx-auto h-14 w-14 text-emerald-100" />
                    <p className="mt-5 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">{state.brand.companyName}</p>
                    <p className="mt-2 font-display text-5xl font-semibold">{state.brand.posName}</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/24 to-transparent p-6 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/80">
                  {activatedShop ? "Ready for checkout" : "Simple POS workspace"}
                </p>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">
                  {isOwnerMode
                    ? "Owner controls stay separate from the client POS."
                    : activatedShop
                      ? `${activatedShop.address || "Store workspace"} | ${activatedShop.phone || "No phone saved"}`
                      : "Activate once, then keep the counter fast and clean."}
                </p>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/80 bg-white/75 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Counter quote</p>
              <p className="mt-3 font-display text-2xl font-semibold leading-tight text-slate-950">"{visibleQuote}"</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {isOwnerMode
                  ? "Manage stores, keys, licenses, branding, and access from a separate owner workspace."
                  : activatedShop
                    ? `${activatedShop.address || "Store workspace"} | ${activatedShop.phone || "No phone saved"}`
                    : "Enter the activation key once. After that, this page becomes the normal user sign-in screen for this store."}
              </p>
            </div>
          </div>

          <p className="relative shrink-0 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {state.brand.companyName} | {state.brand.supportPhone}
          </p>
        </div>
      </Card>

      <Card className="flex flex-col justify-center border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-8 lg:h-full lg:p-8">
        {requiresFirstRunSetup ? (
          <div>
            <span className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
              <Store className="h-5 w-5" />
            </span>
            <h2 className="mt-5 font-display text-3xl font-semibold text-slate-950">Create first admin</h2>
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
            <h2 className="mt-5 font-display text-3xl font-semibold text-slate-950">Activate store POS</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This is shown only until the store is activated on this browser/device.
            </p>
            <div className="mt-7 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-950">Activation key</span>
                <Input autoComplete="off" className="font-mono" placeholder="SPOS-KSA-..." value={activationKey} onChange={(event) => setActivationKey(event.target.value)} />
              </label>
              {activationMessage ? (
                <p className={cn("rounded-2xl px-4 py-3 text-sm font-semibold", activationMessage.includes("accepted") || activationMessage.includes("activated") ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
                  {activationMessage}
                </p>
              ) : null}
              <Button className="w-full" disabled={isPending} onClick={activateKey}>
                {isPending ? "Verifying..." : "Verify activation key"}
              </Button>
              <Button asChild className="w-full" variant="secondary">
                <Link href="/register">First-time store setup</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <span className="inline-flex rounded-2xl bg-slate-950 p-3 text-white">
              {isOwnerMode ? <ShieldCheck className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
            </span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              {isOwnerMode ? "Owner sign in" : "User sign in"}
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">
              {isOwnerMode ? "Open owner portal" : "Open the POS"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {isOwnerMode
                ? "Owner login is separate from store users."
                : `Choose the registered staff user for ${activatedShop?.name ?? "this store"}.`}
            </p>

            <form className="mt-7 space-y-5" onSubmit={submit}>
              {isOwnerMode ? (
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-950">{t("login.email")}</span>
                  <Input autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </label>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-950">Registered user</span>
                  <Select
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
                <Input autoComplete="current-password" minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>

              {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

              <Button className="w-full" disabled={isPending} type="submit">
                {isPending ? t("login.openingWorkspace") : (
                  <span className="inline-flex items-center gap-2">
                    <LockKeyhole className="h-4 w-4" />
                    {t("common.signIn")}
                  </span>
                )}
              </Button>
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
      </Card>
    </div>
  );
}
