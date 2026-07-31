"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer, WalletCards } from "lucide-react";
import { UnifiedReceipt } from "@/components/billing/unified-receipt";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { printElementWithNative } from "@/lib/native-bridge";
import { buildQrCodeImageUrl } from "@/lib/qr-code";
import {
  buildUnifiedReceiptPdfDocument,
  createReceiptPdfBlob,
  downloadBlob
} from "@/lib/receipt-export";
import { buildPublicReceiptUrl, getPublicReceiptBaseUrl } from "@/lib/public-receipts";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export function AccountPaymentReceiptView({ paymentId }: { paymentId: string }) {
  const { currentShop, currentShopId, locale, state } = usePosApp();
  const payment = state.customerAccountPayments.find((entry) => entry.id === paymentId && entry.shopId === currentShopId);
  const customer = payment ? state.customers.find((entry) => entry.id === payment.customerId) : null;
  const operator = payment ? state.users.find((entry) => entry.id === payment.createdBy) : null;
  const shopSettings = currentShopId ? state.settingsByShop[currentShopId] : undefined;
  const settings = shopSettings?.pos;
  const receiptSettings = shopSettings?.receipt;
  const printerSettings = shopSettings?.printer;
  const currency = currentShop?.currency ?? "SAR";
  const shopName = settings?.shopName ?? currentShop?.name ?? "Simple POS";
  const allocations = payment?.allocations ?? [];

  if (!payment) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Accounts" title="Account payment receipt unavailable" subtitle="This payment could not be found in the current shop." />
        <Button asChild variant="secondary"><Link href="/accounts"><ArrowLeft className="mr-2 h-4 w-4" />Back to accounts</Link></Button>
      </div>
    );
  }

  const verificationBill = allocations
    .map((allocation) => state.bills.find((entry) => entry.id === allocation.billId))
    .find((entry) => entry?.publicToken);
  const publicSaleUrl = buildPublicReceiptUrl(verificationBill?.publicToken);
  const receiptUrl = publicSaleUrl
    ? `${publicSaleUrl}?payment=${encodeURIComponent(payment.id)}`
    : `${getPublicReceiptBaseUrl()}/bills/payments/${payment.id}`;
  const qrImageUrl = buildQrCodeImageUrl(receiptUrl, 172);
  const money = (amount: number) => formatCurrency(amount, currency, locale);
  const receiptDocument = buildUnifiedReceiptPdfDocument({
    receiptNumber: payment.number,
    receiptSize: receiptSettings?.receiptSize ?? printerSettings?.receiptSize ?? "80mm",
    shopName,
    shopAddress: settings?.address ?? currentShop?.address,
    shopPhone: settings?.phone ?? currentShop?.phone,
    shopVatNumber: settings?.vatNumber,
    shopLogoUrl: settings?.logoUrl,
    receiptType: "Account payment receipt",
    metadata: [
      { label: "Receipt number", value: payment.number },
      { label: "Payment method", value: payment.method === "cash" ? "Cash" : "Card" },
      { label: "Date / time", value: formatDateTime(payment.createdAt, locale) },
      { label: "Status", value: "Received" },
      { label: "Received by", value: operator?.name ?? "POS user" },
      { label: "Applied receipts", value: String(allocations.length) }
    ],
    customer: {
      name: customer?.name ?? "Customer",
      phone: customer?.phone,
      email: customer?.email,
      whatsapp: customer?.whatsapp,
      vatNumber: customer?.vatNumber,
      address: customer?.address
    },
    itemsLabel: "Applied receipts",
    items: allocations.map((allocation) => ({
      name: allocation.billNumber,
      quantity: "1",
      unitPrice: money(allocation.amount),
      total: money(allocation.amount)
    })),
    totals: [{ label: "Amount received", value: money(payment.amount), strong: true }],
    note: payment.note ? { label: "Note", value: payment.note } : undefined,
    footerText: receiptSettings?.footerText,
    qrCodeUrl: qrImageUrl,
    qrCaption: `Account payment ${payment.number}`,
    ownerBrand: state.brand,
    fileName: `${payment.number.toLowerCase()}-account-payment.pdf`
  });

  const handlePrint = async () => {
    const printed = await printElementWithNative("#account-payment-receipt", payment.number, {
      deviceName: printerSettings?.printerDeviceName,
      receiptSize: printerSettings?.receiptSize
    });
    if (!printed) window.print();
  };
  const handleDownload = async () => downloadBlob(await createReceiptPdfBlob(receiptDocument), receiptDocument.fileName);

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="print:hidden">
        <PageHeader eyebrow="Accounts" title={`Account payment receipt ${payment.number}`} subtitle="The payment is saved and ready to print or download for the customer." />
      </div>
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button asChild variant="secondary"><Link href="/accounts"><ArrowLeft className="mr-2 h-4 w-4" />Back to accounts</Link></Button>
        <Button asChild variant="secondary"><Link href="/bills">View all bills and payments</Link></Button>
        <Button onClick={() => void handlePrint()}><Printer className="mr-2 h-4 w-4" />Print receipt</Button>
        <Button onClick={() => void handleDownload()} variant="secondary"><Download className="mr-2 h-4 w-4" />Download PDF</Button>
      </div>

      <UnifiedReceipt
        id="account-payment-receipt"
        shop={{ name: shopName, logoUrl: settings?.logoUrl, address: settings?.address ?? currentShop?.address, phone: settings?.phone ?? currentShop?.phone, vatNumber: settings?.vatNumber }}
        receiptType={{ label: "Account payment", description: "Customer account payment receipt", tone: "positive", icon: <WalletCards className="h-4 w-4" /> }}
        metadata={[
          { label: "Receipt number", value: payment.number },
          { label: "Payment method", value: payment.method === "cash" ? "Cash" : "Card" },
          { label: "Date / time", value: formatDateTime(payment.createdAt, locale) },
          { label: "Status", value: "Received" },
          { label: "Received by", value: operator?.name ?? "POS user" },
          { label: "Applied receipts", value: allocations.length }
        ]}
        customer={{ name: customer?.name ?? "Customer", phone: customer?.phone, email: customer?.email, whatsapp: customer?.whatsapp, vatNumber: customer?.vatNumber, address: customer?.address }}
        itemLabels={{ items: "Applied receipts", unitPrice: "Payment", total: "Applied" }}
        items={allocations.map((allocation) => ({ id: `${payment.id}-${allocation.billId}`, name: <Link className="hover:text-emerald-700" href={`/bills/${allocation.billId}?from=accounts`}>{allocation.billNumber}</Link>, quantity: 1, unitPrice: money(allocation.amount), total: money(allocation.amount) }))}
        totals={[{ label: "Amount received", value: money(payment.amount), emphasis: "positive" }]}
        note={payment.note ? { label: "Note", value: payment.note } : undefined}
        footerText={receiptSettings?.footerText}
        qr={qrImageUrl ? { imageUrl: qrImageUrl, href: receiptUrl, code: payment.number, title: "Payment receipt QR", description: "Scan to reopen this account payment receipt" } : undefined}
        ownerBrand={{ enabled: state.brand.receiptImprintEnabled, companyName: state.brand.companyName, logoUrl: state.brand.logoUrl, imprintText: state.brand.receiptImprintText, website: state.brand.website, address: state.brand.address, supportPhone: state.brand.supportPhone, supportEmail: state.brand.supportEmail }}
      />
    </div>
  );
}
