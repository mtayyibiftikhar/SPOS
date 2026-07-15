-- Prevent direct client sessions from changing identity/roles or writing admin-owned shop data.
-- POS mutations continue through authenticated server routes; RLS remains the database backstop.

drop policy if exists "users update own profile" on public.profiles;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'licenses',
    'product_keys',
    'device_activations',
    'shop_cloud_snapshots',
    'pos_settings',
    'product_categories',
    'products',
    'deleted_products',
    'customers',
    'business_days',
    'shifts',
    'bills',
    'bill_items',
    'payments',
    'refunds',
    'refund_items',
    'suppliers',
    'inventory_adjustments',
    'inventory_batches',
    'purchase_orders',
    'purchase_order_items',
    'customer_account_payments',
    'cash_movements',
    'expense_categories',
    'expenses',
    'day_closes',
    'accounting_ledger_entries',
    'support_tickets',
    'support_sessions',
    'audit_logs'
  ] loop
    execute format('drop policy if exists "%s tenant write" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s tenant write" on public.%I for all using (public.is_shop_admin(shop_id)) with check (public.is_shop_admin(shop_id))',
      table_name,
      table_name
    );
  end loop;
end $$;

drop policy if exists "owner or tenant product barcodes" on public.product_barcodes;
create policy "owner or shop admin product barcodes" on public.product_barcodes for all
  using (public.is_shop_admin(shop_id))
  with check (public.is_shop_admin(shop_id));

drop policy if exists "dictionary tenant write" on public.dictionary_entries;
create policy "dictionary admin write" on public.dictionary_entries for all
  using (public.is_owner() or public.is_shop_admin(shop_id))
  with check (public.is_owner() or public.is_shop_admin(shop_id));
