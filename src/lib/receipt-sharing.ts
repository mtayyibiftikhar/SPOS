import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Locale } from "@/types/pos";

export type ReceiptShareItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type ReceiptRefundSummary = {
  isFullyRefunded: boolean;
  totalRefundAmount: number;
};

type ReceiptShareMessageInput = {
  channel: "email" | "whatsapp";
  customerName: string;
  storeName: string;
  receiptNumber: string;
  createdAt: string;
  currency: string;
  locale: Locale;
  items: ReceiptShareItem[];
  subtotal: number;
  discountAmount: number;
  taxLabel: string;
  taxAmount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  digitalReceiptUrl?: string;
  refund?: ReceiptRefundSummary;
};

function bold(value: string, channel: ReceiptShareMessageInput["channel"]) {
  return channel === "whatsapp" ? `*${value}*` : value;
}

export function buildPolishedReceiptMessage(input: ReceiptShareMessageInput) {
  const money = (amount: number) => formatCurrency(amount, input.currency, input.locale);
  const lines = [
    `🛍️ ${bold(`Thank you for shopping with us, ${input.customerName}!`, input.channel)}`,
    "",
    "We're delighted to have served you. Here's your purchase summary:",
    "",
    `🧾 ${bold("Receipt Details", input.channel)}`,
    `• ${bold("Store:", input.channel)} ${input.storeName}`,
    `• ${bold("Receipt #:", input.channel)} ${input.receiptNumber}`,
    `• ${bold("Date & Time:", input.channel)} ${formatDateTime(input.createdAt, input.locale)}`,
    "",
    `🛒 ${bold("Items Purchased", input.channel)}`
  ];

  input.items.forEach((item) => {
    lines.push(
      bold(item.name, input.channel),
      `• ${item.quantity} × ${money(item.unitPrice)} = ${bold(money(item.lineTotal), input.channel)}`
    );
  });

  lines.push(
    "",
    `💳 ${bold("Payment Summary", input.channel)}`,
    `• Subtotal: ${bold(money(input.subtotal), input.channel)}`,
    `• Discount: ${bold(money(input.discountAmount), input.channel)}`,
    `• ${input.taxLabel}: ${bold(money(input.taxAmount), input.channel)}`,
    `• ${bold("Total:", input.channel)} ${bold(money(input.total), input.channel)}`,
    `• ${bold("Paid:", input.channel)} ${bold(money(input.paidAmount), input.channel)}`,
    `• Due Amount: ${bold(money(input.dueAmount), input.channel)}${input.dueAmount <= 0 ? " ✅" : ""}`
  );

  if (input.refund && input.refund.totalRefundAmount > 0) {
    lines.push(
      "",
      `↩️ ${bold("Refund Status", input.channel)}`,
      `• Status: ${bold(input.refund.isFullyRefunded ? "Fully refunded" : "Partially refunded", input.channel)}`,
      `• Refunded amount: ${bold(money(input.refund.totalRefundAmount), input.channel)}`
    );
  }

  if (input.digitalReceiptUrl) {
    lines.push(
      "",
      `📄 ${bold("View or download your verified digital receipt:", input.channel)}`,
      input.digitalReceiptUrl
    );
  }

  lines.push(
    "",
    `🙏 ${bold(`Thank you for choosing ${input.storeName}. We look forward to serving you again!`, input.channel)}`
  );

  return lines.join("\n");
}
