"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, ExternalLink, Mail, MessageCircle, Printer, ReceiptText, Share2 } from "lucide-react";
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
import { customerMatchesSearch, isWalkInCustomerName } from "@/lib/billing";
import { buildQrCodeImageUrl } from "@/lib/qr-code";
import { buildPublicReceiptUrl } from "@/lib/public-receipts";
import { calculateBillRefundState } from "@/lib/refunds";
import { hasNativeDownloadSupport, printElementWithNative, saveBlobWithNative } from "@/lib/native-bridge";
import { getReceiptItemNameLines, getReceiptItemNameText } from "@/lib/receipt-language";
import { buildPolishedReceiptMessage } from "@/lib/receipt-sharing";
import { loadFreshReceiptHandoff, type FreshReceiptHandoff } from "@/lib/receipt-handoff";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Customer } from "@/types/pos";

export function ReceiptView({ billId }: { billId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isHydrated, locale, state, t, updateBillCustomerContact } = usePosApp();
  const [busyAction, setBusyAction] = useState<"download" | "share" | "email" | "whatsapp" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingShareAction, setPendingShareAction] = useState<"email" | "whatsapp" | null>(null);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [returnCountdown, setReturnCountdown] = useState<number | null>(null);
  const [receiptLookupTimedOut, setReceiptLookupTimedOut] = useState(false);
  const [contactCustomerSearch, setContactCustomerSearch] = useState("");
  const [receiptHandoff, setReceiptHandoff] = useState<FreshReceiptHandoff | null>(null);
  const [contactForm, setContactForm] = useState({
    id: undefined as string | undefined,
    name: "",
    phone: "",
    email: "",
    whatsapp: ""
  });
  const hasAutoPrinted = useRef(false);
  const isFreshReceipt = searchParams.get("fresh") === "1";
  const fromAccounts = searchParams.get("from") === "accounts";
  const stateBill = state.bills.find((entry) => entry.id === billId);
  const bill = stateBill ?? receiptHandoff?.bill;
  const shop = bill ? state.shops.find((entry) => entry.id === bill.shopId) ?? null : null;
  const cashier = bill ? state.users.find((entry) => entry.id === bill.cashierId) ?? null : null;
  const posSettings = bill ? state.settingsByShop[bill.shopId]?.pos : undefined;
  const receiptSettings = bill ? state.settingsByShop[bill.shopId]?.receipt : undefined;
  const printerSettings = bill ? state.settingsByShop[bill.shopId]?.printer : undefined;
  const items = stateBill
    ? state.billItems.filter((item) => item.billId === stateBill.id)
    : receiptHandoff?.items ?? [];
  const refundState = bill
    ? calculateBillRefundState({
        billId: bill.id,
        billItems: items,
        refunds: state.refunds,
        refundItems: state.refundItems
      })
    : null;

  useEffect(() => {
    setReceiptHandoff(loadFreshReceiptHandoff(billId));
  }, [billId]);

  useEffect(() => {
    if (!isHydrated || bill) {
      setReceiptLookupTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => setReceiptLookupTimedOut(true), 8000);

    return () => window.clearTimeout(timer);
  }, [bill, billId, isHydrated]);

  useEffect(() => {
    if (!bill) {
      return;
    }

    setContactForm({
      id: isWalkInCustomerName(bill.customerName) ? undefined : bill.customerId,
      name: isWalkInCustomerName(bill.customerName) ? "" : bill.customerName ?? "",
      phone: bill.customerPhone ?? "",
      email: bill.customerEmail ?? "",
      whatsapp: bill.customerWhatsapp ?? ""
    });
  }, [bill?.customerEmail, bill?.customerName, bill?.customerPhone, bill?.customerWhatsapp, bill?.id]);

  useEffect(() => {
    if (
      !bill ||
      !isFreshReceipt ||
      !printerSettings?.autoPrintAfterSale ||
      hasAutoPrinted.current
    ) {
      return;
    }

    hasAutoPrinted.current = true;
    setFeedback(t("receipt.autoPrintNotice"));

    const timer = window.setTimeout(() => {
      void printElementWithNative("#receipt-print-area", t("receipt.title", { number: bill.number }))
        .then((printed) => {
          if (!printed) {
            window.print();
          }
        })
        .catch(() => window.print());
    }, 320);

    return () => window.clearTimeout(timer);
  }, [bill, isFreshReceipt, printerSettings?.autoPrintAfterSale, t]);

  useEffect(() => {
    if (!bill || !isFreshReceipt) {
      setReturnCountdown(null);
      return;
    }

    setReturnCountdown(10);

    const interval = window.setInterval(() => {
      setReturnCountdown((current) => (current === null ? null : Math.max(0, current - 1)));
    }, 1000);
    const timer = window.setTimeout(() => {
      router.push("/billing");
    }, 10000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [bill, isFreshReceipt, router]);

  if (!isHydrated || (!bill && !receiptLookupTimedOut)) {
    return (
      <div className="space-y-6">
        <div className="print:hidden">
          <PageHeader
            title={t("receipt.loadingTitle")}
            subtitle={t("receipt.loadingSubtitle")}
            eyebrow={t("nav.bills")}
          />
        </div>
        <Card className="flex min-h-52 items-center justify-center p-8 text-center">
          <p className="text-sm font-medium text-slate-600">{t("receipt.loadingHint")}</p>
        </Card>
      </div>
    );
  }

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
  const receiptBrand = posSettings?.shopName ?? shop?.name ?? t("brand.name");
  const digitalReceiptUrl = buildPublicReceiptUrl(bill.publicToken);
  const receiptQrImageUrl = buildQrCodeImageUrl(digitalReceiptUrl, 172);
  const receiptInitials =
    receiptBrand
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "SP";
  const formattedCustomerName = bill.customerName?.trim() || t("billing.walkInCustomer");
  const whatsappTarget = bill.customerWhatsapp || bill.customerPhone;
  const shareItems = items.map((item) => ({
    name: getReceiptItemNameText(item.productName, receiptSettings),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal
  }));
  const renderReceiptItemName = (item: (typeof items)[number]) => (
    <span className="block min-w-0">
      {getReceiptItemNameLines(item.productName, receiptSettings).map((line) => (
        <span
          className={line.isSecondary ? "mt-0.5 block text-sm font-medium leading-5 text-slate-600" : "block font-medium text-ink"}
          dir={line.direction}
          key={`${item.id}-${line.text}`}
        >
          {line.text}
        </span>
      ))}
    </span>
  );
  const buildReceiptShareMessage = (
    channel: "email" | "whatsapp",
    contact?: { name?: string }
  ) => {
    const customerName = contact?.name?.trim() || bill.customerName?.trim() || t("billing.walkInCustomer");

    return buildPolishedReceiptMessage({
      channel,
      customerName,
      storeName: receiptBrand,
      receiptNumber: bill.number,
      createdAt: bill.createdAt,
      currency: shop?.currency ?? "SAR",
      locale,
      items: shareItems,
      subtotal: bill.subtotal,
      discountAmount: (bill.itemDiscountAmount ?? 0) + bill.discountAmount,
      taxLabel: bill.taxName ?? t("common.tax"),
      taxAmount: bill.taxAmount,
      total: bill.total,
      paidAmount: bill.paidAmount,
      dueAmount: bill.dueAmount,
      digitalReceiptUrl,
      refund:
        refundState && refundState.totalRefundAmount > 0
          ? {
              isFullyRefunded: refundState.isFullyRefunded,
              totalRefundAmount: refundState.totalRefundAmount
            }
          : undefined
    });
  };
  const shareText = buildReceiptShareMessage("whatsapp");
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
      case "Select a saved customer or enter the customer's real name before sharing this receipt.":
        return message;
      case "Unable to update customer details.":
      default:
        return t("receipt.contactSaveError");
    }
  };

  const createPdf = () => createReceiptPdfBlob(receiptDocument);
  const savePdf = async (blob: Blob) => {
    if (hasNativeDownloadSupport()) {
      const saved = await saveBlobWithNative(blob, receiptDocument.fileName).catch(() => false);

      if (saved) {
        return;
      }
    }

    downloadBlob(blob, receiptDocument.fileName);
  };
  const handlePrint = async () => {
    setFeedback(null);

    const printed = await printElementWithNative("#receipt-print-area", receiptTitle).catch(() => false);

    if (!printed) {
      window.print();
    }
  };

  const handleDownload = async () => {
    setBusyAction("download");
    setFeedback(null);

    try {
      await savePdf(await createPdf());
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

      await savePdf(pdfBlob);
      setFeedback(t("receipt.shareFallback"));
    } finally {
      setBusyAction(null);
    }
  };

  const openShareDialog = (action: "email" | "whatsapp") => {
    setContactForm({
      id: isWalkInCustomerName(bill.customerName) ? undefined : bill.customerId,
      name: isWalkInCustomerName(bill.customerName) ? "" : bill.customerName ?? "",
      phone: bill.customerPhone ?? "",
      email: bill.customerEmail ?? "",
      whatsapp: bill.customerWhatsapp ?? bill.customerPhone ?? ""
    });
    setContactCustomerSearch("");
    setPendingShareAction(action);
    setFeedback(null);
  };

  const persistCustomerContact = () => {
    const result = updateBillCustomerContact({
      billId: bill.id,
      customerId: contactForm.id,
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

    if (isWalkInCustomerName(contactForm.name)) {
      setFeedback("Select a saved customer or enter the customer's real name before sharing this receipt.");
      return;
    }

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

      const contactAwareMessage = buildReceiptShareMessage(pendingShareAction, { name: contactForm.name });

      if (pendingShareAction === "email") {
        const mailtoUrl = buildMailtoLink({
          email: nextEmail,
          subject: emailSubject,
          body: contactAwareMessage
        });
        const mailLink = document.createElement("a");
        mailLink.href = mailtoUrl;
        mailLink.target = "_blank";
        mailLink.rel = "noopener noreferrer";
        document.body.appendChild(mailLink);
        mailLink.click();
        mailLink.remove();
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

  const savedCustomers = state.customers.filter(
    (customer) => customer.shopId === bill.shopId && !isWalkInCustomerName(customer.name)
  );
  const matchedContactCustomers = contactCustomerSearch.trim()
    ? savedCustomers.filter((customer) => customerMatchesSearch(customer, contactCustomerSearch)).slice(0, 20)
    : [];
  const selectShareCustomer = (customer: Customer) => {
    setContactForm({
      id: customer.id,
      name: customer.name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      whatsapp: customer.whatsapp ?? customer.phone ?? ""
    });
    setContactCustomerSearch("");
    setFeedback(null);
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
        {fromAccounts ? (
          <Button asChild variant="secondary">
            <Link href="/customers?view=account">
              <span className="inline-flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to accounts
              </span>
            </Link>
          </Button>
        ) : (
          <>
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
          </>
        )}
      </div>

      {returnCountdown !== null ? (
        <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 print:hidden">
          {t("receipt.returnCountdown", { seconds: returnCountdown })}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] print:block">
        <Card
          className="receipt-paper mx-auto w-full max-w-3xl p-6 sm:p-8 print:mx-0 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none"
          id="receipt-print-area"
        >
          <div className="border-b border-dashed border-line pb-4 text-center">
            {posSettings?.logoUrl ? (
              <div className="mb-2 flex justify-center">
                <img
                  src={posSettings.logoUrl}
                  alt={posSettings.shopName || shop?.name || "Shop logo"}
                  className="max-h-14 max-w-[11rem] object-contain"
                />
              </div>
            ) : (
              <div className="mb-2 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_42%),linear-gradient(160deg,#0f172a_0%,#172036_100%)] font-display text-lg font-semibold tracking-[0.18em] text-white shadow-[0_16px_30px_rgba(15,23,42,0.16)]">
                  {receiptInitials}
                </div>
              </div>
            )}
            <p className="mx-auto max-w-[22rem] text-balance break-words font-display text-2xl font-semibold leading-tight text-ink">
              {receiptBrand}
            </p>
            <p className="mt-1 text-sm text-slate-600">{posSettings?.address ?? shop?.address}</p>
            <p className="text-sm text-slate-600">{posSettings?.phone ?? shop?.phone}</p>
          </div>

          {refundState && refundState.totalRefundAmount > 0 ? (
            <div
              className={
                refundState.isFullyRefunded
                  ? "my-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-red-800"
                  : "my-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-amber-900"
              }
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                {refundState.isFullyRefunded ? t("refund.fullRefunded") : t("refund.partialRefunded")}
              </p>
              <p className="mt-1 font-semibold">
                {t("refund.totalRefunded")}: {formatCurrency(refundState.totalRefundAmount, shop?.currency ?? "SAR", locale)}
              </p>
            </div>
          ) : null}

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
                      {renderReceiptItemName(item)}
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
                      {renderReceiptItemName(item)}
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
                    {digitalReceiptUrl ? (
                      <a
                        className="mt-2 block truncate text-xs font-semibold text-emerald-700"
                        href={digitalReceiptUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {t("receipt.openDigitalReceipt")}
                      </a>
                    ) : null}
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
              {digitalReceiptUrl ? (
                <a
                  className="mt-3 inline-flex items-center gap-2 font-semibold text-emerald-700 hover:text-emerald-800"
                  href={digitalReceiptUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("receipt.openDigitalReceipt")}
                </a>
              ) : null}
            </div>

            {feedback && !pendingShareAction ? <p className="mt-4 text-sm font-medium text-olive">{feedback}</p> : null}

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

            <div className="mt-6 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-sm font-medium text-ink">{t("billing.customerSearchCompact")}</label>
              <Input
                placeholder={t("billing.customerSearchCompact")}
                value={contactCustomerSearch}
                onChange={(event) => setContactCustomerSearch(event.target.value)}
              />
              {contactCustomerSearch.trim() ? (
                <div
                  aria-label={t("billing.customerSearchCompact")}
                  className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2"
                  role="listbox"
                >
                  {matchedContactCustomers.length ? (
                    matchedContactCustomers.map((customer) => (
                      <button
                        aria-selected={contactForm.id === customer.id}
                        className="flex w-full items-center justify-between gap-4 rounded-xl border border-transparent px-4 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        key={customer.id}
                        onClick={() => selectShareCustomer(customer)}
                        role="option"
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">{customer.name}</span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {customer.phone || customer.whatsapp || customer.email || t("common.notAvailable")}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                          {contactForm.id === customer.id ? t("common.selected") : t("common.select")}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-5 text-center text-sm text-slate-500">{t("billing.noSavedCustomers")}</p>
                  )}
                </div>
              ) : contactForm.id ? (
                <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-emerald-950">{contactForm.name}</span>
                    <span className="mt-1 block truncate text-xs text-emerald-700">
                      {contactForm.phone || contactForm.whatsapp || contactForm.email || t("common.notAvailable")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm">
                    {t("common.selected")}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

            {feedback ? (
              <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
                {feedback}
              </div>
            ) : null}

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
