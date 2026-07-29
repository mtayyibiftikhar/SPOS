import { RefundReceiptView } from "@/components/refunds/refund-receipt-view";

type RefundReceiptPageProps = {
  params: Promise<{ refundId: string }>;
};

export default async function RefundReceiptPage({ params }: RefundReceiptPageProps) {
  const { refundId } = await params;
  return <RefundReceiptView refundId={refundId} />;
}
