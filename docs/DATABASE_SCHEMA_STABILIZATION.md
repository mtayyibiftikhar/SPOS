# Database Schema Stabilization

## Why This Exists

The POS is now good enough that the database must become boring, strict, and predictable.
Right now the project has two competing persistence models:

- Relational Supabase tables for owner control, licensing, uploads, and some POS domains.
- A whole-shop `shop_cloud_snapshots.state` JSON blob plus browser `localStorage` for most POS runtime data.

That hybrid helped us move fast, but it is the reason owner resets, receipt sequences, reports,
and multi-device behavior can feel inconsistent. For launch, relational Supabase tables must become
the source of truth. LocalStorage can remain only as a temporary cache/offline queue.

## Launch Database Decision

Use one Supabase project and one shared Postgres database.

Every tenant-owned table must include `shop_id` and be protected by Row Level Security. This is the
right model for the free tier because one database per shop would be harder to maintain, harder to
upgrade, and would waste free project limits.

## Canonical Ownership Rules

- Owner portal owns `shops`, `licenses`, `product_keys`, `device_activations`, owner billing,
  owner branding, owner users, and owner audit.
- Shop POS owns products, categories, customers, bills, bill items, payments, refunds, shifts,
  business days, expenses, cash movements, inventory, suppliers, purchase orders, reports, and
  shop settings.
- Owner can reset or delete shop data through server APIs only.
- POS must not recreate deleted cloud data from stale localStorage after an owner reset.
- Receipt numbers, account payment numbers, and purchase order numbers must be generated in the
  database or through server-side transactional APIs, not by browser-side counts.
- Reports must read from relational rows and ledger rows, not from reconstructed local-only arrays.

## Current Audit Findings

- The migration already defines most required POS tables, including bills, bill items, payments,
  refunds, customers, inventory, purchase orders, expenses, day closes, and ledger entries.
- Runtime Supabase usage currently touches only a limited table set directly:
  `shops`, `profiles`, `licenses`, `product_keys`, `device_activations`, `pos_settings`,
  `product_categories`, `audit_logs`, `accounting_ledger_entries`, and `shop_cloud_snapshots`.
- Product, customer, bill, refund, inventory, expense, purchase order, and report data is still
  mainly moved through the shop snapshot JSON.
- `localStorage` key `simple-pos-demo-state` is still a full application state cache. This must
  stop being allowed to overwrite cloud truth.
- `shop_cloud_snapshots` should remain temporarily as a migration bridge and backup export, not as
  the production data source.
- Digital receipt pages currently look up bills from the snapshot by `publicToken`; they should
  eventually read `bills` and `bill_items` by public token from relational tables.

## Canonical Table Groups

### Owner Control

- `shops`
- `licenses`
- `product_keys`
- `device_activations`
- `owner_users`
- `owner_billing_payments`
- `brand_profile`
- `audit_logs`

### Shop Settings

- `pos_settings`
- `dictionary_entries`
- `receipt_settings` can stay in `pos_settings.receipt_settings` JSON for now.
- `printer_settings` can stay in `pos_settings.printer_settings` JSON for now.
- `tax_settings` can stay in `pos_settings.tax_settings` JSON for now.

### Catalog

- `product_categories`
- `products`
- `deleted_products`
- `product_images` is optional later; for now keep image paths on category/product rows.

### Customers And Accounts

- `customers`
- `customer_account_payments`
- `customer_account_payment_allocations` should be added later to replace JSON allocations.

### Sales

- `business_days`
- `shifts`
- `bills`
- `bill_items`
- `payments`
- `receipt_sequences`
- `account_payment_sequences`

### Refunds

- `refunds`
- `refund_items`

### Cash And Expenses

- `cash_movements`
- `expense_categories`
- `expenses`
- `day_closes`

### Inventory And Purchase Orders

- `suppliers`
- `purchase_orders`
- `purchase_order_items`
- `inventory_adjustments`
- `inventory_batches`
- `supplier_payments` should be added if supplier credit becomes serious.

### Accounting

- `accounting_ledger_entries`
- Reports should be generated from bills, payments, refunds, expenses, inventory, and ledger entries.

### Storage

- Bucket: `pos-assets`
- Shop assets path: `shops/{shop_id}/...`
- Owner assets path: `owner/...`
- Product images: `shops/{shop_id}/products/{product_id}/...`
- Category images: `shops/{shop_id}/categories/{category_id}/...`
- Shop logos: `shops/{shop_id}/settings/logo/...`

## Required Schema Improvements

- Add `public_token text unique` to `bills` for digital receipt verification.
- Add `device_activation_id`, `device_browser_info`, `forced_closed_by`, `force_closed_at`,
  and `force_close_reason` to `shifts`.
- Add sequence tables or RPC functions for:
  - receipt numbers
  - account payment numbers
  - purchase order numbers
- Add `owner_users` so owner portal staff roles do not depend only on environment variables.
- Add `owner_billing_payments` for owner-side monthly, quarterly, yearly billing records.
- Add `customer_account_payment_allocations` when replacing JSON allocations.
- Add `supplier_payments` when supplier credit is handled beyond MVP.
- Remove or ignore `products.expiry_date` if product-level expiry is no longer part of the POS.
  If expiry returns later, use inventory batch expiry only.

## Sync Rules

- On POS open or browser refresh, load cloud truth first.
- LocalStorage may hydrate the UI only while cloud is loading.
- If cloud denies access, local data must not resurrect the store.
- If owner clears bills/products/all data, the cloud response must carry a reset marker.
- POS should store `lastSeenResetAt` per shop locally. If cloud reset marker is newer, local cached
  data for that scope must be dropped before any sync attempt.
- POS writes should go through domain APIs, not one giant state upload.
- Snapshot sync may remain during transition but should be read-only fallback once the domain APIs
  exist.

## Safe Cutover Plan

1. Freeze new database fields unless they are added through migrations and mapped in TypeScript.
2. Add missing sequence/reset metadata tables and shift/device columns.
3. Build a small repository layer under `src/lib/server/repositories`.
4. Move catalog writes first: categories, products, deleted products.
5. Move customer/account writes second.
6. Move sales writes third: bill creation, bill items, payments, receipt sequences, stock movement,
   ledger entries, and digital receipt token.
7. Move refunds, expenses, shifts, business days, and day closes.
8. Move inventory purchase orders and receiving.
9. Change reports to read relational rows only.
10. Demote `shop_cloud_snapshots` to backup/export only.
11. Remove full-state cloud writes from normal POS operation.

## Non-Negotiable Launch Rules

- Never expose the Supabase service role key to client components.
- Never store product keys or passwords in plain text online.
- Never let browser-side sequence counts create production receipt numbers.
- Never let owner reset/delete rely only on localStorage cleanup.
- Every tenant table must have `shop_id`, indexes, and RLS.
- Every destructive owner action must be server-side and audited.
- Image uploads must stay compressed and size-limited before hitting Supabase Storage.

## Immediate Next Implementation Pass

The next code pass should add the missing migration and repository layer, then move one domain at a
time from snapshot writes to relational writes. The safest first target is catalog because products
and categories are easier to verify than bills/accounting.

Recommended first implementation slice:

1. Add `receipt_sequences`, `account_payment_sequences`, `owner_users`, `owner_billing_payments`,
   reset markers, and missing `shifts` columns.
2. Add a `shop_data_resets` table so POS devices can see owner clear/delete actions reliably.
3. Add catalog repositories and APIs.
4. Make product/category pages save to relational tables.
5. Keep snapshot as fallback until sales and reports are migrated.
