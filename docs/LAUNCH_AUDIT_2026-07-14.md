# Simple POS Launch Audit

Audit date: 2026-07-14

## Executive Verdict

The automated launch gates are green. Core money and register operations now use an authoritative,
revisioned, idempotent server mutation path, and generic cloud updates use compare-and-swap with a
three-way conflict merge instead of unconditional overwrites. The required security, attendance,
transaction, runtime-alignment, and rate-limit migrations are applied to the configured Supabase
project.

The system is suitable for a **supervised one-shop production pilot** after completing the manual
device checklist and confirming the production-only session secrets. It should not yet be opened to
unbounded store volume: the full tenant snapshot remains a compatibility source of truth and will
eventually need to be replaced by bounded relational reads/writes for scale.

## Audit Scope

The canonical feature inventory is `docs/LAUNCH_FEATURE_MATRIX.md`. The executable/manual acceptance
suite is `docs/QA_TESTER_CHECKLIST.md`. The audit covers the shop POS, owner portal, Supabase schema,
storage, authorization, tenancy, browser routes, APIs, reports/receipts, Windows wrapper, Android
wrapper, build pipeline, and failure behavior.

## Automated Evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| TypeScript | Pass | `npm run typecheck` |
| Business logic | Pass | 25/25 tests in `npm run test:logic` |
| Production build | Pass | `npm run build`; 48 routes compiled |
| Compiled API/page smoke | Pass | 37/37 checks in `npm run smoke:production` |
| Runtime dependencies | Pass | `npm audit --omit=dev`; 0 vulnerabilities |
| Cloud object inventory | Pass | 42/42 tables, required columns, and 3/3 buckets exist |
| Transaction concurrency | Pass | Direct rollback-safe probe covered commit, duplicate replay, stale conflict, and retry |
| Device activation concurrency | Pass | Atomic database probe covered activation, same-device replay, device-limit rejection, expiry, and lock |
| Authentication limiter | Pass | Direct rollback-safe probe covered allow, block, retry delay, and window reset |
| Windows package | Pass | `npm run desktop:build` produced the NSIS installer |
| Capacitor sync | Pass | `npm run mobile:sync` |
| Android APK build | Environment blocked | Java/JDK and `JAVA_HOME` are unavailable on this machine |
| Browser E2E | Not completed | Browser automation runtime failed to initialize; manual checklist remains mandatory |

The automated business tests cover discount bounds, inclusive/exclusive VAT, cash/card/account dues,
shift and day cash formulas, account settlement bounds, partial/full/prior-day refunds, balanced sale
ledger entries, case-insensitive category uniqueness, secondary barcode uniqueness, phone handling,
public receipt token entropy, scoped data reset behavior, unique authoritative numbering, oversell
prevention, business-day exclusivity, owner-controlled shift capacity, and shift/day closing rules.

## Defects Fixed During Audit

- Production now returns 404 for local file-state APIs and no longer exposes wildcard CORS there.
- Shop and staff access use signed HttpOnly device/user sessions; protected state writes require staff
  authorization and protected reads require a valid staff or activated-device session.
- Uploads now decode and validate JPG/PNG/WebP content, enforce pixel and byte limits, resize per scope,
  and store optimized WebP assets rather than trusting the browser MIME declaration.
- Attendance QR sessions now use cryptographically random server tokens, persist only the SHA-256 hash,
  expire after ten minutes, are single-use, and store optimized selfies in private tenant storage.
- Public receipt misses use a dedicated not-found view and are marked noindex.
- Bills-only owner reset no longer deletes attendance/payroll data; full reset does.
- Full owner reset removes attendance selfie objects from storage.
- Shop deletion now reports actual Auth user deletions and identifies failed Auth cleanup instead of
  falsely claiming every profile was removed.
- Production session secrets are now documented as separate required environment values.
- The applied RLS migration removes self-profile role/shop escalation and restricts tenant writes to shop
  admins for the affected generic policies.
