"use client";

import { useState } from "react";
import { usePosApp } from "@/components/providers/app-provider";
import { Card } from "@/components/ui/card";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resizeImageFileToDataUrl, uploadImageAssetToCloud } from "@/lib/image-upload";
import { buildQrCodeImageUrl } from "@/lib/qr-code";

export default function ShopSettingsPage() {
  const { currentSettings, currentShopId, session, state, t, updateSettings } = usePosApp();
  const [shopName, setShopName] = useState(currentSettings?.pos.shopName ?? "");
  const [address, setAddress] = useState(currentSettings?.pos.address ?? "");
  const [phone, setPhone] = useState(currentSettings?.pos.phone ?? "");
  const [email, setEmail] = useState(currentSettings?.pos.email ?? "");
  const [website, setWebsite] = useState(currentSettings?.pos.website ?? "");
  const [currency, setCurrency] = useState(currentSettings?.pos.currency ?? "SAR");
  const [logoUrl, setLogoUrl] = useState(currentSettings?.pos.logoUrl ?? "");
  const [vatNumber, setVatNumber] = useState(currentSettings?.pos.vatNumber ?? "");
  const [receiptQrUrl, setReceiptQrUrl] = useState(currentSettings?.pos.receiptQrUrl ?? "");
  const [autoDayRolloverEnabled, setAutoDayRolloverEnabled] = useState(currentSettings?.pos.autoDayRolloverEnabled ?? false);
  const [logoFeedback, setLogoFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  if (!currentSettings) {
    return null;
  }

  const receiptQrPreviewUrl = buildQrCodeImageUrl(receiptQrUrl, 180);
  const activeProductKey = state.productKeys.find(
    (productKey) => productKey.shopId === currentShopId && productKey.key.trim().length >= 30
  )?.key;

  const handleLogoFileChange = async (file: File | null) => {
    if (!file) {
      return;
    }

    setLogoFeedback(null);

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
        productKey: activeProductKey,
        scope: "shop-logo",
        shopId: currentShopId ?? undefined,
        userEmail: session?.email,
        userId: session?.id
      });

      setLogoUrl(upload.url);
      setLogoFeedback({
        tone: "success",
        message: upload.storedInCloud
          ? `Logo saved securely in Supabase Storage at ${result.width}x${result.height}.`
          : `Logo optimized to ${result.width}x${result.height}. Cloud upload fallback was used.`
      });
    } catch (error) {
      setLogoFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Logo upload failed."
      });
    }
  };

  return (
    <SettingsFormShell
      title={t("settings.shop")}
      subtitle={t("settings.shopPageSubtitle")}
    >
      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          updateSettings("pos", {
            shopName,
            address,
            phone,
            email: email.trim() || undefined,
            website: website.trim() || undefined,
            currency,
            logoUrl: logoUrl.trim() || undefined,
            vatNumber: vatNumber.trim() || undefined,
            receiptQrUrl: receiptQrUrl.trim() || undefined,
            autoDayRolloverEnabled
          });
        }}
      >
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.shopName")}</label>
          <Input value={shopName} onChange={(event) => setShopName(event.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.address")}</label>
          <Input value={address} onChange={(event) => setAddress(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.phone")}</label>
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.email")}</label>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">Website</label>
          <Input placeholder="https://" value={website} onChange={(event) => setWebsite(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.currency")}</label>
          <Input value={currency} onChange={(event) => setCurrency(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("settings.vatNumber")}</label>
          <Input value={vatNumber} onChange={(event) => setVatNumber(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("settings.receiptQrUrl")}</label>
          <Input
            placeholder="https://"
            value={receiptQrUrl}
            onChange={(event) => setReceiptQrUrl(event.target.value)}
          />
          <p className="mt-2 text-sm leading-6 text-slate-600">{t("settings.receiptQrUrlDesc")}</p>
        </div>
        <div className="md:col-span-2">
          <Card className="border-emerald-200 bg-emerald-50/70 p-5">
            <label className="flex items-start gap-4">
              <input
                checked={autoDayRolloverEnabled}
                className="mt-1 h-5 w-5 accent-emerald-600"
                type="checkbox"
                onChange={(event) => setAutoDayRolloverEnabled(event.target.checked)}
              />
              <span>
                <span className="block text-sm font-semibold text-ink">Auto close day and start next day</span>
                <span className="mt-2 block text-sm leading-6 text-slate-600">
                  When enabled, if yesterday&apos;s day or shifts are still open, the POS closes them with expected cash,
                  creates the day closing record, opens today&apos;s business day, and starts the current user&apos;s shift automatically.
                  This runs when the POS is open or when a staff user signs in.
                </span>
              </span>
            </label>
          </Card>
        </div>
        <div className="md:col-span-2 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("settings.logoUrl")}</label>
              <Input
                placeholder="https://"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("settings.logoUpload")}</label>
              <Input
                accept="image/*"
                className="h-auto py-3"
                type="file"
                onChange={(event) => void handleLogoFileChange(event.target.files?.[0] ?? null)}
              />
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Recommended logo size: square 512x512 JPG/PNG. The POS optimizes it automatically for receipts and reports.
              </p>
              {logoFeedback ? (
                <p className={logoFeedback.tone === "success" ? "mt-2 text-sm font-medium text-emerald-700" : "mt-2 text-sm font-medium text-rose-700"}>
                  {logoFeedback.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-5">
            <Card className="flex min-h-[176px] flex-col items-center justify-center gap-4 border-dashed p-5 text-center">
              {logoUrl ? (
                <img src={logoUrl} alt={shopName || "Shop logo"} className="max-h-20 w-auto object-contain" />
              ) : null}
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">{t("settings.logoPreview")}</p>
                <p className="text-sm leading-6 text-slate-600">{t("settings.logoPreviewDesc")}</p>
              </div>
            </Card>

            <Card className="flex min-h-[220px] flex-col items-center justify-center gap-4 border-dashed p-5 text-center">
              {receiptQrPreviewUrl ? (
                <img src={receiptQrPreviewUrl} alt="Receipt QR preview" className="h-36 w-36 rounded-2xl border border-line bg-white p-2" />
              ) : null}
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">{t("settings.receiptQrPreview")}</p>
                <p className="text-sm leading-6 text-slate-600">
                  {receiptQrPreviewUrl ? t("settings.receiptQrPreviewDesc") : t("settings.receiptQrEmpty")}
                </p>
              </div>
            </Card>
          </div>
        </div>
        <div className="md:col-span-2">
          <Button type="submit">{t("common.saveChanges")}</Button>
        </div>
      </form>
    </SettingsFormShell>
  );
}
