"use client";

import { useEffect, useState } from "react";
import { usePosApp } from "@/components/providers/app-provider";
import { Card } from "@/components/ui/card";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResilientImage } from "@/components/ui/resilient-image";
import { deleteImageAssetFromCloud, persistShopLogoUrl, resizeImageFileToDataUrl, uploadImageAssetToCloud } from "@/lib/image-upload";
import { sanitizePhoneInput } from "@/lib/phone";

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
  const [logoFeedback, setLogoFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setLogoUrl(currentSettings?.pos.logoUrl ?? "");
  }, [currentSettings?.pos.logoUrl]);

  if (!currentSettings) {
    return null;
  }

  const activeProductKey = state.productKeys.find(
    (productKey) => productKey.shopId === currentShopId && productKey.key.trim().length >= 30
  )?.key;

  const deleteShopLogoAsset = (imageUrl: string) =>
    deleteImageAssetFromCloud({
      productKey: activeProductKey,
      shopId: currentShopId ?? undefined,
      url: imageUrl,
      userEmail: session?.email,
      userId: session?.id
    });

  const handleLogoFileChange = async (file: File | null) => {
    if (!file) {
      return;
    }

    setLogoFeedback(null);

    try {
      const previousLogoUrl = logoUrl.trim();
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
        productKey: activeProductKey,
        scope: "shop-logo",
        shopId: currentShopId ?? undefined,
        userEmail: session?.email,
        userId: session?.id
      });

      setLogoUrl(upload.url);
      updateSettings("pos", { logoUrl: upload.url }, { feedback: false });
      if (previousLogoUrl && previousLogoUrl !== upload.url) {
        void deleteShopLogoAsset(previousLogoUrl).catch(() => undefined);
      }
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

  const removeShopLogo = async () => {
    const currentLogoUrl = logoUrl.trim();

    if (!currentShopId) {
      return;
    }

    try {
      await persistShopLogoUrl({
        logoUrl: "",
        shopId: currentShopId,
        userEmail: session?.email,
        userId: session?.id
      });
      setLogoUrl("");
      updateSettings("pos", { logoUrl: "" }, { feedback: false });

      const result = currentLogoUrl ? await deleteShopLogoAsset(currentLogoUrl) : { deleted: false };

      setLogoFeedback({
        tone: "success",
        message: result.deleted ? "Logo removed from Supabase Storage." : "Logo removed."
      });
    } catch (error) {
      setLogoFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Logo was removed from the form, but cloud cleanup failed."
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
        onSubmit={async (event) => {
          event.preventDefault();
          setLogoFeedback(null);

          try {
            if (currentShopId) {
              await persistShopLogoUrl({
                logoUrl: logoUrl.trim(),
                shopId: currentShopId,
                userEmail: session?.email,
                userId: session?.id
              });
            }

            updateSettings("pos", {
              shopName,
              address,
              phone,
              email: email.trim() || undefined,
              website: website.trim() || undefined,
              currency,
              logoUrl: logoUrl.trim(),
              vatNumber: vatNumber.trim() || undefined
            });
            setLogoFeedback({ tone: "success", message: "Shop settings saved." });
          } catch (error) {
            setLogoFeedback({
              tone: "error",
              message: error instanceof Error ? error.message : "Unable to save shop settings."
            });
          }
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
          <Input inputMode="tel" value={phone} onChange={(event) => setPhone(sanitizePhoneInput(event.target.value))} />
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
                Upload a JPG, PNG, or WebP at any common size. The POS automatically resizes and optimizes it for receipts and reports.
              </p>
              {logoFeedback ? (
                <p className={logoFeedback.tone === "success" ? "mt-2 text-sm font-medium text-emerald-700" : "mt-2 text-sm font-medium text-rose-700"}>
                  {logoFeedback.message}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <Card className="flex min-h-[228px] flex-col items-center justify-center gap-4 border-dashed p-5 text-center">
              {logoUrl ? (
                <ResilientImage
                  src={logoUrl}
                  alt={shopName || "Shop logo"}
                  className="max-h-20 max-w-full object-contain"
                  fallback={<span className="text-sm font-medium text-slate-500">Logo preview unavailable</span>}
                />
              ) : null}
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">{t("settings.logoPreview")}</p>
                <p className="text-sm leading-6 text-slate-600">{t("settings.logoPreviewDesc")}</p>
              </div>
              {logoUrl ? (
                <Button type="button" variant="secondary" onClick={() => void removeShopLogo()}>
                  Remove logo
                </Button>
              ) : null}
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
