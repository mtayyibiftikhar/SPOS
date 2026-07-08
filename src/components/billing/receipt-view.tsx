"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, Mail, MessageCircle, Printer, ReceiptText, Share2 } from "lucide-react";
import { billStatusLabelKeys, paymentMethodLabelKeys } from "@/lib/i18n";
import {
  buildMailtoLink,
  buildReceiptPdfDocument,
  buildWhatsAppLink,
  createReceiptPdfBlob,
  downloadBlob,
  shareBlobFile
} from "@/lib/receipt-export";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { buildQrCodeImageUrl } from "@/lib/qr-code";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export function ReceiptView({ billId }: { billId: string }) {
  const searchParams = useSearchParams();
  const { locale, state, t, updateBillCustomerContact } = usePosApp();
  const [busyAction, setBusyAction] = useState<"download" | "share" | "email" | "whatsapp" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingShareAction, setPendingShareAction] = useState<"email" | "whatsapp" | null>(null);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    phone: "",
    email: "",
    whatsapp: ""
  });
  const hasAutoPrinted = useRef(false);
  const bill = state.bills.find((entry) => entry.id === billId);
  const shop = bill ? state.shops.find((entry) => entry.id === bill.shopId) ?? null : null;
  const cashier = bill ? state.users.find((entry) => entry.id === bill.cashierId) ?? null : null;
  const posSettings = bill ? state.settingsByShop[bill.shopId]?.pos : undefined;
  const receiptSettings = bill ? state.settingsByShop[bill.shopId]?.receipt : undefined;
  const printerSettings = bill ? state.settingsByShop[bill.shopId]?.printer : undefined;
  const items = bill ? state.billItems.filter((item) => item.billId === bill.id) : [];

  useEffect(() => {
    if (!bill) {
      return;
    }

    setContactForm({
      name: bill.customerName ?? "",
      phone: bill.customerPhone ?? "",
      email: bill.customerEmail ?? "",
      whatsapp: bill.customerWhatsapp ?? ""
    });
  }, [bill?.customerEmail, bill?.customerName, bill?.customerPhone, bill?.customerWhatsapp, bill?.id]);

  useEffect(() => {
    if (
      !bill ||
      searchParams.get("fresh") !== "1" ||
      !printerSettings?.autoPrintAfterSale ||
      hasAutoPrinted.current
    ) {
      return;
    }

    hasAutoPrinted.current = true;
    setFeedback(t("receipt.autoPrintNotice"));

    const timer = window.setTimeout(() => {
      window.print();
    }, 320);

    return () => window.clearTimeout(timer);
  }, [bill, printerSettings?.autoPrintAfterSale, searchParams, t]);

  if (!bill) {
    return (
      <div className="space-y-6">
        <div className="print:hidden">
          <PageHeader
            title={t("receipt.missingTitle")}
            subtitle={t("receipt.missingSubtitle")}
            eyebrow={t("nav.bills")}
          />
        </div>
        <div className="print:hidden">
          <Button asChild>
            <Link href="/bills">{t("receipt.backToBills")}</Link>
          </Button>
        </div>
      </div>
    );
  }
  const receiptDocument = buildReceiptPdfDocument({
    bill,
    items,
    shop: shop ?? null,
    cashier: cashier ?? null,
    posSettings,
    receiptSettings,
    brand: state.brand
  });
  const receiptTitle = t("receipt.title", { number: bill.number });
  const shareText = t("receipt.shareMessage", {
    number: bill.number,
    shop: posSettings?.shopName ?? shop?.name ?? t("brand.name")
  });
  const receiptBrand = posSettings?.shopName ?? shop?.name ?? t("brand.name");
  const receiptQrImageUrl = buildQrCodeImageUrl(posSettings?.receiptQrUrl, 172);
  const receiptInitials =
    receiptBrand
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "SP";
  const formattedCustomerName = bill.customerName?.trim() || t("billing.walkInCustomer");
  const whatsappTarget = bill.customerWhatsapp || bill.customerPhone;
  const itemSummaryLines = items.map((item) => {
    const itemName = item.productName[locale] || item.productName.en;

    return `- ${itemName}: ${item.quantity} x ${formatCurrency(item.unitPrice, shop?.currency ?? "SAR", locale)} = ${formatCurrency(item.lineTotal, shop?.currency ?? "SAR", locale)}`;
  });
  const buildReceiptShareMessage = (contact?: { name?: string }) => {
    const customerName = contact?.name?.trim() || bill.customerName?.trim() || t("billing.walkInCustomer");

    return [
      `${t("common.receiptNumber")}: ${bill.number}`,
      `${t("common.customer")}: ${customerName}`,
      `${t("receipt.sharePurchasedFrom")}: ${receiptBrand}`,
      `${t("common.dateTime")}: ${formatDateTime(bill.createdAt, locale)}`,
      "",
      `${t("common.items")}:`,
      ...itemSummaryLines,
      "",
      `${t("common.subtotal")}: ${formatCurrency(bill.subtotal, shop?.currency ?? "SAR", locale)}`,
      `${t("common.discount")}: ${formatCurrency((bill.itemDiscountAmount ?? 0) + bill.discountAmount, shop?.currency ?? "SAR", locale)}`,
      `${bill.taxName ?? t("common.tax")}: ${formatCurrency(bill.taxAmount, shop?.currency ?? "SAR", locale)}`,
      `${t("common.total")}: ${formatCurrency(bill.total, shop?.currency ?? "SAR", locale)}`,
      `${t("common.paidAmount")}: ${formatCurrency(bill.paidAmount, shop?.currency ?? "SAR", locale)}`,
      `${t("common.dueAmount")}: ${formatCurrency(bill.dueAmount, shop?.currency ?? "SAR", locale)}`
    ].join("\n");
  };
  const emailSubject = t("receipt.emailSubject", {
    number: bill.number,
    shop: receiptBrand
  });

  const translateCustomerUpdateError = (message?: string) => {
    switch (message) {
      case "Session unavailable.":
        return t("billing.sessionUnavailable");
      case "Bill not found.":
        return t("receipt.missingSubtitle");
      case "Another customer already uses this phone number.":
        return t("billing.uniquePhoneError");
      case "Unable to update customer details.":
      default:
        return t("receipt.contactSaveError");
    }
  };

  const createPdf = () => createReceiptPdfBlob(receiptDocument);
  const createContactAwarePdf = () =>
    createReceiptPdfBlob(
      buildReceiptPdfDocument({
        bill: {
          ...bill,
          customerName: contactForm.name.trim() || undefined,
          customerPhone: contactForm.phone.trim() || undefined,
          customerEmail: contactForm.email.trim() || undefined,
          customerWhatsapp: contactForm.whatsapp.trim() || undefined
        },
        items,
        shop: shop ?? null,
        cashier: cashier ?? null,
        posSettings,
        receiptSettings,
        brand: state.brand
      })
    );

  const handlePrint = () => {
    setFeedback(null);
    window.print();
  };

  const handleDownload = async () => {
    setBusyAction("download");
    setFeedback(null);

    try {
      downloadBlob(await createPdf(), receiptDocument.fileName);
      setFeedback(t("receipt.downloadReady"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleShare = async () => {
    setBusyAction("share");
    setFeedback(null);

    try {
      const pdfBlob = await createPdf();
      const shared = await shareBlobFile(pdfBlob, receiptDocument.fileName, receiptTitle, shareText).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return false;
        }

        throw error;
      });

      if (shared) {
        setFeedback(t("receipt.shareReady"));
        return;
      }

      downloadBlob(pdfBlob, receiptDocument.fileName);
      setFeedback(t("receipt.shareFallback"));
    } finally {
      setBusyAction(null);
    }
  };

  const openShareDialog = (action: "email" | "whatsapp") => {
    setContactForm({
      name: bill.customerName ?? "",
      phone: bill.customerPhone ?? "",
      email: bill.customerEmail ?? "",
      whatsapp: bill.customerWhatsapp ?? bill.customerPhone ?? ""
    });
    setPendingShareAction(action);
    setFeedback(null);
  };

  const persistCustomerContact = () => {
    const result = updateBillCustomerContact({
      billId: bill.id,
      customerName: contactForm.name,
      customerPhone: contactForm.phone,
      customerEmail: contactForm.email,
      customerWhatsapp: contactForm.whatsapp
    });

    if (!result.ok) {
      setFeedback(translateCustomerUpdateError(result.message));
      return false;
    }

    return true;
  };

  const handleCompleteShareAction = async () => {
    if (!pendingShareAction) {
      return;
    }

    const nextEmail = contactForm.email.trim();
    const nextWhatsapp = contactForm.whatsapp.trim() || contactForm.phone.trim();

    if (pendingShareAction === "email" && !nextEmail) {
      setFeedback(t("receipt.emailMissing"));
      return;
    }

    if (pendingShareAction === "whatsapp" && !nextWhatsapp) {
      setFeedback(t("receipt.whatsappMissing"));
      return;
    }

    setIsSavingContact(true);
    setBusyAction(pendingShareAction);
    setFeedback(null);

    try {
      if (!persistCustomerContact()) {
        return;
      }

      const pdfBlob = await createContactAwarePdf();
      downloadBlob(pdfBlob, receiptDocument.fileName);
      const contactAwareMessage = buildReceiptShareMessage({ name: contactForm.name });

      if (pendingShareAction === "email") {
        window.location.href = buildMailtoLink({
          email: nextEmail,
          subject: emailSubject,
          body: contactAwareMessage
        });
        setFeedback(t("receipt.emailFallback"));
      } else {
        window.open(
          buildWhatsAppLink({
            phone: nextWhatsapp,
            message: contactAwareMessage
          }),
          "_blank",
          "noopener,noreferrer"
        );
        setFeedback(t("receipt.whatsappFallback"));
      }

      setPendingShareAction(null);
    } finally {
      setBusyAction(null);
      setIsSavingContact(false);
    }
  };

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="print:hidden">
        <PageHeader
          title={receiptTitle}
          subtitle={t("receipt.subtitle")}
          eyebrow={t("nav.bills")}
        />
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <Button asChild variant="secondary">
          <Link href="/billing">
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t("receipt.backToBilling")}
            </span>
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/bills">
            <span className="inline-flex items-center gap-2">
              {t("receipt.backToBills")}
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] print:block">
        <Card className="receipt-paper mx-auto w-full max-w-3xl p-6 sm:p-8 print:mx-0 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
          <div className="border-b border-dashed border-line pb-5 text-center">
            {posSettings?.logoUrl ? (
              <div className="mb-4 flex justify-center">
                <img
                  src={posSettings.logoUrl}
                  alt={posSettings.shopName || shop?.name || "Shop logo"}
                  className="max-h-20 w-auto object-contain"
                />
              </div>
            ) : (
              <div className="mb-4 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_42%),linear-gradient(160deg,#0f172a_0%,#172036_100%)] font-display text-xl font-semibold tracking-[0.18em] text-white shadow-[0_16px_30px_rgba(15,23,42,0.16)]">
                  {receiptInitials}
                </div>
              </div>
            )}
            <p className="mx-auto max-w-[20rem] text-balance break-words font-display text-3xl font-semibold leading-tight text-ink">
              {receiptBrand}
            </p>
            <p className="mt-2 text-sm text-slate-600">{posSettings?.address ?? shop?.address}</p>
            <p className="text-sm text-slate-600">{posSettings?.phone ?? shop?.phone}</p>
          </div>

          <div className="grid gap-4 border-b border-dashed border-line py-5 sm:grid-cols-2">
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                <span className="font-medium text-ink">{t("common.receiptNumber")}:</span> {bill.number}
              </p>
              <p>
                <span className="font-medium text-ink">{t("common.dateTime")}:</span>{" "}
                {formatDateTime(bill.createdAt, locale)}
              </p>
              {receiptSettings?.showCashier ? (
                <p>
                  <span className="font-medium text-ink">{t("common.cashier")}:</span>{" "}
                  {cashier?.name ?? t("common.notAvailable")}
                </p>
              ) : null}
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                <span className="font-medium text-ink">{t("common.paymentMethod")}:</span>{" "}
                {t(paymentMethodLabelKeys[bill.paymentMethod])}
              </p>
              <p>
                <span className="font-medium text-ink">{t("common.status")}:</span>{" "}
                {t(billStatusLabelKeys[bill.status])}
              </p>
              <p>
                <span className="font-medium text-ink">{t("common.dueAmount")}:</span>{" "}
                {formatCurrency(bill.dueAmount, shop?.currency ?? "SAR", locale)}
              </p>
              {posSettings?.vatNumber ? (
                <p>
                  <span className="font-medium text-ink">{t("common.vatNumber")}:</span>{" "}
                  {posSettings.vatNumber}
                </p>
              ) : null}
            </div>
          </div>

          {receiptSettings?.showCustomer ? (
            <div className="border-b border-dashed border-line py-5 text-sm text-slate-600">
              <p className="font-medium text-ink">{t("common.customer")}</p>
              <p className="mt-2">{bill.customerName || t("billing.walkInCustomer")}</p>
              {bill.customerPhone ? <p>{bill.customerPhone}</p> : null}
              {bill.customerEmail ? <p>{bill.customerEmail}</p> : null}
              {bill.customerWhatsapp ? <p>{t("common.whatsapp")}: {bill.customerWhatsapp}</p> : null}
            </div>
          ) : null}

          <div className="py-5">
            <div className="hidden grid-cols-[minmax(0,1fr)_72px_110px_120px] gap-3 border-b border-line pb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 sm:grid">
              <span>{t("common.items")}</span>
              <span className="text-center">{t("common.quantity")}</span>
              <span className="text-right">{t("common.salePrice")}</span>
              <span className="text-right">{t("common.total")}</span>
            </div>

            <div className="space-y-3 pt-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-line/80 bg-shell/55 px-4 py-3"
                >
                  <div className="sm:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-ink">{item.productName[locale] || item.productName.en}</span>
                      <span className="font-semibold text-ink">
                        {formatCurrency(item.lineTotal, shop?.currency ?? "SAR", locale)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm text-slate-600">
                      <span>{t("common.quantity")}: {item.quantity}</span>
                      <span>{t("common.salePrice")}: {formatCurrency(item.unitPrice, shop?.currency ?? "SAR", locale)}</span>
                    </div>
                    {item.discountAmount > 0 ? (
                      <div className="mt-1 text-sm font-medium text-emerald-700">
                        {t("common.itemDiscounts")}: -{formatCurrency(item.discountAmount, shop?.currency ?? "SAR", locale)}
                      </div>
                    ) : null}
                  </div>

                  <div className="hidden grid-cols-[minmax(0,1fr)_72px_110px_120px] gap-3 text-sm text-slate-600 sm:grid sm:items-center">
                    <span>
                      <span className="block font-medium text-ink">{item.productName[locale] || item.productName.en}</span>
                      {item.discountAmount > 0 ? (
                        <span className="mt-1 block text-xs font-medium text-emerald-700">
                          {t("common.itemDiscounts")} -{formatCurrency(item.discountAmount, shop?.currency ?? "SAR", locale)}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-center">{item.quantity}</span>
                    <span className="text-right">{formatCurrency(item.unitPrice, shop?.currency ?? "SAR", locale)}</span>
                    <span className="text-right font-semibold text-ink">
                      {formatCurrency(item.lineTotal, shop?.currency ?? "SAR", locale)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-dashed border-line pt-5">
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>{t("common.subtotal")}</span>
                <span>{formatCurrency(bill.subtotal, shop?.currency ?? "SAR", locale)}</span>
              </div>
              {(bill.itemDiscountAmount ?? 0) > 0 ? (
                <div className="flex items-center justify-between">
                  <span>{t("common.itemDiscounts")}</span>
                  <span>-{formatCurrency(bill.itemDiscountAmount ?? 0, shop?.currency ?? "SAR", locale)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span>{t("common.discount")}</span>
                <span>{formatCurrency(bill.discountAmount, shop?.currency ?? "SAR", locale)}</span>
              </div>
              {receiptSettings?.showTax ? (
                <div className="flex items-center justify-between">
                  <span>{bill.taxName ?? t("common.tax")}</span>
                  <span>{formatCurrency(bill.taxAmount, shop?.currency ?? "SAR", locale)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between font-semibold text-ink">
                <span>{t("common.total")}</span>
                <span>{formatCurrency(bill.total, shop?.currency ?? "SAR", locale)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("common.paidAmount")}</span>
                <span>{formatCurrency(bill.paidAmount, shop?.currency ?? "SAR", locale)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("common.dueAmount")}</span>
                <span>{formatCurrency(bill.dueAmount, shop?.currency ?? "SAR", locale)}</span>
              </div>
            </div>
          </div>

          {receiptSettings?.footerText || posSettings?.vatNumber || receiptQrImageUrl ? (
            <div className="border-t border-dashed border-line pt-5">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center">
                <div className="text-center text-sm text-slate-600 sm:text-left">
                  {receiptSettings?.footerText ? <p>{receiptSettings.footerText}</p> : null}
                  {posSettings?.vatNumber ? (
                    <p className="mt-3">
                      <span className="font-medium text-ink">{t("common.vatNumber")}:</span>{" "}
                      {posSettings.vatNumber}
                    </p>
                  ) : null}
                </div>

                {receiptQrImageUrl ? (
                  <div className="rounded-3xl border border-line bg-shell/70 p-3 text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("receipt.qrTitle")}</p>
                    <img
                      src={receiptQrImageUrl}
                      alt="Receipt QR"
                      className="mx-auto mt-3 h-28 w-28 rounded-2xl border border-line bg-white p-1.5"
                    />
                    <p className="mt-3 text-xs leading-5 text-slate-500">{t("receipt.qrDesc")}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {state.brand.receiptImprintEnabled ? (
            <div className="mt-5 border-t border-dashed border-line pt-5 text-center text-xs leading-5 text-slate-500">
              {state.brand.logoUrl ? (
                <img
                  src={state.brand.logoUrl}
                  alt={state.brand.companyName}
                  className="mx-auto mb-2 max-h-8 w-auto object-contain"
                />
              ) : null}
              <p className="font-semibold text-slate-700">
                {state.brand.receiptImprintText || `Powered by ${state.brand.companyName}`}
              </p>
              <p>{state.brand.companyName}</p>
              {state.brand.website ? <p>{state.brand.website}</p> : null}
              {state.brand.address ? <p>{state.brand.address}</p> : null}
              <p>
                {state.brand.supportPhone}
                {state.brand.supportEmail ? ` | ${state.brand.supportEmail}` : ""}
              </p>
            </div>
          ) : null}
        </Card>

        <div className="space-y-6 print:hidden">
          <Card className="h-fit p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <ReceiptText className="h-5 w-5 text-ink" />
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-olive">
                  {t("receipt.actionsLabel")}
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("receipt.actionsTitle")}</h2>
                <p className="mt-3 max-w-[26rem] text-sm leading-6 text-slate-600">{t("receipt.actionsDesc")}</p>
              </div>

              <div className="hidden rounded-[24px] border border-line bg-shell/80 px-4 py-3 text-right xl:block">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("common.customer")}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{formattedCustomerName}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-[20px] border border-line bg-shell/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("common.email")}</p>
                <p className="mt-1 truncate text-sm font-medium text-ink">{bill.customerEmail || t("common.notAvailable")}</p>
              </div>
              <div className="rounded-[20px] border border-line bg-shell/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("common.whatsapp")}</p>
                <p className="mt-1 truncate text-sm font-medium text-ink">{whatsappTarget || t("common.notAvailable")}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Button
                variant="secondary"
                className="justify-start rounded-[18px] border border-line bg-white px-4 text-sm font-semibold"
                onClick={handlePrint}
              >
                <span className="inline-flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  {t("receipt.printAction")}
                </span>
              </Button>
              <Button
                variant="secondary"
                className="justify-start rounded-[18px] border border-line bg-white px-4 text-sm font-semibold"
                onClick={handleDownload}
                disabled={busyAction !== null}
              >
                <span className="inline-flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  {busyAction === "download" ? t("receipt.generatingPdf") : t("receipt.downloadPdf")}
                </span>
              </Button>
              <Button
                variant="secondary"
                className="justify-start rounded-[18px] border border-line bg-white px-4 text-sm font-semibold"
                onClick={handleShare}
                disabled={busyAction !== null}
              >
                <span className="inline-flex items-center gap-2">
                  <Share2 className="h-4 w-4" />
                  {busyAction === "share" ? t("receipt.generatingPdf") : t("receipt.sharePdf")}
                </span>
              </Button>
              <Button
                className="justify-start rounded-[18px] bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-900"
                onClick={() => openShareDialog("email")}
                disabled={busyAction !== null}
              >
                <span className="inline-flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {busyAction === "email" ? t("receipt.generatingPdf") : t("receipt.emailPdf")}
                </span>
              </Button>
              <Button
                className="justify-start rounded-[18px] bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:col-span-2"
                onClick={() => openShareDialog("whatsapp")}
                disabled={busyAction !== null}
              >
                <span className="inline-flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  {busyAction === "whatsapp" ? t("receipt.generatingPdf") : t("receipt.whatsappPdf")}
                </span>
              </Button>
            </div>

            <div className="mt-5 rounded-[22px] border border-dashed border-line bg-shell p-4 text-sm leading-6 text-slate-600">
              <p>{t("receipt.browserLimitNote")}</p>
            </div>

            {feedback ? <p className="mt-4 text-sm font-medium text-olive">{feedback}</p> : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="success">{t(paymentMethodLabelKeys[bill.paymentMethod])}</Badge>
              <Badge variant={bill.status === "paid" ? "success" : "warning"}>
                {t(billStatusLabelKeys[bill.status])}
              </Badge>
            </div>
          </Card>

        </div>
      </div>

      {pendingShareAction ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 print:hidden">
          <Card className="w-full max-w-2xl p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">
                  {t("receipt.sendDialogTitle")}
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
                  {pendingShareAction === "email" ? t("receipt.emailPdf") : t("receipt.whatsappPdf")}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {pendingShareAction === "email"
                    ? t("receipt.sendDialogEmailDesc")
                    : t("receipt.sendDialogWhatsappDesc")}
                </p>
              </div>

              <Button
                variant="secondary"
                className="h-10 rounded-[14px] px-4"
                onClick={() => {
                  setPendingShareAction(null);
                  setFeedback(null);
                }}
              >
                {t("common.close")}
              </Button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.customerName")}</label>
                <Input
                  value={contactForm.name}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.phone")}</label>
                <Input
                  inputMode="tel"
                  value={contactForm.phone}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      phone: event.target.value
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.email")}</label>
                <Input
                  type="email"
                  value={contactForm.email}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.whatsapp")}</label>
                <Input
                  inputMode="tel"
                  value={contactForm.whatsapp}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      whatsapp: event.target.value
                    }))
                  }
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setPendingShareAction(null);
                  setFeedback(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className={pendingShareAction === "email" ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-emerald-600 text-white hover:bg-emerald-700"}
                disabled={isSavingContact || busyAction !== null}
                onClick={handleCompleteShareAction}
              >
                {isSavingContact
                  ? t("receipt.generatingPdf")
                  : pendingShareAction === "email"
                    ? t("receipt.continueToEmail")
                    : t("receipt.continueToWhatsapp")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
