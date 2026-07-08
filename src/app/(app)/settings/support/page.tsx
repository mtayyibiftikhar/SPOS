"use client";

import { licenseStatusLabelKeys } from "@/lib/i18n";
import { Mail, MessageCircle, PhoneCall, WalletCards } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Card } from "@/components/ui/card";

function maskProductKey(key?: string) {
  if (!key) {
    return null;
  }

  if (key.length <= 8) {
    return key;
  }

  return `${key.slice(0, 4)}${"*".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

export default function SupportPage() {
  const { currentLicense, currentShopId, state, t } = usePosApp();
  const currentProductKey = state.productKeys.find((entry) => entry.shopId === currentShopId);
  const supportMessage = encodeURIComponent(`Hello ${state.brand.companyName}, I need support for ${state.brand.posName}.`);

  return (
    <SettingsFormShell
      title={t("settings.support")}
      subtitle={t("settings.supportPageSubtitle")}
    >
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              {state.brand.logoUrl ? (
                <img
                  alt={state.brand.companyName}
                  className="h-14 w-14 rounded-2xl border border-line object-cover"
                  src={state.brand.logoUrl}
                />
              ) : (
                <PhoneCall className="h-5 w-5 text-ink" />
              )}
              <div>
                <p className="text-base font-semibold text-ink">{t("support.companyContact")}</p>
                <p className="mt-1 text-sm font-medium text-ink">{state.brand.companyName}</p>
                {state.brand.address ? <p className="text-sm text-slate-600">{state.brand.address}</p> : null}
                {state.brand.website ? <p className="text-sm text-slate-600">{state.brand.website}</p> : null}
                <p className="mt-1 text-sm text-slate-600">{t("support.whatsapp")}: {state.brand.supportWhatsapp}</p>
                <p className="text-sm text-slate-600">{t("common.email")}: {state.brand.supportEmail}</p>
                <p className="text-sm text-slate-600">{t("support.call")}: {state.brand.supportPhone}</p>
                {state.brand.receiptImprintEnabled ? (
                  <p className="mt-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    Receipt imprint enabled
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <WalletCards className="h-5 w-5 text-ink" />
              <div>
                <p className="text-base font-semibold text-ink">{t("support.licenseActivation")}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {t("common.licenseStatus")}: {t(licenseStatusLabelKeys[currentLicense?.status ?? "active"])}
                </p>
                <p className="text-sm text-slate-600">
                  {t("common.productKey")}: {maskProductKey(currentProductKey?.key) ?? t("common.notAvailable")}
                </p>
              </div>
            </div>
          </Card>

        </div>

        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Direct support</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Contact the POS owner</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Support tickets are handled outside this POS in the separate CRM. Use WhatsApp, email, or call for now.
          </p>
          <div className="mt-5 grid gap-3">
            <a
              className="flex items-center gap-3 rounded-3xl border border-line bg-shell p-4 font-semibold text-ink transition hover:border-emerald-200"
              href={`https://wa.me/${state.brand.supportWhatsapp.replace(/\D/g, "")}?text=${supportMessage}`}
              target="_blank"
            >
              <MessageCircle className="h-5 w-5 text-emerald-700" />
              WhatsApp support
            </a>
            <a
              className="flex items-center gap-3 rounded-3xl border border-line bg-shell p-4 font-semibold text-ink transition hover:border-emerald-200"
              href={`mailto:${state.brand.supportEmail}?subject=${encodeURIComponent(`${state.brand.posName} support`)}`}
            >
              <Mail className="h-5 w-5 text-emerald-700" />
              Email support
            </a>
            <a
              className="flex items-center gap-3 rounded-3xl border border-line bg-shell p-4 font-semibold text-ink transition hover:border-emerald-200"
              href={`tel:${state.brand.supportPhone}`}
            >
              <PhoneCall className="h-5 w-5 text-emerald-700" />
              Call support
            </a>
          </div>
        </Card>
      </div>
    </SettingsFormShell>
  );
}
