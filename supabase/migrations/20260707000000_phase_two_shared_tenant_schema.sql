-- Simple POS Phase 2 shared-tenant Supabase schema.
-- Launch model: one Supabase project/database, many shops isolated by shop_id + RLS.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('super_admin', 'shop_admin', 'cashier', 'support');
  end if;

  if not exists (select 1 from pg_type where typname = 'license_status') then
    create type public.license_status as enum ('trial', 'active', 'expired', 'locked');
  end if;

  if not exists (select 1 from pg_type where typname = 'product_key_status') then
    create type public.product_key_status as enum ('unused', 'active', 'expired', 'locked', 'revoked');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('cash', 'card', 'account');
  end if;
end $$;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  email text,
  website text,
  phone text default '',
  address text default '',
  currency text not null default 'SAR',
  timezone text not null default 'Asia/Riyadh',
  plan_name text not null default 'Starter',
  license_status public.license_status not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text,
  role public.user_role not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profile_shop_required_for_shop_roles check (
    (role = 'super_admin' and shop_id is null) or
    (role <> 'super_admin' and shop_id is not null)
  )
);

create table if not exists public.brand_profile (
  id boolean primary key default true,
  pos_name text not null default 'Simple POS',
  company_name text not null default 'Simple POS KSA',
  logo_url text,
  address text,
  website text,
  support_whatsapp text,
  support_email text,
  support_phone text,
  receipt_imprint_enabled boolean not null default true,
  receipt_imprint_text text not null default 'Powered by Simple POS KSA',
  loading_title text not null default 'Preparing your POS workspace',
  loading_message text not null default 'Syncing shop, license, and register data...',
  updated_at timestamptz not null default now(),
  constraint one_brand_profile check (id)
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  status public.license_status not null default 'trial',
  expires_at timestamptz,
  last_payment_at timestamptz,
  auto_lock_days_after_expiry integer not null default 7,
  locked_at timestamptz,
  lock_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id)
);

create table if not exists public.product_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  key_hash text not null unique,
  key_preview text not null,
  status public.product_key_status not null default 'unused',
  allowed_devices integer not null default 1,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  locked_at timestamptz
);

create table if not exists public.device_activations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_key_id uuid not null references public.product_keys(id) on delete cascade,
  device_fingerprint text not null,
  browser_info text,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (product_key_id, device_fingerprint)
);

create table if not exists public.pos_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  shop_name text not null,
  logo_url text,
  address text,
  phone text,
  email text,
  website text,
  currency text not null default 'SAR',
  vat_number text,
  receipt_qr_url text,
  printer_settings jsonb not null default '{"receiptSize":"80mm","autoPrintAfterSale":false}'::jsonb,
  receipt_settings jsonb not null default '{"footerText":"","showTax":true,"showCustomer":true,"showCashier":true,"receiptSize":"80mm"}'::jsonb,
  tax_settings jsonb not null default '{"enabled":true,"name":"VAT","rate":15,"mode":"inclusive","showOnReceipt":true}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  barcode text,
  kind text not null check (kind in ('product', 'service')),
  name jsonb not null default '{"en":"","ar":"","ur":""}'::jsonb,
  sale_price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  stock_quantity numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  expiry_date date,
  taxable boolean not null default true,
  quick_tab boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, barcode)
);

create table if not exists public.deleted_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_snapshot jsonb not null,
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz not null default now(),
  reason text not null
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, phone)
);

create table if not exists public.business_days (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  business_date date not null,
  opening_note text,
  started_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (shop_id, business_date)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  business_day_id uuid references public.business_days(id) on delete set null,
  business_date date not null,
  cashier_id uuid references public.profiles(id),
  opening_cash numeric(12,2) not null default 0,
  counted_cash numeric(12,2),
  expected_cash numeric(12,2),
  difference numeric(12,2),
  note text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  business_date date,
  shift_id uuid references public.shifts(id) on delete set null,
  number text not null,
  status text not null check (status in ('draft', 'paid', 'due', 'cancelled', 'refunded')),
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_whatsapp text,
  subtotal numeric(12,2) not null default 0,
  item_discount_amount numeric(12,2) not null default 0,
  discount_type text not null default 'fixed',
  discount_value numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_name text,
  tax_rate numeric(8,3) not null default 0,
  tax_mode text not null default 'inclusive',
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  due_amount numeric(12,2) not null default 0,
  payment_method public.payment_method not null,
  cashier_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (shop_id, number)
);

