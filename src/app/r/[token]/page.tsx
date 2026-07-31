import { RotateCcw, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { UnifiedReceipt, type UnifiedReceiptCustomer, type UnifiedReceiptItem, type UnifiedReceiptMeta, type UnifiedReceiptTotal } from "@/components/billing/unified-receipt";
import { PublicReceiptActions } from "@/components/billing/public-receipt-actions";
import { buildQrCodeImageUrl } from "@/lib/qr-code";
import { getReceiptItemNameLines } from "@/lib/receipt-language";
import { buildPublicReceiptUrl, normalizePublicReceiptToken } from "@/lib/public-receipts";
import { calculateBillRefundState } from "@/lib/refunds";
import { formatRefundReceiptNumber } from "@/lib/refunds";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";
import type { Bill, BillItem, BrandProfile, Customer, CustomerAccountPayment, DemoAppState, Refund, RefundItem, Shop, ShopSettingsBundle, User } from "@/types/pos";

export const dynamic = "force-dynamic";

type PublicReceiptPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ refund?: string; payment?: string }>;
};
type SnapshotRow = { shop_id: string; state: Partial<DemoAppState> | null; updated_at: string | null };
type DigitalReceipt = {
  bill: Bill;
  cashier: User | null;
  items: BillItem[];
  logoUrl: string | null;
  refunds: Refund[];
  refundItems: RefundItem[];
  settings: ShopSettingsBundle | null;
  shop: Shop | null;
  brand: BrandProfile | null;
  accountPayments: CustomerAccountPayment[];
  customers: Customer[];
  users: User[];
  updatedAt: string | null;
  vatNumber: string | null;
};

async function loadDigitalReceipt(token: string): Promise<DigitalReceipt | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("shop_cloud_snapshots")
    .select("shop_id, state, updated_at")
    .contains("state", { bills: [{ publicToken: token }] })
    .limit(1);
  if (error) throw error;

  let rows = (data ?? []) as SnapshotRow[];
  if (rows.length === 0) {
    const fallback = await supabase.from("shop_cloud_snapshots").select("shop_id, state, updated_at").limit(500);
    if (fallback.error) throw fallback.error;
    rows = ((fallback.data ?? []) as SnapshotRow[]).filter((row) => row.state?.bills?.some((bill) => bill.publicToken === token));
  }

  const row = rows[0];
  if (!row?.state) return null;
  const bill = row.state.bills?.find((entry) => entry.publicToken === token);
  if (!bill) return null;

  const settings = row.state.settingsByShop?.[bill.shopId] ?? null;
  const refunds = row.state.refunds?.filter((refund) => refund.originalBillId === bill.id) ?? [];
  const refundIds = new Set(refunds.map((refund) => refund.id));
  const { data: liveSettings } = await supabase.from("pos_settings").select("logo_url, vat_number").eq("shop_id", bill.shopId).maybeSingle();

  return {
    bill,
    cashier: row.state.users?.find((user) => user.id === bill.cashierId) ?? null,
    items: row.state.billItems?.filter((item) => item.billId === bill.id) ?? [],
    logoUrl: liveSettings ? liveSettings.logo_url : settings?.pos.logoUrl ?? null,
    refunds,
    refundItems: row.state.refundItems?.filter((item) => refundIds.has(item.refundId)) ?? [],
    settings,
    shop: row.state.shops?.find((entry) => entry.id === bill.shopId) ?? null,
    brand: row.state.brand ?? null,
    accountPayments: row.state.customerAccountPayments ?? [],
    customers: row.state.customers ?? [],
    users: row.state.users ?? [],
    updatedAt: row.updated_at,
    vatNumber: settings?.pos.vatNumber?.trim() || liveSettings?.vat_number?.trim() || null
  };
}

