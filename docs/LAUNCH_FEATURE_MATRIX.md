# Simple POS Launch Feature Matrix

Audit date: 2026-07-14

This is the canonical A-to-Z feature inventory for launch verification. A checked item means the
feature has passed the current automated or manual launch gate. It does not mean that a screen merely
exists.

Current automated evidence and launch blockers are recorded in `docs/LAUNCH_AUDIT_2026-07-14.md`.
The executable acceptance steps are in `docs/QA_TESTER_CHECKLIST.md`. Items remain unchecked until
their complete workflow, permission boundary, persisted result, and failure path have been verified.

## 1. Installation, Activation, And Authentication

- [ ] Owner creates a tenant shop with validated contact, billing, expiry, and device data.
- [ ] Product key is generated, copied, replaced, revoked, and deleted safely.
- [ ] Product key activation validates online and enforces the device limit.
- [ ] First installation creates the shop admin once and then returns to normal staff sign-in.
- [ ] Store login and staff login remain separate.
- [ ] Owner login uses a signed HttpOnly session.
- [ ] Password minimum, reset, deactivation, and forced logout rules work.
- [ ] Locked, expired, revoked, deleted, and trial-ended shops see the correct blocking screen.
- [ ] Owner support access is time-limited and audited without exposing passwords.

## 2. Tenant And Device Isolation

- [ ] Every tenant row is scoped by `shop_id`.
- [ ] RLS is enabled and policies prevent cross-shop reads and writes.
- [ ] Owner-only APIs reject unauthenticated and support-role writes where full owner access is required.
- [ ] Shop APIs reject a different shop, invalid user, invalid product key, and blocked license.
- [ ] Device removal, limit changes, and active-shift limits synchronize correctly.
- [ ] Deleting a shop removes database rows, snapshots, auth users, and storage assets.
- [ ] Clearing selected shop data cannot be undone by a stale browser snapshot.

## 3. Dashboard, Business Day, Shift, And Register

- [ ] One business day can be active per shop.
- [ ] Open shifts cannot exceed the licensed device limit.
- [ ] Day and shift start/end permissions are enforced in business logic.
- [ ] Forced shift closure requires an active shop-admin password and is audited.
- [ ] Auto rollover closes stale shifts/day and opens the next day consistently.
- [ ] Shift totals include only that shift; day totals include every shift for that business date.
- [ ] Expected cash follows opening cash + cash sales + cash in - cash out - cash refunds.
- [ ] Counted cash and variance are immutable in completed closing records.
- [ ] Expenses remain separate from drawer cash adjustments.

## 4. Catalog, Categories, Products, And Services

- [ ] Category names are unique per shop without case sensitivity.
- [ ] Products and services support English, Arabic, and Urdu names.
- [ ] Product/service type controls inventory fields correctly.
- [ ] Primary and secondary barcodes are unique per shop.
- [ ] Barcode generation remains unique under concurrent use.
- [ ] Sale price, cost price, tax flag, status, image, and quick-tab state save correctly.
- [ ] Product edit, soft delete, trash restore, and admin-only permanent delete work.
- [ ] Product/category image upload is validated, compressed, tenant-scoped, and removable.
- [ ] Product list, filters, pagination, quick-tab preview, and barcode label printing work.

## 5. Inventory, Suppliers, And Purchase Orders

- [ ] Services never appear in stock workflows.
- [ ] Add/remove/adjust/sale/refund/PO receipt movements are recorded with before/after quantities.
- [ ] Stock cannot be removed or sold below zero.
- [ ] Add-inventory draft hold/restore is local, limited, and does not alter stock early.
- [ ] Inventory filters, pagination, low-stock routing, and PDF export work.
- [ ] Suppliers save complete contact, VAT, payment, credit, and balance details.
- [ ] One purchase order belongs to one supplier.
- [ ] PO amount paid cannot exceed the PO total.
- [ ] Open, completed, cancelled, received, reordered, and printed PO flows work.
- [ ] Partial receiving updates only confirmed quantities and preserves the remaining order.
- [ ] Cost changes affect future margin without rewriting historical bill-item cost.

## 6. Billing Cart And Checkout

- [ ] Billing requires an open business day, current-device shift, attendance, and valid license.
- [ ] Search works by product name and every assigned barcode.
- [ ] Quick categories/products add the correct distinct product.
- [ ] Held bills are local, limited to two, restorable, and never become sales before checkout.
- [ ] Quantity, selling price, and per-item discounts are validated.
- [ ] Fixed discounts cannot exceed the eligible amount; percentage cannot exceed 100%; neither can be negative.
- [ ] Promotion and permanent discounts obey date, scope, product/service, and stacking rules.
- [ ] Inclusive/exclusive VAT and non-taxable items calculate correctly.
- [ ] Walk-in customers can use cash/card but not account/pay-later.
- [ ] Customer phone uniqueness and country-code normalization work.
- [ ] Bill creation is atomic for receipt number, stock, payment, ledger, and customer balance.
- [ ] Two devices cannot overwrite each other's sale, stock, receipt, or shift data.

## 7. Customers And Accounts

- [ ] Customer create/edit/remove/search and phone uniqueness work.
- [ ] Customer import accepts only the template schema, validates numbers, and reports duplicates.
- [ ] Customer export contains the correct tenant rows only.
- [ ] Account overview shows only customers with open account bills.
- [ ] Settlement can target selected receipts or oldest dues and cannot exceed the selected balance.
- [ ] Account payment creates a numbered receipt, allocations, payment/ledger entries, and history.
- [ ] Customer statement PDF reconciles sales, payments, refunds, and current due.
- [ ] Customer and settlement lists paginate and filter correctly.

