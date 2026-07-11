"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, KeyRound, ReceiptText, ShieldCheck, UserRoundPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { resizeImageFileToDataUrl } from "@/lib/image-upload";
import { cn } from "@/lib/utils";
import type { DemoAppState } from "@/types/pos";

const CLOUD_ACTIVATION_STORAGE_KEY = "simple-pos-cloud-activation-state";

const steps = [
  { id: "setup", label: "Store login", icon: ShieldCheck },
  { id: "shop", label: "Shop details", icon: Building2 },
  { id: "tax", label: "VAT and receipt", icon: ReceiptText },
  { id: "admin", label: "Admin user", icon: UserRoundPlus },
  { id: "key", label: "Activation key", icon: KeyRound }
] as const;

type StepId = (typeof steps)[number]["id"];

type RegisterFormState = {
  setupEmail: string;
  setupPassword: string;
  productKey: string;
  shopName: string;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  currency: string;
  vatNumber: string;
  taxEnabled: boolean;
  taxName: string;
  taxRate: number;
  taxMode: "inclusive" | "exclusive";
  receiptFooterText: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
};

type CompleteInstallationResponse = {
  adminUser?: DemoAppState["users"][number];
  alreadyInstalled?: boolean;
  message?: string;
  ok: boolean;
  shopId?: string;
};

async function loadLocalOwnerSnapshot() {
  try {
    const response = await fetch("/api/local-owner-state", { cache: "no-store" });
    const payload = (await response.json()) as { state?: DemoAppState | null };

    return payload.state ?? null;
  } catch {
    return null;
  }
}

async function completeCloudInstallation(payload: RegisterFormState) {
  const response = await fetch("/api/installation/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as CompleteInstallationResponse;

  return {
    ...result,
    status: response.status
  };
}

function loadCachedCloudActivationSnapshot(productKey?: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CLOUD_ACTIVATION_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { productKey?: string; state?: Partial<DemoAppState> | null };

    if (productKey && parsed.productKey?.trim() !== productKey.trim()) {
      return null;
    }

    return parsed.state ?? null;
  } catch {
    return null;
  }
}

function findActivationDetails(snapshot: Partial<DemoAppState> | null, productKey: string) {
  const activatedKey = snapshot?.productKeys?.find((entry) => entry.key.trim() === productKey.trim());
  const shop = activatedKey ? snapshot?.shops?.find((entry) => entry.id === activatedKey.shopId) : null;
  const settings = shop ? snapshot?.settingsByShop?.[shop.id] : null;

  if (!shop) {
    return null;
  }

  return { shop, settings };
}

