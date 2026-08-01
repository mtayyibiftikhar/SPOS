"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Printer, ReceiptText } from "lucide-react";
import { UnifiedReceipt } from "@/components/billing/unified-receipt";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { paymentMethodLabelKeys } from "@/lib/i18n";
import { printElementWithNative } from "@/lib/native-bridge";
import { buildQrCodeImageUrl } from "@/lib/qr-code";
import { buildPublicReceiptUrl } from "@/lib/public-receipts";
import {
  buildUnifiedReceiptPdfDocument,
  createReceiptPdfBlob,
  downloadBlob
} from "@/lib/receipt-export";
import { getReceiptItemNameLines, getReceiptItemNameText } from "@/lib/receipt-language";
import { loadFreshRefundReceiptHandoff, type FreshRefundReceiptHandoff } from "@/lib/receipt-handoff";
import { formatRefundReceiptNumber } from "@/lib/refunds";
import { formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";

export function RefundReceiptView({ refundId }: { refundId: string }) {
  const searchParams = useSearchParams();
  const { isHydrated, locale, state, t } = usePosApp();
  const hasAutoPrinted = useRef(false);
  const [receiptHandoff, setReceiptHandoff] = useState<FreshRefundReceiptHandoff | null>(null);
  const [receiptLookupTimedOut, setReceiptLookupTimedOut] = useState(false);
  const stateRefund = state.refunds.find((entry) => entry.id === refundId);
  const refund = stateRefund ?? receiptHandoff?.refund;
  const stateBill = refund ? state.bills.find((entry) => entry.id === refund.originalBillId) : undefined;
  const bill = stateBill ?? receiptHandoff?.bill;
  const stateRefundItems = stateRefund ? state.refundItems.filter((entry) => entry.refundId === stateRefund.id) : [];
  const items = stateRefundItems.length > 0 ? stateRefundItems : receiptHandoff?.refundItems ?? [];
  const shop = refund ? state.shops.find((entry) => entry.id === refund.shopId) : undefined;
  const cashier = refund ? state.users.find((entry) => entry.id === refund.createdBy) : undefined;
  const settings = refund ? state.settingsByShop[refund.shopId] : undefined;
  const currency = shop?.currency ?? "SAR";
  const receiptNumber = formatRefundReceiptNumber(refundId);
  const isFreshReceipt = searchParams.get("fresh") === "1";
  const receiptBrand = settings?.pos.shopName ?? shop?.name ?? t("brand.name");
  const originalItems = stateBill ? state.billItems.filter((entry) => entry.billId === stateBill.id) : receiptHandoff?.billItems ?? [];
  const refundQuantityByBillItemId = items.reduce<Record<string, number>>((quantities, item) => {
    quantities[item.billItemId] = (quantities[item.billItemId] ?? 0) + item.quantity;
    return quantities;
  }, {});
  const isFullRefund = originalItems.length > 0 && originalItems.every((item) => (refundQuantityByBillItemId[item.id] ?? 0) >= item.quantity);
  const earlierRefundTotal = bill ? Math.abs(state.refunds.filter((entry) => entry.originalBillId === bill.id && (entry.returnDate < (refund?.returnDate ?? "") || (entry.returnDate === refund?.returnDate && entry.id.localeCompare(refund.id) < 0))).reduce((sum, entry) => sum + entry.amount, 0)) : 0;
  const remainingAfterRefund = Math.max(0, (bill?.total ?? 0) - earlierRefundTotal - Math.abs(refund?.amount ?? 0));
  const digitalReceiptUrl = bill?.publicToken ? buildPublicReceiptUrl(bill.publicToken) : undefined;
  const refundReceiptUrl = digitalReceiptUrl ? `${digitalReceiptUrl}?refund=${encodeURIComponent(refundId)}` : undefined;
  const receiptQrUrl = buildQrCodeImageUrl(refundReceiptUrl, 172);
  const refundCustomer = {
    name: refund?.customerName || bill?.customerName || "Customer",
    phone: refund?.customerPhone || bill?.customerPhone,
    email: refund?.customerEmail || bill?.customerEmail,
    whatsapp: refund?.customerWhatsapp || bill?.customerWhatsapp,
    vatNumber: refund?.customerVatNumber || bill?.customerVatNumber,
    address: refund?.customerAddress || bill?.customerAddress
  };

  useEffect(() => setReceiptHandoff(loadFreshRefundReceiptHandoff(refundId)), [refundId]);
  useEffect(() => {
    if (!isHydrated || (refund && bill)) {
      setReceiptLookupTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setReceiptLookupTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, [bill, isHydrated, refund, refundId]);

  const printReceipt = async (silent = false) => {
    const printed = await printElementWithNative("#refund-receipt-print-area", `Refund ${receiptNumber}`, {
      deviceName: settings?.printer.printerDeviceName,
      receiptSize: settings?.printer.receiptSize,
      silent
    }).catch(() => false);
    if (!printed) window.print();
  };

  useEffect(() => {
    if (!refund || !isFreshReceipt || !settings?.printer.autoPrintAfterSale || hasAutoPrinted.current) return;
    hasAutoPrinted.current = true;
    const timer = window.setTimeout(() => void printReceipt(true), 320);
    return () => window.clearTimeout(timer);
  }, [isFreshReceipt, refund?.id, settings?.printer.autoPrintAfterSale, settings?.printer.printerDeviceName, settings?.printer.receiptSize]);

  if (!isHydrated || ((!refund || !bill) && !receiptLookupTimedOut)) {
    return <Card className="flex min-h-52 items-center justify-center p-8 text-center"><p className="text-sm font-medium text-slate-600">Loading refund receipt...</p></Card>;
  }
  if (!refund || !bill) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t("nav.refunds")} title="Refund receipt unavailable" subtitle="This refund could not be found in the current shop." />
        <Button asChild variant="secondary"><Link href="/refunds?view=history">Back to refund history</Link></Button>
      </div>
    );
  }

  const money = (amount: number) => formatCurrency(amount, currency, locale);
  const receiptDocument = buildUnifiedReceiptPdfDocument({
    receiptNumber,
    receiptSize: settings?.receipt.receiptSize ?? settings?.printer.receiptSize ?? "80mm",
    shopName: receiptBrand,
    shopAddress: settings?.pos.address ?? shop?.address,
    shopPhone: settings?.pos.phone ?? shop?.phone,
    shopVatNumber: settings?.pos.vatNumber,
    shopLogoUrl: settings?.pos.logoUrl,
    receiptType: isFullRefund ? "Full refund receipt" : "Partial refund receipt",
    metadata: [
      { label: "Refund number", value: receiptNumber },
      { label: "Payout method", value: t(paymentMethodLabelKeys[refund.paymentMethod]) },
      { label: "Original sale", value: bill.number },
      { label: "Sale date", value: formatBusinessDate(refund.originalSaleDate, locale) },
      { label: "Returned", value: formatDateTime(refund.returnDate, locale) },
      { label: "Processed by", value: cashier?.name ?? t("common.notAvailable") }
    ],
    customer: refundCustomer,
    itemsLabel: "Refunded items",
    items: items.map((item) => ({ name: getReceiptItemNameText(item.productName, settings?.receipt), quantity: String(item.quantity), unitPrice: money(Math.abs(item.unitPrice)), total: money(Math.abs(item.refundAmount)) })),
    totals: [
      { label: "Original sale total", value: money(bill.total) },
      ...(earlierRefundTotal > 0 ? [{ label: "Earlier refunds", value: `-${money(earlierRefundTotal)}` }] : []),
      { label: "This refund", value: `-${money(Math.abs(refund.amount))}`, strong: true },
      { label: "Remaining refundable value", value: money(remainingAfterRefund) }
    ],
    note: { label: "Refund reason", value: refund.reason },
    footerText: settings?.receipt.footerText,
    qrCodeUrl: receiptQrUrl,
    qrCaption: `Refund ${receiptNumber}`,
    ownerBrand: state.brand,
    fileName: `${receiptNumber.toLowerCase()}-refund.pdf`
  });
  const downloadReceipt = async () => downloadBlob(await createReceiptPdfBlob(receiptDocument), receiptDocument.fileName);

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="print:hidden"><PageHeader eyebrow={t("nav.refunds")} title={`Refund receipt ${receiptNumber}`} subtitle="The refund is saved and ready to print or download for the customer." /></div>
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button asChild variant="secondary"><Link href="/refunds?view=history"><ArrowLeft className="mr-2 h-4 w-4" />Back to refund history</Link></Button>
        <Button asChild variant="secondary"><Link href={`/bills/${bill.id}`}>Open original receipt</Link></Button>
        <Button onClick={() => void printReceipt()}><Printer className="mr-2 h-4 w-4" />Print refund receipt</Button>
        <Button onClick={() => void downloadReceipt()} variant="secondary"><Download className="mr-2 h-4 w-4" />Download PDF</Button>
      </div>
      {isFreshReceipt ? <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 print:hidden">Refund saved successfully. Review, print, or download this receipt for the customer.</div> : null}

      <UnifiedReceipt
        id="refund-receipt-print-area"
        shop={{ name: receiptBrand, logoUrl: settings?.pos.logoUrl, address: settings?.pos.address ?? shop?.address, phone: settings?.pos.phone ?? shop?.phone, vatNumber: settings?.pos.vatNumber }}
        receiptType={{ label: isFullRefund ? "Full refund" : "Partial refund", description: "Customer refund receipt", tone: "negative", icon: <ReceiptText className="h-4 w-4" /> }}
        metadata={[
          { label: "Refund number", value: receiptNumber },
          { label: "Payout method", value: t(paymentMethodLabelKeys[refund.paymentMethod]) },
          { label: "Original sale", value: bill.number },
          { label: "Sale date", value: formatBusinessDate(refund.originalSaleDate, locale) },
          { label: "Returned", value: formatDateTime(refund.returnDate, locale) },
          { label: "Processed by", value: cashier?.name ?? t("common.notAvailable") }
        ]}
        customer={refundCustomer}
        itemLabels={{ items: "Refunded items", unitPrice: "Unit price", total: "Refund" }}
        items={items.map((item) => ({ id: item.id, name: getReceiptItemNameLines(item.productName, settings?.receipt).map((line) => <span className={line.isSecondary ? "mt-0.5 block text-sm font-medium text-slate-600" : "block"} dir={line.direction} key={`${item.id}-${line.text}`}>{line.text}</span>), quantity: item.quantity, unitPrice: money(Math.abs(item.unitPrice)), total: money(Math.abs(item.refundAmount)) }))}
        totals={[
          { label: "Original sale total", value: money(bill.total) },
          ...(earlierRefundTotal > 0 ? [{ label: "Earlier refunds", value: `-${money(earlierRefundTotal)}` }] : []),
          { label: "This refund", value: `-${money(Math.abs(refund.amount))}`, emphasis: "negative" as const },
          { label: "Remaining refundable value", value: money(remainingAfterRefund) }
        ]}
        note={{ label: "Refund reason", value: refund.reason }}
        footerText={settings?.receipt.footerText}
        qr={receiptQrUrl ? { imageUrl: receiptQrUrl, href: refundReceiptUrl, code: receiptNumber, title: "Refund receipt QR", description: "Scan to reopen this exact verified refund receipt" } : undefined}
        ownerBrand={{ enabled: state.brand.receiptImprintEnabled, companyName: state.brand.companyName, logoUrl: state.brand.logoUrl, imprintText: state.brand.receiptImprintText, website: state.brand.website, address: state.brand.address, supportPhone: state.brand.supportPhone, supportEmail: state.brand.supportEmail }}
      />
    </div>
  );
}
