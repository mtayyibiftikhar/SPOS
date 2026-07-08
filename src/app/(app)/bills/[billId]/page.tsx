import { ReceiptView } from "@/components/billing/receipt-view";

type BillReceiptPageProps = {
  params: Promise<{
    billId: string;
  }>;
};

export default async function BillReceiptPage({ params }: BillReceiptPageProps) {
  const { billId } = await params;

  return <ReceiptView billId={billId} />;
}