create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name jsonb not null,
  product_kind text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  cost_price numeric(12,2) not null default 0,
  discount_type text not null default 'fixed',
  discount_value numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  gross_line_total numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  method public.payment_method not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  original_bill_id uuid not null references public.bills(id),
  original_sale_date date not null,
  business_date date,
  shift_id uuid references public.shifts(id) on delete set null,
  payment_method public.payment_method not null,
  created_by uuid references public.profiles(id),
  return_date timestamptz not null default now(),
  reason text not null,
  amount numeric(12,2) not null,
  profit_adjustment numeric(12,2) not null
);

create table if not exists public.refund_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  refund_id uuid not null references public.refunds(id) on delete cascade,
  bill_item_id uuid references public.bill_items(id),
  product_id uuid references public.products(id),
  product_name jsonb not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  cost_price numeric(12,2) not null,
  refund_amount numeric(12,2) not null,
  profit_adjustment numeric(12,2) not null
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  vat_number text,
  contact_person text,
  address text,
  default_payment_method text default 'credit',
  account_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.products(id),
  type text not null check (type in ('add', 'remove', 'sale', 'refund')),
  quantity numeric(12,2) not null,
  before_quantity numeric(12,2) not null,
  after_quantity numeric(12,2) not null,
  reason text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  expiry_date date,
  reference_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.products(id),
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_order_id uuid,
  reference_id uuid,
  batch_number text,
  quantity numeric(12,2) not null,
  remaining_quantity numeric(12,2) not null,
  cost_price numeric(12,2) not null,
  expiry_date date,
  received_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  number text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text not null,
  status text not null default 'ordered',
  total_amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  payment_status text not null default 'unpaid',
  payment_method text default 'credit',
  last_payment_at timestamptz,
  note text,
  expected_at date,
  received_at timestamptz,
  received_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (shop_id, number)
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name jsonb not null,
  quantity numeric(12,2) not null,
  received_quantity numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null,
  initial_cost_price numeric(12,2),
  expiry_date date
);

create table if not exists public.customer_account_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  number text not null,
  business_date date,
  shift_id uuid references public.shifts(id) on delete set null,
  amount numeric(12,2) not null,
  method public.payment_method not null check (method in ('cash', 'card')),
  allocations jsonb not null default '[]'::jsonb,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (shop_id, number)
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  business_date date not null,
  shift_id uuid references public.shifts(id) on delete set null,
  created_by uuid references public.profiles(id),
  type text not null check (type in ('cash_in', 'cash_out')),
  amount numeric(12,2) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  business_date date not null,
  shift_id uuid references public.shifts(id) on delete set null,
  category_id uuid references public.expense_categories(id),
  category_name text not null,
  amount numeric(12,2) not null,
  payment_method text not null,
  vendor_name text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.day_closes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  business_date date not null,
  total_sales numeric(12,2) not null default 0,
  cash_sales numeric(12,2) not null default 0,
  card_sales numeric(12,2) not null default 0,
  account_sales numeric(12,2) not null default 0,
  refunds numeric(12,2) not null default 0,
  expenses numeric(12,2) not null default 0,
  net_sales numeric(12,2) not null default 0,
  expected_cash numeric(12,2) not null default 0,
  counted_cash numeric(12,2) not null default 0,
  cash_difference numeric(12,2) not null default 0,
  note text,
  closed_at timestamptz not null default now(),
  unique (shop_id, business_date)
);

create table if not exists public.accounting_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  business_date date not null,
  shift_id uuid references public.shifts(id) on delete set null,
  account_code text not null,
  account_name text not null,
  debit numeric(12,2) not null default 0,
  credit numeric(12,2) not null default 0,
  memo text not null,
  reference_type text not null,
  reference_id uuid not null,
  bill_id uuid,
  customer_id uuid,
  refund_id uuid,
  payment_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  key text not null,
  locale text not null check (locale in ('en', 'ar', 'ur')),
  value text not null,
  updated_at timestamptz not null default now(),
  unique (shop_id, key, locale)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  target_shop_id uuid references public.shops(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  subject text not null,
  message text not null,
  preferred_channel text not null check (preferred_channel in ('whatsapp', 'email', 'call')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  started_by uuid references public.profiles(id),
  reason text not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  target_id uuid,
  detail text,
  created_at timestamptz not null default now()
);

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid() limit 1
$$;

create or replace function public.current_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select shop_id from public.profiles where id = auth.uid() limit 1
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and is_active = true
  )
