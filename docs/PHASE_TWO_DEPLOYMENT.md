# Phase 2 Deployment Readiness

## Database Decision

Use one shared Supabase database for launch.

Each client shop is isolated by `shop_id` and Supabase Row Level Security. This keeps the product compatible with free-tier limits and avoids managing one project/database per customer.

## What Is Ready

- Owner-side entities are modeled: shops, owner brand, licenses, product keys, device activations, announcements, support tickets, support sessions, and audit logs.
- Shop-side POS entities are modeled: products, categories, customers, bills, refunds, inventory, suppliers, purchase orders, cash control, expenses, day closes, dictionary entries, and accounting ledger entries.
- RLS helper functions are included in the migration:
  - `public.is_owner()`
  - `public.current_shop_id()`
  - `public.is_shop_member(shop_id)`
- Tenant policies use one shared DB with `shop_id` checks.
- Product key values should be stored as hashes in production. The migration stores `key_hash` and `key_preview`, not plain product keys.
- Supabase client helpers exist in `src/lib/supabase`.
- Server-side product key activation starts at `src/app/api/activation/route.ts`.

## Launch Steps

1. Create one Supabase project.
2. Run `supabase/migrations/20260707000000_phase_two_shared_tenant_schema.sql`.
3. Add `.env.local` from `.env.example`.
4. Seed the first owner user in Supabase Auth.
5. Insert the matching owner profile row with role `super_admin`.
6. Connect login/shop data reads to Supabase Auth and the RLS-protected tables.
7. Move local app provider mutations to Supabase-backed API routes or server actions.
8. Keep product key activation server-side so the service role key is never exposed to the browser.
9. Deploy the Next.js app.

## Critical Production Rules

- Do not store product keys in plain text online.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to client components.
- Receipt numbers must become database-generated per shop before multi-device production.
- Owner support impersonation must always require a reason and write audit logs.
- Remote lock must be checked server-side before billing, inventory, product edits, refunds, and purchase orders.

## Recommended Domains

- Shop POS: `pos.yourcompany.sa`
- Owner portal: `owner.yourcompany.sa` or `/owner` behind owner-only auth

## Remaining Phase 2 Work

- Replace localStorage provider persistence with Supabase queries/mutations.
- Add DB-side receipt/account/payment sequence generation.
- Run visual QA on receipt PDFs after cloud logo URLs replace base64 demo images.
