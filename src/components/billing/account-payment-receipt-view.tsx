"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer, WalletCards } from "lucide-react";
import { ReceiptBrandHeader } from "@/components/billing/receipt-brand-header";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { printElementWithNative } from "@/lib/native-bridge";
import { createReceiptPdfBlob, type ReceiptPdfDocument } from "@/lib/receipt-export";
import { downloadBlob } from "@/lib/report-export";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export function AccountPaymentReceiptView({ paymentId }: { paymentId: string }) {
  const { currentShop, currentShopId, locale, state } = usePosApp();
  const payment = state.customerAccountPayments.find(
    (entry) => entry.id === paymentId && entry.shopId === currentShopId
  );
  const customer = payment ? state.customers.find((entry) => entry.id === payment.customerId) : null;
  const operator = payment ? state.users.find((entry) => entry.id === payment.createdBy) : null;
  const shopSettings = currentShopId ? state.settingsByShop[currentShopId] : undefined;
  const settings = shopSettings?.pos;
  const printerSettings = shopSettings?.printer;
  const currency = currentShop?.currency ?? "SAR";
  const shopName = settings?.shopName ?? currentShop?.name ?? "Simple POS";
  const allocations = payment?.allocations ?? [];

  if (!payment) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Accounts"
          title="Account payment receipt unavailable"
          subtitle="This payment could not be found in the current shop."
        />
        <Button asChild variant="secondary">
          <Link href="/accounts"><ArrowLeft className="mr-2 h-4 w-4" />Back to accounts</Link>
        </Button>
      </div>
    );
  }

  const handlePrint = async () => {
    const printed = await printElementWithNative("#account-payment-receipt", payment.number, {
      deviceName: printerSettings?.printerDeviceName,
      receiptSize: printerSettings?.receiptSize
    });
    if (!printed) window.print();
  };

  const handleDownload = async () => {
    const receiptDocument: ReceiptPdfDocument = {
      fileName: `${payment.number.toLowerCase()}-account-payment.pdf`,
      receiptSize: printerSettings?.receiptSize ?? "80mm",
      headerLines: [
        shopName,
        settings?.address ?? currentShop?.address ?? "",
        settings?.phone ?? currentShop?.phone ?? "",
        settings?.vatNumber ? `VAT No. ${settings.vatNumber}` : ""
      ].filter(Boolean),
      logoUrl: settings?.logoUrl,
      ownerLogoUrl: state.brand.logoUrl,
      ownerImprintLines: state.brand.receiptImprintEnabled
        ? [state.brand.receiptImprintText || `Powered by ${state.brand.companyName}`, state.brand.companyName]
        : undefined,
      elements: [
        { type: "text", text: "ACCOUNT PAYMENT RECEIPT", align: "center", bold: true, size: 11, spacingAfter: 8 },
        { type: "rule", spacingAfter: 8 },
        { type: "pair", label: "Receipt", value: payment.number, valueBold: true, size: 9.5, spacingAfter: 4 },
        { type: "pair", label: "Date", value: formatDateTime(payment.createdAt, locale), size: 9.5, spacingAfter: 4 },
        { type: "pair", label: "Method", value: payment.method === "cash" ? "Cash" : "Card", size: 9.5, spacingAfter: 4 },
        { type: "pair", label: "Received by", value: operator?.name ?? "POS user", size: 9.5, spacingAfter: 8 },
        { type: "rule", spacingAfter: 8 },
        { type: "text", text: "CUSTOMER", bold: true, size: 9.5, spacingAfter: 4 },
        { type: "text", text: customer?.name ?? "Customer", bold: true, size: 10, spacingAfter: 3 },
        ...(customer?.phone ? [{ type: "text" as const, text: customer.phone, size: 9, spacingAfter: 3 }] : []),
        ...(customer?.vatNumber ? [{ type: "text" as const, text: `VAT No. ${customer.vatNumber}`, size: 9, spacingAfter: 3 }] : []),
        ...(customer?.address ? [{ type: "text" as const, text: customer.address, size: 9, spacingAfter: 6 }] : []),
        { type: "rule", spacingAfter: 8 },
        { type: "text", text: "APPLIED RECEIPTS", bold: true, size: 9.5, spacingAfter: 5 },
        ...allocations.map((allocation) => ({
          type: "pair" as const,
          label: allocation.billNumber,
          value: formatCurrency(allocation.amount, currency, locale),
          valueBold: true,
          size: 9.5,
          spacingAfter: 4
        })),
        { type: "rule", spacingBefore: 4, spacingAfter: 8 },
        { type: "pair", label: "AMOUNT RECEIVED", value: formatCurrency(payment.amount, currency, locale), labelBold: true, valueBold: true, size: 12, spacingAfter: 6 },
        ...(payment.note ? [{ type: "text" as const, text: `Note: ${payment.note}`, size: 9, spacingAfter: 4 }] : [])
      ]
    };
    const blob = await createReceiptPdfBlob(receiptDocument);
    downloadBlob(blob, receiptDocument.fileName);
  };

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Accounts"
          title={`Account payment receipt ${payment.number}`}
          subtitle="The payment is saved and ready to print or download for the customer."
        />
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <Button asChild variant="secondary">
          <Link href="/accounts"><ArrowLeft className="mr-2 h-4 w-4" />Back to accounts</Link>
        </Button>
        <Button asChild variant="secondary"><Link href="/bills">View all bills and payments</Link></Button>
        <Button onClick={() => void handlePrint()}><Printer className="mr-2 h-4 w-4" />Print receipt</Button>
        <Button onClick={() => void handleDownload()} variant="secondary"><Download className="mr-2 h-4 w-4" />Download PDF</Button>
      </div>

      <Card
        className="receipt-paper mx-auto w-full max-w-3xl p-6 sm:p-8 print:mx-0 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none"
        id="account-payment-receipt"
      >
        <ReceiptBrandHeader
          address={settings?.address ?? currentShop?.address}
          logoUrl={settings?.logoUrl}
          phone={settings?.phone ?? currentShop?.phone}
          shopName={shopName}
          vatNumber={settings?.vatNumber}
        />

        <div className="mt-5 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
            <WalletCards className="h-4 w-4" />Account payment
          </div>
          <p className="mt-3 text-sm font-medium text-slate-500">Customer account payment receipt</p>
        </div>

        <div className="grid gap-4 border-b border-dashed border-line py-5 sm:grid-cols-2">
          <div className="space-y-2 text-sm text-slate-600">
            <p><span className="font-medium text-ink">Receipt number:</span> {payment.number}</p>
            <p><span className="font-medium text-ink">Date / time:</span> {formatDateTime(payment.createdAt, locale)}</p>
            <p><span className="font-medium text-ink">Received by:</span> {operator?.name ?? "POS user"}</p>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <p><span className="font-medium text-ink">Payment method:</span> {payment.method === "cash" ? "Cash" : "Card"}</p>
            <p><span className="font-medium text-ink">Applied receipts:</span> {allocations.length}</p>
            <p><span className="font-medium text-ink">Status:</span> Received</p>
          </div>
        </div>

        <div className="border-b border-dashed border-line py-5 text-sm text-slate-600">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer</p>
          <p className="mt-2 font-semibold text-ink">{customer?.name ?? "Customer"}</p>
          {customer?.phone ? <p className="mt-1">{customer.phone}</p> : null}
          {customer?.email ? <p>{customer.email}</p> : null}
          {customer?.vatNumber ? <p>VAT number: {customer.vatNumber}</p> : null}
          {customer?.address ? <p>Address: {customer.address}</p> : null}
        </div>

        <div className="py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Applied receipts</p>
          <div className="overflow-hidden rounded-2xl border border-line/80">
            <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-3 bg-shell px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <span>Receipt</span><span className="text-right">Payment applied</span>
            </div>
            {allocations.map((allocation) => (
              <Link
                className="grid grid-cols-[minmax(0,1fr)_130px] gap-3 border-t border-line/70 px-4 py-3 text-sm transition hover:bg-emerald-50/60"
                href={`/bills/${allocation.billId}?from=accounts`}
                key={`${payment.id}-${allocation.billId}`}
              >
                <span className="font-medium text-ink">{allocation.billNumber}</span>
                <span className="text-right font-semibold text-ink">{formatCurrency(allocation.amount, currency, locale)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-dashed border-line pt-5">
          <div className="ml-auto max-w-sm">
            <div className="flex items-center justify-between text-xl font-semibold text-emerald-700">
              <span>Amount received</span><span>{formatCurrency(payment.amount, currency, locale)}</span>
            </div>
          </div>
          {payment.note ? (
            <div className="mt-5 rounded-2xl border border-line bg-shell/70 p-4 text-sm text-slate-600">
              <span className="font-medium text-ink">Note:</span> {payment.note}
            </div>
          ) : null}
        </div>

        {state.brand.receiptImprintEnabled ? (
          <div className="mt-5 border-t border-dashed border-line pt-5 text-center text-xs leading-5 text-slate-500">
            <p className="font-semibold text-slate-700">{state.brand.receiptImprintText || `Powered by ${state.brand.companyName}`}</p>
            <p>{state.brand.companyName}</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
