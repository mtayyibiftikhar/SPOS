# Local POS Launch Audit

Date: 2026-07-07

## Verified

- `npm run build` passes with Next.js 16.2.10.
- `npm run typecheck` passes with zero TypeScript errors.
- `npm audit --omit=dev` reports zero vulnerabilities.
- Local dev server responds at `http://localhost:3000/login`.
- Install route exists at `/register` for first-run shop setup.
- Owner-controlled loading screen is wired through `src/app/loading.tsx` and the auth hydration guard.
- Owner portal can edit POS brand, company logo/details, receipt imprint, and loading screen text.
- Product key activation API uses Supabase admin client and stores/looks up hashed keys online.

## Local POS Ready Areas

- Billing, three-step checkout, customer selection, discounts, payment methods, receipts, PDF export, and browser handoff for WhatsApp/email.
- Dashboard cash controls for day, shift, cash in/out, and closing checks.
- Products, categories, product trash, multilingual names, quick billing, tax flags, barcode generation, and pagination.
- Customers, balances, account payments, settlement history, and statement PDF.
- Inventory, stock movement history, suppliers, purchase orders, receiving/payment workflow, expiry tracking, and movement audit.
- Refund module with new refund/history, linked original sale date, payout method, inventory return, and reporting support.
- Reports with date presets/custom range and PDF export.
- Settings hub with shop, receipt, printer, tax, users, support, trash, dictionary, backup/export/import.
- Owner portal with shops, product keys, license status, remote lock/unlock, notices, devices, support sessions, and audit logs.

## Must Fix Before Cloud Customer Launch

- Replace localStorage persistence with Supabase-backed queries and mutations.
- Replace local password hash login with Supabase Auth and server-side sessions.
- Wire `/register` to online product-key verification instead of local demo key generation.
- Store product keys only as hashes online; do not keep full keys in client state.
- Move receipt/account payment numbering to database-safe sequences or RPC functions.
- Run and test the Supabase migration against the real project, including RLS policies.
- Move logos from base64/local state to Supabase Storage URLs.
- Hide local quick-access/demo credentials in production builds.
- Add production environment variables and deployment domains.

## Known Non-Blockers For Local Demo

- Email and WhatsApp receipt sending is still browser handoff; automatic PDF attachment requires backend email service or WhatsApp Business API.
- Arabic and Urdu translations should get a human review before selling widely.
- Support impersonation logs session start/end; production should audit every sensitive action during support sessions.
- The workspace has an empty `.git` folder, so Git status is unavailable until the repository is reinitialized or connected.
