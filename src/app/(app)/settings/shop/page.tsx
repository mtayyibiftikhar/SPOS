"use client";

import { useState } from "react";
import { usePosApp } from "@/components/providers/app-provider";
import { Card } from "@/components/ui/card";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resizeImageFileToDataUrl } from "@/lib/image-upload";
import { buildQrCodeImageUrl } from "@/lib/qr-code";

export default function ShopSettingsPage() {
  const { currentSettings, t, updateSettings } = usePosApp();
  const [shopName, setShopName] = useState(currentSettings?.pos.shopName ?? "");
  const [address, setAddress] = useState(currentSettings?.pos.address ?? "");
  const [phone, setPhone] = useState(currentSettings?.pos.phone ?? "");
  const [email, setEmail] = useState(currentSettings?.pos.email ?? "");
  const [website, setWebsite] = useState(currentSettings?.pos.website ?? "");
  const [currency, setCurrency] = useState(currentSettings?.pos.currency ?? "SAR");
  const [logoUrl, setLogoUrl] = useState(currentSettings?.pos.logoUrl ?? "");
  const [vatNumber, setVatNumber] = useState(currentSettings?.pos.vatNumber ?? "");
  const [receiptQrUrl, setReceiptQrUrl] = useState(currentSettings?.pos.receiptQrUrl ?? "");
  const [logoFeedback, setLogoFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  if (!currentSettings) {
    return null;
  }

  const receiptQrPreviewUrl = buildQrCodeImageUrl(receiptQrUrl, 180);

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

      setLogoUrl(result.dataUrl);
      setLogoFeedback({
        tone: "success",
        message: `Logo optimized to ${result.width}x${result.height}. Recommended source: square 512x512 or larger.`
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
            receiptQrUrl: receiptQrUrl.trim() || undefined
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
