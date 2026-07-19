import { AccountPaymentReceiptView } from "@/components/billing/account-payment-receipt-view";

export default async function AccountPaymentReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <AccountPaymentReceiptView paymentId={paymentId} />;
}