export default async function PublicReceiptPage({ params, searchParams }: PublicReceiptPageProps) {
  const { token: rawToken } = await params;
  const { refund: requestedRefundId, payment: requestedPaymentId } = await searchParams;
  const token = normalizePublicReceiptToken(rawToken);
  if (!token) notFound();
  const receipt = await loadDigitalReceipt(token).catch(() => null);
  if (!receipt) notFound();

  const { bill, cashier, items, logoUrl, refunds, refundItems, settings, shop, brand, updatedAt, vatNumber, accountPayments, customers, users } = receipt;
  const currency = shop?.currency ?? settings?.pos.currency ?? "SAR";
  const shopName = settings?.pos.shopName ?? shop?.name ?? "Simple POS";
  const receiptSettings = settings?.receipt;
  const refundState = calculateBillRefundState({ billId: bill.id, billItems: items, refunds, refundItems });
  const publicReceiptUrl = buildPublicReceiptUrl(token);
  if (!publicReceiptUrl) notFound();
  const money = (amount: number) => formatCurrency(amount, currency, "en");
  const paymentLabel = bill.paymentMethod === "account" ? "Account / Pay later" : bill.paymentMethod === "cash" ? "Cash" : "Card";
  const statusLabel = refundState.isFullyRefunded ? "Refunded" : refundState.totalRefundAmount > 0 ? "Partially refunded" : bill.status;
  const requestedRefund = requestedRefundId ? refunds.find((entry) => entry.id === requestedRefundId) : undefined;
  const requestedPayment = requestedPaymentId
    ? accountPayments.find((entry) => entry.id === requestedPaymentId && entry.allocations?.some((allocation) => allocation.billId === bill.id))
    : undefined;
  if ((requestedRefundId && !requestedRefund) || (requestedPaymentId && !requestedPayment)) notFound();

  let receiptType: { label: string; description: string; tone: "positive" | "negative" } | undefined;
  let metadata: UnifiedReceiptMeta[] = [
    { label: "Receipt number", value: bill.number },
    { label: "Payment method", value: paymentLabel },
    { label: "Date / time", value: formatDateTime(bill.createdAt, "en") },
    { label: "Status", value: statusLabel },
    { label: "Cashier", value: cashier?.name ?? "Not available" },
    { label: "Due amount", value: money(bill.dueAmount) }
  ];
  let customer: UnifiedReceiptCustomer = { name: bill.customerName?.trim() || "Walk-in Customer", phone: bill.customerPhone, email: bill.customerEmail, whatsapp: bill.customerWhatsapp, vatNumber: bill.customerVatNumber, address: bill.customerAddress };
  let displayItems: UnifiedReceiptItem[] = items.map((item) => ({
    id: item.id,
    name: getReceiptItemNameLines(item.productName, receiptSettings).map((line) => <span className={line.isSecondary ? "mt-0.5 block text-sm font-medium text-slate-600" : "block"} dir={line.direction} key={`${item.id}-${line.text}`}>{line.text}</span>),
    quantity: item.quantity,
    unitPrice: money(item.unitPrice),
    total: money(item.lineTotal),
    detail: item.discountAmount > 0 ? `Item discount -${money(item.discountAmount)}` : undefined
  }));
  let totals: UnifiedReceiptTotal[] = [
    { label: "Subtotal", value: money(bill.subtotal) },
    ...((bill.itemDiscountAmount ?? 0) > 0 ? [{ label: "Item discounts", value: `-${money(bill.itemDiscountAmount ?? 0)}` }] : []),
    { label: "Discount", value: money(bill.discountAmount) },
    { label: bill.taxName ?? settings?.tax.name ?? "Tax", value: money(bill.taxAmount) },
    { label: "Total", value: money(bill.total), emphasis: "strong" },
    { label: "Paid amount", value: money(bill.paidAmount) },
    { label: "Due amount", value: money(bill.dueAmount) },
    ...(refundState.totalRefundAmount > 0 ? [{ label: "Refunded amount", value: `-${money(refundState.totalRefundAmount)}`, emphasis: "negative" as const }] : [])
  ];
  let itemLabels: { items?: string; quantity?: string; unitPrice?: string; total?: string } | undefined;
  let note: { label: string; value: ReactNode } | undefined;
  let statusBanner: ReactNode = refundState.totalRefundAmount > 0 ? (
    <div className={`my-5 rounded-2xl border px-4 py-3 text-center ${refundState.isFullyRefunded ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]"><RotateCcw className="h-4 w-4" />{refundState.isFullyRefunded ? "Fully refunded" : "Partially refunded"}</p>
      <p className="mt-1 font-semibold">Refunded amount: {money(refundState.totalRefundAmount)}</p>
    </div>
  ) : null;
  let receiptCode = bill.number;
  let qrTitle = "Receipt QR";
  let qrDescription = "Scan to reopen this verified digital receipt";

  if (requestedRefund) {
    const receiptNumber = formatRefundReceiptNumber(requestedRefund.id);
    const selectedItems = refundItems.filter((entry) => entry.refundId === requestedRefund.id);
    const quantities = selectedItems.reduce<Record<string, number>>((map, entry) => ({ ...map, [entry.billItemId]: (map[entry.billItemId] ?? 0) + entry.quantity }), {});
    const fullRefund = items.length > 0 && items.every((entry) => (quantities[entry.id] ?? 0) >= entry.quantity);
    const earlierRefunds = Math.abs(refunds.filter((entry) => entry.returnDate < requestedRefund.returnDate || (entry.returnDate === requestedRefund.returnDate && entry.id.localeCompare(requestedRefund.id) < 0)).reduce((sum, entry) => sum + entry.amount, 0));
    receiptType = { label: fullRefund ? "Full refund" : "Partial refund", description: "Customer refund receipt", tone: "negative" };
    metadata = [
      { label: "Refund number", value: receiptNumber },
      { label: "Payout method", value: requestedRefund.paymentMethod === "cash" ? "Cash" : requestedRefund.paymentMethod === "card" ? "Card" : "Account" },
      { label: "Original sale", value: bill.number },
      { label: "Sale date", value: formatBusinessDate(requestedRefund.originalSaleDate, "en") },
      { label: "Returned", value: formatDateTime(requestedRefund.returnDate, "en") },
      { label: "Processed by", value: users.find((entry) => entry.id === requestedRefund.createdBy)?.name ?? "Not available" }
    ];
    displayItems = selectedItems.map((item) => ({ id: item.id, name: getReceiptItemNameLines(item.productName, receiptSettings).map((line) => <span className={line.isSecondary ? "mt-0.5 block text-sm font-medium text-slate-600" : "block"} dir={line.direction} key={`${item.id}-${line.text}`}>{line.text}</span>), quantity: item.quantity, unitPrice: money(Math.abs(item.unitPrice)), total: money(Math.abs(item.refundAmount)) }));
    itemLabels = { items: "Refunded items", unitPrice: "Unit price", total: "Refund" };
    totals = [
      { label: "Original sale total", value: money(bill.total) },
      ...(earlierRefunds > 0 ? [{ label: "Earlier refunds", value: `-${money(earlierRefunds)}` }] : []),
      { label: "This refund", value: `-${money(Math.abs(requestedRefund.amount))}`, emphasis: "negative" },
      { label: "Remaining refundable value", value: money(Math.max(0, bill.total - earlierRefunds - Math.abs(requestedRefund.amount))) }
    ];
    note = { label: "Refund reason", value: requestedRefund.reason };
    statusBanner = null;
    receiptCode = receiptNumber;
    qrTitle = "Refund receipt QR";
    qrDescription = "Scan to reopen this verified refund receipt";
  } else if (requestedPayment) {
    const selectedCustomer = customers.find((entry) => entry.id === requestedPayment.customerId);
    receiptType = { label: "Account payment", description: "Customer account payment receipt", tone: "positive" };
    metadata = [
      { label: "Receipt number", value: requestedPayment.number },
      { label: "Payment method", value: requestedPayment.method === "cash" ? "Cash" : "Card" },
      { label: "Date / time", value: formatDateTime(requestedPayment.createdAt, "en") },
      { label: "Status", value: "Received" },
      { label: "Received by", value: users.find((entry) => entry.id === requestedPayment.createdBy)?.name ?? "POS user" },
      { label: "Applied receipts", value: requestedPayment.allocations?.length ?? 0 }
    ];
    customer = { name: selectedCustomer?.name ?? "Customer", phone: selectedCustomer?.phone, email: selectedCustomer?.email, whatsapp: selectedCustomer?.whatsapp, vatNumber: selectedCustomer?.vatNumber, address: selectedCustomer?.address };
    displayItems = (requestedPayment.allocations ?? []).map((allocation) => ({ id: `${requestedPayment.id}-${allocation.billId}`, name: allocation.billNumber, quantity: 1, unitPrice: money(allocation.amount), total: money(allocation.amount) }));
    itemLabels = { items: "Applied receipts", unitPrice: "Payment", total: "Applied" };
    totals = [{ label: "Amount received", value: money(requestedPayment.amount), emphasis: "positive" }];
    note = requestedPayment.note ? { label: "Note", value: requestedPayment.note } : undefined;
    statusBanner = null;
    receiptCode = requestedPayment.number;
    qrTitle = "Payment receipt QR";
    qrDescription = "Scan to reopen this verified account payment receipt";
  }
  const exactPublicReceiptUrl = requestedRefund
    ? `${publicReceiptUrl}?refund=${encodeURIComponent(requestedRefund.id)}`
    : requestedPayment
      ? `${publicReceiptUrl}?payment=${encodeURIComponent(requestedPayment.id)}`
      : publicReceiptUrl;
  const qrImageUrl = buildQrCodeImageUrl(exactPublicReceiptUrl, 200);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.12),_transparent_34%),linear-gradient(180deg,#f8fbf9_0%,#eef5f1_100%)] px-4 py-8 text-slate-950 print:bg-white print:p-0">
      <section className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm">
            <ShieldCheck className="h-4 w-4" />Verified digital receipt
          </div>
          <PublicReceiptActions />
        </div>

        <UnifiedReceipt
          id="public-receipt"
          shop={{ name: shopName, logoUrl, address: settings?.pos.address ?? shop?.address, phone: settings?.pos.phone ?? shop?.phone, vatNumber }}
          receiptType={receiptType}
          metadata={metadata}
          customer={customer}
          itemLabels={itemLabels}
          items={displayItems}
          totals={totals}
          note={note}
          statusBanner={statusBanner}
          footerText={[receiptSettings?.footerText, updatedAt ? `Last synced ${formatDateTime(updatedAt, "en")}` : null].filter(Boolean).join(" · ")}
          qr={qrImageUrl && exactPublicReceiptUrl ? { imageUrl: qrImageUrl, href: exactPublicReceiptUrl, code: receiptCode, title: qrTitle, description: qrDescription } : undefined}
          ownerBrand={brand ? { enabled: brand.receiptImprintEnabled, companyName: brand.companyName, logoUrl: brand.logoUrl, imprintText: brand.receiptImprintText, website: brand.website, address: brand.address, supportPhone: brand.supportPhone, supportEmail: brand.supportEmail } : undefined}
        />
      </section>
    </main>
  );
}
