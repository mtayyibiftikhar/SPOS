import { stableUuid } from "@/lib/cloud-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DemoAppState } from "@/types/pos";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function entityId(kind: string, id: string) {
  return stableUuid(`${kind}:${id}`);
}

async function upsertRows(client: AdminClient, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function syncNormalizedShopProjection(
  client: AdminClient,
  shopId: string,
  state: Partial<DemoAppState>
) {
  const now = new Date().toISOString();
  const categories = (state.categories ?? []).filter((entry) => entry.shopId === shopId);
  const products = (state.products ?? []).filter((entry) => entry.shopId === shopId);
  const customers = (state.customers ?? []).filter((entry) => entry.shopId === shopId);
  const businessDays = (state.businessDays ?? []).filter((entry) => entry.shopId === shopId);
  const shifts = (state.shifts ?? []).filter((entry) => entry.shopId === shopId);
  const bills = (state.bills ?? []).filter((entry) => entry.shopId === shopId);
  const billIds = new Set(bills.map((entry) => entry.id));
  const billItems = (state.billItems ?? []).filter((entry) => billIds.has(entry.billId));
  const payments = (state.payments ?? []).filter((entry) => billIds.has(entry.billId));
  const refunds = (state.refunds ?? []).filter((entry) => entry.shopId === shopId);
  const refundIds = new Set(refunds.map((entry) => entry.id));
  const refundItems = (state.refundItems ?? []).filter((entry) => refundIds.has(entry.refundId));
  const profileIds = new Set((state.users ?? []).filter((entry) => entry.shopId === shopId).map((entry) => entry.id));
  const { data: existingCategories, error: categoryLookupError } = await client
    .from("product_categories")
    .select("id, name")
    .eq("shop_id", shopId);

  if (categoryLookupError) throw new Error(`product_categories: ${categoryLookupError.message}`);

  const existingCategoryIdsByName = new Map(
    (existingCategories ?? []).map((entry) => [String(entry.name).trim().toLowerCase(), String(entry.id)])
  );
  const categoryIds = new Map(
    categories.map((entry) => [
      entry.id,
      existingCategoryIdsByName.get(entry.name.trim().toLowerCase()) ?? entityId("category", entry.id)
    ])
  );

  await upsertRows(client, "product_categories", categories.map((entry) => ({
    id: categoryIds.get(entry.id)!,
    shop_id: shopId,
    name: entry.name,
    description: entry.description ?? null,
    created_at: entry.createdAt ?? now
  })));

  await upsertRows(client, "products", products.map((entry) => ({
    id: entityId("product", entry.id),
    shop_id: shopId,
    category_id: entry.categoryId ? categoryIds.get(entry.categoryId) ?? entityId("category", entry.categoryId) : null,
    barcode: entry.barcode?.trim() || null,
    kind: entry.kind,
    name: entry.name,
    sale_price: entry.salePrice,
    cost_price: entry.costPrice,
    stock_quantity: entry.stockQuantity,
    reorder_level: entry.reorderLevel,
    expiry_date: entry.expiryDate ?? null,
    taxable: entry.taxable,
    quick_tab: entry.quickTab,
    status: entry.status,
    created_at: entry.createdAt ?? now,
    updated_at: entry.updatedAt ?? now
  })));

  const barcodeRows = products.flatMap((product) => {
    const barcodes = Array.from(new Set([product.barcode, ...(product.barcodes ?? [])].map((value) => value?.trim()).filter(Boolean) as string[]));
    return barcodes.map((barcode) => ({
      id: entityId("product-barcode", `${product.id}:${barcode}`),
      shop_id: shopId,
      product_id: entityId("product", product.id),
      barcode,
      is_primary: barcode === product.barcode,
      created_at: product.createdAt ?? now
    }));
  });
  await upsertRows(client, "product_barcodes", barcodeRows);

  await upsertRows(client, "customers", customers.map((entry) => ({
    id: entityId("customer", entry.id),
    shop_id: shopId,
    name: entry.name,
    phone: entry.phone?.trim() || null,
    email: entry.email?.trim() || null,
    whatsapp: entry.whatsapp?.trim() || null,
    created_at: entry.createdAt ?? now,
    updated_at: now
  })));

  await upsertRows(client, "business_days", businessDays.map((entry) => ({
    id: entityId("business-day", entry.id),
    shop_id: shopId,
    business_date: entry.businessDate,
    opening_note: entry.openingNote ?? null,
    started_by: profileIds.has(entry.startedBy) ? entry.startedBy : null,
    started_at: entry.startedAt,
    ended_at: entry.endedAt ?? null
  })));

  await upsertRows(client, "shifts", shifts.map((entry) => ({
    id: entityId("shift", entry.id),
    shop_id: shopId,
    business_day_id: entry.businessDayId ? entityId("business-day", entry.businessDayId) : null,
    business_date: entry.businessDate,
    cashier_id: profileIds.has(entry.cashierId) ? entry.cashierId : null,
    opening_cash: entry.openingCash,
    counted_cash: entry.countedCash ?? null,
    expected_cash: entry.expectedCash ?? null,
    difference: entry.difference ?? null,
    note: entry.note ?? null,
    started_at: entry.startedAt,
    ended_at: entry.endedAt ?? null
  })));

  await upsertRows(client, "bills", bills.map((entry) => ({
    id: entityId("bill", entry.id),
    shop_id: shopId,
    customer_id: entry.customerId ? entityId("customer", entry.customerId) : null,
    business_date: entry.businessDate ?? entry.createdAt.slice(0, 10),
    shift_id: entry.shiftId ? entityId("shift", entry.shiftId) : null,
    number: entry.number,
    status: entry.status,
    customer_name: entry.customerName ?? null,
    customer_phone: entry.customerPhone ?? null,
    customer_email: entry.customerEmail ?? null,
    customer_whatsapp: entry.customerWhatsapp ?? null,
    subtotal: entry.subtotal,
    item_discount_amount: entry.itemDiscountAmount ?? 0,
    discount_type: entry.discountType,
    discount_value: entry.discountValue,
    discount_amount: entry.discountAmount,
    tax_name: entry.taxName ?? null,
    tax_rate: entry.taxRate,
    tax_mode: entry.taxMode,
    tax_amount: entry.taxAmount,
    total: entry.total,
    paid_amount: entry.paidAmount,
    due_amount: entry.dueAmount,
    payment_method: entry.paymentMethod,
    cashier_id: profileIds.has(entry.cashierId) ? entry.cashierId : null,
    created_at: entry.createdAt
  })));

  await upsertRows(client, "bill_items", billItems.map((entry) => ({
    id: entityId("bill-item", entry.id),
    shop_id: shopId,
    bill_id: entityId("bill", entry.billId),
    product_id: entry.productId ? entityId("product", entry.productId) : null,
    product_name: entry.productName,
    product_kind: entry.productKind,
    quantity: entry.quantity,
    unit_price: entry.unitPrice,
    cost_price: entry.costPrice,
    discount_type: entry.discountType,
    discount_value: entry.discountValue,
    discount_amount: entry.discountAmount,
    gross_line_total: entry.grossLineTotal,
    line_total: entry.lineTotal
  })));

  await upsertRows(client, "payments", payments.map((entry) => ({
    id: entityId("payment", entry.id),
    shop_id: shopId,
    bill_id: entityId("bill", entry.billId),
    method: entry.method,
    amount: entry.amount,
    created_at: entry.createdAt
  })));

  await upsertRows(client, "refunds", refunds.map((entry) => ({
    id: entityId("refund", entry.id),
    shop_id: shopId,
    original_bill_id: entityId("bill", entry.originalBillId),
    original_sale_date: entry.originalSaleDate,
    business_date: entry.businessDate ?? entry.returnDate.slice(0, 10),
    shift_id: entry.shiftId ? entityId("shift", entry.shiftId) : null,
    payment_method: entry.paymentMethod,
    created_by: profileIds.has(entry.createdBy) ? entry.createdBy : null,
    return_date: entry.returnDate,
    reason: entry.reason,
    amount: entry.amount,
    profit_adjustment: entry.profitAdjustment
  })));

  await upsertRows(client, "refund_items", refundItems.map((entry) => ({
    id: entityId("refund-item", entry.id),
    shop_id: shopId,
    refund_id: entityId("refund", entry.refundId),
    bill_item_id: entityId("bill-item", entry.billItemId),
    product_id: entry.productId ? entityId("product", entry.productId) : null,
    product_name: entry.productName,
    quantity: entry.quantity,
    unit_price: entry.unitPrice,
    cost_price: entry.costPrice,
    refund_amount: entry.refundAmount,
    profit_adjustment: entry.profitAdjustment
  })));

  return {
    bills: bills.length,
    customers: customers.length,
    products: products.length,
    refunds: refunds.length
  };
}