export default function RegisterPage() {
  const router = useRouter();
  const { registerInstalledShop, state } = usePosApp();
  const [activeStep, setActiveStep] = useState<StepId>("setup");
  const [error, setError] = useState<string | null>(null);
  const [logoFeedback, setLogoFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<RegisterFormState>({
    setupEmail: "",
    setupPassword: "",
    productKey: "",
    shopName: "",
    logoUrl: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    currency: "SAR",
    vatNumber: "",
    taxEnabled: true,
    taxName: "VAT",
    taxRate: 15,
    taxMode: "inclusive" as "inclusive" | "exclusive",
    receiptFooterText: "",
    adminName: "",
    adminEmail: "",
    adminPhone: "",
    adminPassword: ""
  });

  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  const isFinalStep = activeStep === "key";

  useEffect(() => {
    const queryProductKey = new URLSearchParams(window.location.search).get("key")?.trim();

    if (queryProductKey) {
      setForm((current) => ({
        ...current,
        productKey: current.productKey || queryProductKey
      }));
    }
  }, []);

  useEffect(() => {
    if (!form.productKey) {
      return;
    }

    const cachedSnapshot = loadCachedCloudActivationSnapshot(form.productKey);
    const cachedDetails = findActivationDetails(cachedSnapshot, form.productKey);
    const productKey = state.productKeys.find((entry) => entry.key.trim() === form.productKey.trim());
    const localShop = productKey ? state.shops.find((entry) => entry.id === productKey.shopId) : null;
    const localSettings = localShop ? state.settingsByShop[localShop.id] : null;
    const shop = cachedDetails?.shop ?? localShop;
    const settings = cachedDetails?.settings ?? localSettings;

    if (!shop) {
      return;
    }

    if (cachedDetails) {
      setActiveStep((current) => (current === "setup" ? "admin" : current));
    }

    setForm((current) => ({
      ...current,
      setupEmail: current.setupEmail || shop.setupEmail || settings?.pos.email || shop.email || "",
      shopName: current.shopName || settings?.pos.shopName || shop.name,
      address: current.address || settings?.pos.address || shop.address,
      phone: current.phone || settings?.pos.phone || shop.phone,
      email: current.email || settings?.pos.email || shop.email || "",
      website: current.website || settings?.pos.website || shop.website || "",
      currency: current.currency || settings?.pos.currency || shop.currency || "SAR",
      vatNumber: current.vatNumber || settings?.pos.vatNumber || "",
      taxEnabled: settings?.tax.enabled ?? current.taxEnabled,
      taxName: current.taxName || settings?.tax.name || "VAT",
      taxRate: current.taxRate || settings?.tax.rate || 15,
      taxMode: settings?.tax.mode ?? current.taxMode,
      receiptFooterText: current.receiptFooterText || settings?.receipt.footerText || `Thank you for visiting ${shop.name}.`
    }));
  }, [form.productKey, state.productKeys, state.settingsByShop, state.shops]);

  const updateForm = <TKey extends keyof typeof form>(key: TKey, value: (typeof form)[TKey]) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const goNext = () => {
    const nextStep = steps[activeIndex + 1];

    if (nextStep) {
      setActiveStep(nextStep.id);
    }
  };

  const goBack = () => {
    const previousStep = steps[activeIndex - 1];

    if (previousStep) {
      setActiveStep(previousStep.id);
    }
  };

  const loadLogo = async (file?: File) => {
    if (!file) {
      return;
    }

    setLogoFeedback(null);

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

      updateForm("logoUrl", result.dataUrl);
      setLogoFeedback({
        tone: "success",
        message: `Logo optimized to ${result.width}x${result.height}.`
      });
    } catch (error) {
      setLogoFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Logo upload failed."
      });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isFinalStep) {
      goNext();
      return;
    }

    setIsSubmitting(true);
    const cachedCloudSnapshot = loadCachedCloudActivationSnapshot(form.productKey);
    const ownerSnapshot = cachedCloudSnapshot ?? (await loadLocalOwnerSnapshot());
    let cloudAdminUserId: string | undefined;

    if (cachedCloudSnapshot) {
      try {
        const cloudResult = await completeCloudInstallation(form);

        if (!cloudResult.ok) {
          if (cloudResult.alreadyInstalled) {
            setError(cloudResult.message ?? "This shop is already installed. Go back to login and sign in.");
            setIsSubmitting(false);
            return;
          }

          setError(cloudResult.message ?? "Unable to complete online shop setup.");
          setIsSubmitting(false);
          return;
        }

        cloudAdminUserId = cloudResult.adminUser?.id;
      } catch {
        setError("Could not reach the online setup service. Please refresh and try again.");
        setIsSubmitting(false);
        return;
      }
    }

    const result = registerInstalledShop({
      ...form,
      adminUserId: cloudAdminUserId,
      ownerSnapshot,
      createCashier: false,
      taxRate: Number(form.taxRate)
    });

    if (!result.ok) {
      setError(result.message ?? "Unable to register this POS.");
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.15),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.14),_transparent_34%),linear-gradient(180deg,#f8fbf9_0%,#eef5f1_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {state.brand.logoUrl ? (
              <img alt={state.brand.companyName} className="h-12 w-12 rounded-2xl border border-white/70 object-cover shadow-sm" src={state.brand.logoUrl} />
            ) : (
              <span className="rounded-2xl bg-slate-950 p-3 text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">POS installation</p>
              <h1 className="font-display text-3xl font-semibold text-slate-950">{state.brand.posName}</h1>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link href="/login">Back to login</Link>
          </Button>
        </div>

        <form className="grid gap-5 xl:grid-cols-[340px_1fr]" onSubmit={submit}>
          <Card className="p-4">
            <div className="rounded-[28px] bg-[linear-gradient(150deg,#07111f_0%,#0f2d2c_100%)] p-6 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">First run setup</p>
              <h2 className="mt-4 font-display text-3xl font-semibold">Create first admin</h2>
              <p className="mt-4 text-sm leading-7 text-white/75">
                The shop details come from the activation key. Create the first admin login once, then the POS will open the normal staff sign-in screen.
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const active = step.id === activeStep;
                const complete = index < activeIndex;

                return (
                  <button
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                      active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : complete
                          ? "border-emerald-200 bg-emerald-50 text-slate-950"
                          : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200"
                    )}
                    key={step.id}
                    onClick={() => setActiveStep(step.id)}
                    type="button"
                  >
                    <span className={cn("rounded-xl p-2", active ? "bg-white/15" : "bg-white")}>
                      {complete ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="text-sm font-semibold">{step.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="min-h-[650px] p-6 sm:p-8">
            {activeStep === "setup" ? (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Step 1</p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Store setup login</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Enter the setup email and password only for local/demo owner-created shops. Cloud activation keys can continue without this step.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Setup email</span>
                    <Input type="email" value={form.setupEmail} onChange={(event) => updateForm("setupEmail", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Setup password</span>
                    <Input minLength={8} type="password" value={form.setupPassword} onChange={(event) => updateForm("setupPassword", event.target.value)} />
                  </label>
                </div>
              </section>
            ) : null}

            {activeStep === "shop" ? (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Step 2</p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Shop details</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">These details appear on receipts, reports, and the POS sidebar.</p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-slate-950">Shop name</span>
                    <Input value={form.shopName} onChange={(event) => updateForm("shopName", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Phone</span>
                    <Input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Email</span>
                    <Input type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Website</span>
                    <Input placeholder="https://" value={form.website} onChange={(event) => updateForm("website", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Currency</span>
                    <Input value={form.currency} onChange={(event) => updateForm("currency", event.target.value)} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-slate-950">Address</span>
                    <Textarea className="min-h-24" value={form.address} onChange={(event) => updateForm("address", event.target.value)} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-slate-950">Logo</span>
                    <Input accept="image/*" className="h-auto py-3" type="file" onChange={(event) => void loadLogo(event.target.files?.[0])} />
                    <span className="block text-xs leading-5 text-slate-500">
                      Recommended: square 512x512 JPG/PNG. The POS will resize it for local use.
                    </span>
                  </label>
                  {logoFeedback ? (
                    <p className={logoFeedback.tone === "success" ? "text-sm font-medium text-emerald-700 md:col-span-2" : "text-sm font-medium text-rose-700 md:col-span-2"}>
                      {logoFeedback.message}
                    </p>
                  ) : null}
                  {form.logoUrl ? (
                    <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                      <img alt={form.shopName || "Shop logo"} className="h-16 w-16 rounded-2xl object-cover" src={form.logoUrl} />
                      <p className="font-semibold text-slate-950">{form.shopName || "Shop logo preview"}</p>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeStep === "tax" ? (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Step 3</p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">VAT and receipt</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Set basic tax and receipt details now. They can be edited later in Settings.</p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-950 md:col-span-2">
                    <input checked={form.taxEnabled} className="h-5 w-5 accent-emerald-600" onChange={(event) => updateForm("taxEnabled", event.target.checked)} type="checkbox" />
                    Enable VAT/tax
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">VAT number</span>
                    <Input value={form.vatNumber} onChange={(event) => updateForm("vatNumber", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Tax name</span>
                    <Input value={form.taxName} onChange={(event) => updateForm("taxName", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Tax rate</span>
                    <Input min={0} step="0.01" type="number" value={form.taxRate} onChange={(event) => updateForm("taxRate", Number(event.target.value))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Tax mode</span>
                    <Select value={form.taxMode} onChange={(event) => updateForm("taxMode", event.target.value as "inclusive" | "exclusive")}>
                      <option value="inclusive">Inclusive</option>
                      <option value="exclusive">Exclusive</option>
                    </Select>
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-slate-950">Receipt footer</span>
                    <Textarea value={form.receiptFooterText} onChange={(event) => updateForm("receiptFooterText", event.target.value)} />
                  </label>
                </div>
              </section>
            ) : null}

            {activeStep === "admin" ? (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Step 4</p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Register first admin</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">This user becomes the shop owner/manager and can later create cashier users.</p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Admin name</span>
                    <Input value={form.adminName} onChange={(event) => updateForm("adminName", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Admin phone</span>
                    <Input value={form.adminPhone} onChange={(event) => updateForm("adminPhone", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Admin email</span>
                    <Input type="email" value={form.adminEmail} onChange={(event) => updateForm("adminEmail", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Admin password</span>
                    <Input minLength={8} type="password" value={form.adminPassword} onChange={(event) => updateForm("adminPassword", event.target.value)} />
                  </label>
                </div>
              </section>
            ) : null}

            {activeStep === "key" ? (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Step 5</p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">Activate this POS</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Paste the 30+ character activation key from the owner portal. This binds this browser/device to the store.
                </p>
                <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-950">Activation key</span>
                    <Input className="font-mono" placeholder="SPOS-KSA-..." value={form.productKey} onChange={(event) => updateForm("productKey", event.target.value)} />
                  </label>
                </div>
                {error ? <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
              </section>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button disabled={activeIndex === 0} onClick={goBack} type="button" variant="secondary">
                Back
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isFinalStep ? (isSubmitting ? "Registering..." : "Activate and open POS") : "Continue"}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </main>
  );
}