## 8. Bills, Receipts, And Sharing

- [ ] Bill list search, period filters, pagination, refunded filter, and multi-select printing work.
- [ ] Receipt details match the immutable bill and bill-item snapshot.
- [ ] 58 mm, 80 mm, and A4 print layouts render correctly.
- [ ] Receipt logo, VAT number, cashier/customer visibility, footer, and secondary language settings apply everywhere.
- [ ] PDF, print, email, WhatsApp, and Web Share use the same receipt data.
- [ ] Email/WhatsApp messages include customer, shop, items, total, and public receipt URL.
- [ ] Public receipt token is unguessable and resolves the correct tenant bill.
- [ ] Long and multi-page receipts remain readable.

## 9. Refunds And Returns

- [ ] Only a shop admin with an open day and shift can refund.
- [ ] Original sale is never edited; refund uses today's business date and links the original bill/date.
- [ ] Full and partial quantities cannot exceed the remaining refundable quantity.
- [ ] Refund payout supports cash, card, and account adjustment with correct restrictions.
- [ ] Stock is returned only for physical product quantities.
- [ ] Refund amount, tax, cost, profit adjustment, payment, and ledger entries reconcile.
- [ ] History filters by date, receipt, customer, and product and supports PDF/print selection.

## 10. Expenses, Drawer Movements, And Accounting

- [ ] Expense categories, vendor, method, notes, and records save correctly.
- [ ] Cash expenses affect expected cash exactly once; card/bank expenses do not.
- [ ] Cash in/out is separate from revenue and expense and requires a reason.
- [ ] Double-entry ledger balances for sales, VAT, COGS, refunds, account receipts, expenses, and supplier payments.
- [ ] Ledger control totals remain zero for balanced periods.
- [ ] Closed-day records cannot drift when later transactions are posted.

## 11. Reports And PDF Exports

- [ ] Today, yesterday, week, month, year, and custom ranges use the shop timezone/business date.
- [ ] Sales, profit/loss, employee, inventory, supplier, expense/drawer, refund, tax, day, and shift reports reconcile.
- [ ] Gross/net sales, gross/net profit, VAT collected/paid/payable, and return adjustments are explained clearly.
- [ ] Reports include shop logo, identity, period, generated time, sections, totals, details, and pagination.
- [ ] PDF row limits do not silently omit data.
- [ ] Closed-day accounting reports distinguish provisional from final periods.

## 12. Settings, Roles, Backup, And Localization

- [ ] Shop, printer, receipt, day/shift, tax, discount, users, support, trash, and backup settings save with visible feedback.
- [ ] Role permissions are enforced in actions/APIs, not only by hidden buttons.
- [ ] Cashiers cannot import/export data, change settings, users, inventory, refunds, or permanent deletes without permission.
- [ ] Promotion start/end and item scopes apply correctly.
- [ ] Backup export/import is versioned, validated, tenant-scoped, and cannot overwrite owner-controlled license data.
- [ ] Product/customer import templates validate every row before mutation.
- [ ] English, Arabic, and Urdu translate visible text and switch direction correctly.

## 13. Time Clock, Attendance, And Payroll

- [ ] Staff clock-in requires a valid, expiring QR session, location, and optimized selfie.
- [ ] Attendance QR cannot be guessed, reused after expiry, or used for another employee/day/shop.
- [ ] One open attendance record per employee is enforced.
- [ ] Admin bypass/manual edit/clock-out actions are permission checked and audited.
- [ ] Forgotten clock-out applies configured default hours without changing recorded timestamps silently.
- [ ] Hourly rates use the rate effective on the attendance date.
- [ ] Attendance selfies are private storage objects with retention/deletion rules, not base64 snapshot data.
- [ ] Attendance and payroll reports reconcile hours, adjustments, and calculated pay.

## 14. Owner Portal

- [ ] Store overview filters active, total, expiring, locked, country, city, and creation date with pagination.
- [ ] Store create/edit/delete/clear/logout/password/device/license operations work and are audited.
- [ ] Activation-key selection is store-first and one current key per store is enforced.
- [ ] Packages, payments, pending/paid/cancelled states, expiry extension, balance, and revenue reports reconcile.
- [ ] Owner branding, login images, quotes, dashboard announcement, receipt imprint, and asset deletion work.
- [ ] Owner team roles limit customer-service access and preserve full-owner operations.
- [ ] Owner reports show stores, licenses, expiry, lock status, payments, and revenue rather than tenant POS sales.

## 15. Reliability, Performance, Native Apps, And Operations

- [ ] `npm install`, `npm run typecheck`, `npm run test:logic`, and `npm run build` pass.
- [ ] Dependency audit has no known production vulnerabilities.
- [ ] No secrets, service-role keys, full product keys, passwords, selfies, or tenant snapshots leak to client bundles/logs.
- [ ] Cloud writes are transactional or conflict-aware; offline writes queue without deleting newer cloud data.
- [ ] Full snapshots are compatibility backups only, not the transactional source of truth.
- [ ] Images are validated by content, optimized, size-limited, private, and deleted with the tenant.
- [ ] Desktop download, PDF, print, auto-print, and installed-printer behavior work.
- [ ] Android download/share/print uses native bridges or clear browser fallback.
- [ ] Error, loading, offline, locked, expired, and maintenance states never leave a frozen screen.
- [ ] Monitoring, backup restore drill, database capacity alerts, and rollback procedure are documented.