- Cloud snapshot writes now use a PostgreSQL compare-and-swap transaction with monotonically increasing
  revisions and persisted operation IDs.
- Checkout, refund, customer settlement, day open/close, and shift open/close execute against the latest
  authoritative state and retry safely after concurrent changes.
- Uncertain network responses retain and reuse the same operation ID, preventing a cashier retry from
  duplicating a completed sale.
- Shift capacity is read directly from owner-controlled product-key device limits rather than trusting
  a potentially stale browser snapshot.
- Device activation locks the product key and license rows in one transaction, so simultaneous devices
  cannot exceed the owner limit and an expired or locked license cannot activate during a race.
- Public activation, installation, owner login, and shop login now use atomic Supabase-backed rate limits
  keyed by privacy-preserving hashes.
- Owner billing/runtime columns were aligned with the live `shops` schema and added to cloud probes.

## P0 Launch Blockers

No unresolved P0 defect was found by the automated launch gates. A production pilot remains conditional
on the manual hardware/browser checklist because camera, geolocation, installed printers, Android share,
Windows printing, and RTL output cannot be proven by TypeScript or server route tests.

## P1 Production Risks

- Public receipt lookup scans JSON snapshot contents rather than indexed relational
  `bills.public_token`; this will become slow as shops/receipts grow.
- The 7,000+ line app provider serializes local state and triggers full-snapshot sync. Bills, audit
  history, inventory movements, and reports make payload and browser storage grow without a bound.
- Generic inventory, purchase-order, expense, and settings changes use revisioned three-way merge rather
  than dedicated domain transactions. This prevents silent stale overwrites, but high-volume stores
  should move these flows to relational server mutations before broad rollout.
- Plain product-key material remains in local cache/snapshot compatibility state. Cloud verification
  uses hashes, but the shop cache should eventually retain only the current activation identifier.
- `OWNER_SESSION_SECRET` and `SHOP_SESSION_SECRET` must be set to independent random production values;
  falling back to the Supabase service-role key couples unrelated security boundaries.
- Owner deletion spans PostgreSQL, Storage, and Supabase Auth and cannot be one atomic transaction.
  Failed Auth cleanup is now visible, but an owner retry/cleanup job is still needed.
- localStorage contains a complete local business cache. This is useful offline but increases exposure
  on shared computers and is not a safe offline queue until mutations are idempotent and encrypted.
- Arabic and Urdu content, RTL print layout, long/multi-page PDFs, 58/80 mm hardware, A4 layout, and
  native printing/download behavior still require device-level manual acceptance testing.

## Database And Performance Review

- All 42 expected tables and all three expected storage buckets are available.
- Tenant tables consistently expose `shop_id`; RLS is enabled in migrations and common lookup columns
  have indexes, including bills, refunds, products, customers, inventory, device, attendance, owner
  payment, shop location/status, and snapshot update indexes.
- Relational financial/inventory tables already exist, which is the correct target architecture.
- Core financial/register writes are revisioned and idempotent. The compatibility JSONB snapshot is still
  the scale bottleneck even though stale overwrite protection is now in place.
- Public receipt, reporting, and owner summaries should query indexed relational tables with bounded
  pagination instead of loading/scanning complete shop histories.
- Large UI modules should be split by domain after transactional APIs exist. Splitting components alone
  will improve maintainability but will not solve write conflicts or bandwidth.

## Required Launch Sequence

1. Confirm independent random `OWNER_SESSION_SECRET` and `SHOP_SESSION_SECRET` values in production.
2. Complete every critical item in `docs/QA_TESTER_CHECKLIST.md` on desktop, tablet, and mobile.
3. Test real 58/80 mm and A4 printers, PDF/share flows, camera/geolocation, slow/offline reconnect, and
   two simultaneous tills.
4. Pilot one shop with monitoring and daily backups before opening additional tenants.
5. Measure snapshot size and sync latency during the pilot; schedule relational read/write migration
   before onboarding stores whose histories make snapshots materially large.