$$;

create or replace function public.is_shop_member(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and shop_id = target_shop_id
      and is_active = true
  )
$$;

alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.brand_profile enable row level security;
alter table public.licenses enable row level security;
alter table public.product_keys enable row level security;
alter table public.device_activations enable row level security;
alter table public.pos_settings enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.deleted_products enable row level security;
alter table public.customers enable row level security;
alter table public.business_days enable row level security;
alter table public.shifts enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.refund_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.customer_account_payments enable row level security;
alter table public.cash_movements enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.day_closes enable row level security;
alter table public.accounting_ledger_entries enable row level security;
alter table public.dictionary_entries enable row level security;
alter table public.announcements enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_sessions enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "owners manage shops" on public.shops;
create policy "owners manage shops" on public.shops for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "shop members read own shop" on public.shops;
create policy "shop members read own shop" on public.shops for select using (public.is_shop_member(id));

drop policy if exists "profiles visible by owner or same shop" on public.profiles;
create policy "profiles visible by owner or same shop" on public.profiles for select using (
  public.is_owner() or id = auth.uid() or shop_id = public.current_shop_id()
);

drop policy if exists "owners manage profiles" on public.profiles;
create policy "owners manage profiles" on public.profiles for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "brand visible to signed in users" on public.brand_profile;
create policy "brand visible to signed in users" on public.brand_profile for select using (auth.uid() is not null);

drop policy if exists "owners manage brand" on public.brand_profile;
create policy "owners manage brand" on public.brand_profile for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "announcements visible by target" on public.announcements;
create policy "announcements visible by target" on public.announcements for select using (
  public.is_owner() or target_shop_id is null or target_shop_id = public.current_shop_id()
);

drop policy if exists "owners manage announcements" on public.announcements;
create policy "owners manage announcements" on public.announcements for all using (public.is_owner()) with check (public.is_owner());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'licenses',
    'product_keys',
    'device_activations',
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
    execute format('drop policy if exists "%s tenant read" on public.%I', table_name, table_name);
    execute format('create policy "%s tenant read" on public.%I for select using (public.is_shop_member(shop_id))', table_name, table_name);

    execute format('drop policy if exists "%s tenant write" on public.%I', table_name, table_name);
    execute format('create policy "%s tenant write" on public.%I for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id))', table_name, table_name);
  end loop;
end $$;

drop policy if exists "dictionary visible by tenant or global" on public.dictionary_entries;
create policy "dictionary visible by tenant or global" on public.dictionary_entries for select using (
  public.is_owner() or shop_id is null or shop_id = public.current_shop_id()
);

drop policy if exists "dictionary tenant write" on public.dictionary_entries;
create policy "dictionary tenant write" on public.dictionary_entries for all using (
  public.is_owner() or shop_id = public.current_shop_id()
) with check (
  public.is_owner() or shop_id = public.current_shop_id()
);

create index if not exists idx_profiles_shop on public.profiles(shop_id);
create index if not exists idx_product_keys_shop on public.product_keys(shop_id);
create index if not exists idx_device_activations_shop on public.device_activations(shop_id);
create index if not exists idx_products_shop on public.products(shop_id);
create unique index if not exists idx_product_categories_shop_name_lower on public.product_categories(shop_id, lower(name));
create index if not exists idx_bills_shop_date on public.bills(shop_id, created_at desc);
create index if not exists idx_bill_items_bill on public.bill_items(bill_id);
create index if not exists idx_customers_shop on public.customers(shop_id);
create index if not exists idx_refunds_shop_date on public.refunds(shop_id, return_date desc);
create index if not exists idx_inventory_adjustments_shop_date on public.inventory_adjustments(shop_id, created_at desc);
create unique index if not exists idx_suppliers_shop_name_lower on public.suppliers(shop_id, lower(name));
create unique index if not exists idx_expense_categories_shop_name_lower on public.expense_categories(shop_id, lower(name));
create index if not exists idx_audit_logs_shop_date on public.audit_logs(shop_id, created_at desc);
