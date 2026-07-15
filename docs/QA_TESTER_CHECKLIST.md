# Simple POS A-to-Z Tester Checklist

Release candidate: __________  Tester: __________  Date: __________  Device/browser: __________

Record each result as **Pass**, **Fail**, **Blocked**, or **Not applicable**. Attach a screenshot,
receipt/report PDF, API response, or database row for every failure. Critical failures stop launch.

## Test Data And Devices

- Use one owner account, one active shop, one admin, one manager, two cashiers, one inactive user, two
  licensed devices, one unlicensed third device, five categories, ten products, two services, three
  suppliers, three customers, and one walk-in sale.
- Include taxable/non-taxable, inclusive/exclusive VAT, zero/low stock, multiple barcodes, Arabic/Urdu
  names, account customers, and products from different suppliers.
- Run critical tests on Chrome desktop, tablet viewport, mobile browser, Windows app, and Android app.

## A. Owner Authentication And Portal

- [ ] **A01 Critical:** Invalid owner credentials are rejected without revealing which field is wrong.
- [ ] **A02 Critical:** Valid owner sign-in sets an HttpOnly session; direct owner APIs reject no session.
- [ ] **A03:** Owner sign-out invalidates access and Back cannot reopen protected owner data.
- [ ] **A04:** Support/customer-service users see only assigned owner capabilities.
- [ ] **A05 Critical:** Support role cannot delete shops, clear all data, or perform owner-only mutations.
- [ ] **A06:** Owner navigation, filters, pagination, mobile layout, and branding render correctly.

## B. Shop Creation, License, And Activation Key

- [ ] **B01 Critical:** Required shop fields, email, phone/country code, password length, amount, and
  device limit are validated server-side.
- [ ] **B02:** Monthly/quarterly/yearly cycle calculates expiry from the current date correctly.
- [ ] **B03:** Trial selection produces the intended trial expiry and trial status.
- [ ] **B04 Critical:** Generated activation key is long, random, copyable, and only one current key is
  active for the shop.
- [ ] **B05:** Replacing a key revokes the old key and the new key activates correctly.
- [ ] **B06:** Key copy/email handoff contains the correct shop and no owner secret.
- [ ] **B07 Critical:** Invalid, revoked, expired, locked, deleted-shop, and over-device-limit keys fail.
- [ ] **B08 Critical:** Successful activation auto-populates only safe shop data and never a password.
- [ ] **B09:** First installation creates one admin and subsequent launches show staff sign-in only.
- [ ] **B10 Critical:** Store setup cannot be repeated to create a second unauthorized admin.

## C. Shop Login, Staff Login, And Forced State Changes

- [ ] **C01 Critical:** Store login and staff login are separate and use the intended identities.
- [ ] **C02:** Staff picker shows registered user names, not only the setup email.
- [ ] **C03:** Passwords shorter than eight characters are rejected for create/reset/change.
- [ ] **C04 Critical:** Inactive user cannot sign in; reactivation restores access.
- [ ] **C05 Critical:** Owner password reset works immediately and old password stops working.
- [ ] **C06:** Shop admin can reset authorized local staff passwords without seeing the old password.
- [ ] **C07 Critical:** Owner lock/expiry/trial end shows the correct blocking screen and support details.
- [ ] **C08:** Owner unlock/payment renewal restores access after refresh without reinstalling.
- [ ] **C09 Critical:** Store-password change forces store-level logout; normal profile changes force staff
  login refresh without returning to activation.
- [ ] **C10:** Owner logout-all-devices invalidates every shop session.

## D. Tenant Isolation, Device Limit, And Deletion

- [ ] **D01 Critical:** Shop A cannot read or mutate Shop B data through UI or direct API calls.
- [ ] **D02:** Activated devices show browser/device info and last activity accurately.
- [ ] **D03:** Owner device removal prevents that device from reopening a shift after refresh.
- [ ] **D04:** Increasing/decreasing allowed devices updates the shop after refresh.
- [ ] **D05 Critical:** Open shifts never exceed the device limit.
- [ ] **D06:** A third device sees active shifts and can force-close only with an active admin password.
- [ ] **D07 Critical:** Owner bills-only/products-only/full clear removes exactly the selected scope and a
  stale browser cannot upload deleted data again.
- [ ] **D08 Critical:** Shop deletion removes tenant rows, snapshots, storage assets, Auth users, key, and
  active sessions; deleted POS is blocked on next validation.

## E. Day, Shift, Register, Expenses, And Drawer

- [ ] **E01 Critical:** Only one business day is open per shop; multiple devices share that day.
- [ ] **E02:** Business date uses the shop timezone and cannot accidentally jump at browser UTC midnight.
- [ ] **E03:** Shift opens for the current user/device with opening cash and timestamp.
- [ ] **E04 Critical:** Billing is blocked without open day, current-device shift, attendance, and license.
- [ ] **E05:** Day totals contain all day shifts; shift totals contain only the selected shift.
- [ ] **E06:** Expected cash equals opening cash + cash sales + cash in - cash out - cash refunds.
- [ ] **E07:** Card/account sales and non-cash expenses do not alter expected drawer cash.
- [ ] **E08:** Counted cash, shortage/overage, and notes save on close and cannot be rewritten silently.
- [ ] **E09 Critical:** Day cannot close while any shift is open.
- [ ] **E10:** Auto-rollover closes stale shifts/day with documented values and opens the next day/shift.
- [ ] **E11:** Cash in/out requires positive amount and reason; log/report is paginated.
- [ ] **E12:** Expense category, vendor, method, amount, note, filters, pagination, and report are correct.

## F. Attendance, Timecard, And Payroll

- [ ] **F01 Critical:** Login prompts required staff to clock in once per day; admin bypass is audited.
- [ ] **F02 Critical:** QR token is single-use, expires after ten minutes, and cannot be reused/copied.
- [ ] **F03:** Clock-in requests camera and exact geolocation with clear permission errors.
- [ ] **F04 Critical:** Selfie is compressed, stored privately under the correct shop, and accessed by a
  short-lived signed URL only.
- [ ] **F05:** Clock-out records location/selfie/time and prevents a second clock-out.
- [ ] **F06:** Missing clock-out applies configured default hours at day end.
- [ ] **F07:** Admin manual correction records original/new values, reason, actor, and timestamp.
- [ ] **F08:** Hourly rate, scheduled hours, paid hours, salary total, employee/date filters, and PDF agree.
- [ ] **F09 Critical:** Cashier cannot view other employee selfies/payroll or edit attendance.
- [ ] **F10:** Full shop reset removes attendance rows and selfie storage; bills-only reset preserves them.

## G. Categories, Products, Services, And Barcodes

- [ ] **G01:** Category list/create/edit flows are separate, paginated, and searchable.
- [ ] **G02 Critical:** `Milk`, `MILK`, and `milk` are treated as the same category per shop.
- [ ] **G03:** Category deletion is blocked or safely handled when products reference it.
- [ ] **G04:** Product/service names save and display correctly in English, Arabic, and Urdu.
- [ ] **G05:** Service type disables stock/reorder fields and never enters stock reports.
- [ ] **G06 Critical:** Primary/secondary barcodes are unique per shop and duplicate scans show an error.
- [ ] **G07:** Multiple barcodes add/search/delete correctly; the last barcode cannot be removed accidentally.
- [ ] **G08:** Sale/cost price, VAT flag, status, image, and quick-tab checkbox persist after reload/device change.
- [ ] **G09:** Product/category images reject invalid files and are compressed without visible distortion.
- [ ] **G10:** Product edit, soft delete, trash metadata, restore, and admin-only permanent delete work.
- [ ] **G11:** Product list filters/pagination and quick-tab assignment/removal work.
- [ ] **G12:** Barcode sheets fit selected sticker dimensions, A4 rows/columns, and selected/all barcode rules.

## H. Inventory, Suppliers, Purchase Orders, And Receiving

- [ ] **H01:** Inventory overview excludes services and shows accurate units, cost value, low stock, filters,
  pagination, and PDF.
- [ ] **H02:** Search/scan add-inventory rings distinct products and rejects service barcodes.
- [ ] **H03:** Held inventory drafts are local, limited to two, restorable, and do not change stock early.
- [ ] **H04:** One supplier can be assigned per receiving batch and changes are explicit.
- [ ] **H05 Critical:** Add/remove/adjust/sale/refund/receive records before, change, after, actor, and time.
- [ ] **H06 Critical:** Stock cannot fall below zero through sale, removal, refund repetition, or concurrency.
- [ ] **H07:** Adjust by item/supplier/category changes the intended rows only.
- [ ] **H08:** Supplier create/edit stores contact, VAT, payment terms, purchases, paid/due totals.
- [ ] **H09:** Low-stock routing groups or filters products sensibly for one-supplier POs.
- [ ] **H10 Critical:** A PO belongs to one supplier; amount paid cannot exceed PO total.
- [ ] **H11:** PO draft, open, print, partial receive, complete, cancel, history, and reorder statuses work.
- [ ] **H12:** Partial receipt adds confirmed units only and retains remaining quantities.
- [ ] **H13:** New purchase cost affects future margin without changing historical bill-item cost.

## I. Billing Cart, Held Bills, Customer, And Checkout

- [ ] **I01 Critical:** Product search works by every name language and all assigned barcodes.
- [ ] **I02 Critical:** Quick category/product cards add the correct distinct item, not a previous item.
- [ ] **I03:** Quantity controls, editable selling price, remove, and cart total remain compact/responsive.
- [ ] **I04:** Two bills can be held locally, identified, restored, continued, and removed.
- [ ] **I05 Critical:** A held bill never appears in sales, inventory movement, or reports before checkout.
- [ ] **I06 Critical:** Fixed/percentage item and bill discounts cannot be negative, exceed line/bill value, or
  exceed 100 percent.
- [ ] **I07:** Scheduled promotion applies only within dates and selected bill/product/service scope.
- [ ] **I08:** Permanent item discount and manual discount stacking follow the configured rule exactly.
- [ ] **I09 Critical:** Inclusive/exclusive VAT and non-taxable mixed carts match independent calculations.
- [ ] **I10:** Customer search selects a saved customer; duplicate phone is rejected after normalization.
- [ ] **I11:** Walk-in supports cash/card but Account/Pay later requires a saved customer.
- [ ] **I12:** Cash is default; cash/card/account paid and due amounts are correct.
- [ ] **I13 Critical:** Double-click/retry/reload cannot create duplicate bills or double-decrement stock.
- [ ] **I14 Critical:** Two simultaneous tills create unique receipt numbers and preserve both sales.

## J. Customers, Accounts, Settlements, Import, And Export

- [ ] **J01:** Customer dashboard counts, list, search, pagination, create, edit, and remove are correct.
- [ ] **J02:** Country code/phone/WhatsApp normalization and same-as-phone behavior are correct.
- [ ] **J03:** Customer import template contains only supported columns and valid examples.
- [ ] **J04:** Import rejects wrong schema/bad numbers, skips or resolves duplicate phones, and reports each row.
- [ ] **J05:** Export reimports without data loss and is denied to roles without export permission.
- [ ] **J06:** Account screen lists only customers with open account bills.
- [ ] **J07:** User can search/select one due receipt and cannot pay more than its due amount.
- [ ] **J08:** Partial/multiple settlements allocate correctly and create numbered payment receipts.
- [ ] **J09:** Settlement method changes cash/card/bank/accounting totals correctly.
- [ ] **J10:** Customer statement PDF includes logo, shop/customer, bills, payments, balance, and period.
- [ ] **J11:** Settlement history is customer-first, filtered, paginated, and printable.

## K. Bills, Receipts, PDF, Print, Email, And WhatsApp

- [ ] **K01:** Bills default to this month and support today/yesterday/week/month/year/custom filters.
- [ ] **K02:** Search by receipt/customer/phone/email/date and pagination return correct rows.
- [ ] **K03:** Paid/account/cancelled/refunded/partially-refunded statuses are accurate and immutable.
- [ ] **K04 Critical:** Receipt view/thermal print/PDF/public receipt all show identical financial values.
- [ ] **K05:** Logo spacing, VAT number, bilingual names, QR, footer, customer/cashier visibility are correct.
- [ ] **K06:** 58 mm, 80 mm, and A4 designs fit real paper; long receipts paginate without clipping.
- [ ] **K07:** Auto-print setting prints once, receipt page waits ten seconds, then returns to Billing.
- [ ] **K08:** QR/public link opens only that receipt and cannot enumerate another shop's receipt.
- [ ] **K09:** WhatsApp/email message is formatted with customer/shop/items/total and public receipt URL.
- [ ] **K10:** Missing phone/email prompts for details; browser handoff never falsely claims silent PDF attach.
- [ ] **K11:** Single/selected/date/all bill printing and refunded-bills tab use the selected records only.

## L. Refunds And Returns

- [ ] **L01 Critical:** Only admin/authorized role can refund; cashier direct API attempt is rejected.
- [ ] **L02:** Bill lookup works by receipt scan, period, customer, product, and pagination.
- [ ] **L03:** Full/partial item quantities cannot exceed remaining refundable quantities.
- [ ] **L04:** Reason is mandatory and original sale date remains unchanged.
- [ ] **L05 Critical:** Return posts today with negative revenue/profit adjustment linked to original receipt.
- [ ] **L06:** Refund payout method supports cash/card/account adjustment and ledger entries balance.
- [ ] **L07:** Cash refund reduces expected drawer cash; card/account refund does not incorrectly do so.
- [ ] **L08:** Physical item refund returns confirmed units to inventory once; service refund does not.
- [ ] **L09:** Refund history filters by period/customer/product and paginates.
- [ ] **L10:** Selected refund report/print contains shop/logo/original and refund transaction/item details.

## M. Reports And Accounting

- [ ] **M01:** Every report uses today/yesterday/week/month/year/custom dates consistently.
- [ ] **M02:** Sales report reconciles total, item, category, customer, payment, day, shift, and employee views.
- [ ] **M03:** Profit/loss reconciles net sales, COGS, gross profit, expenses, refund adjustments, VAT, net profit.
- [ ] **M04:** Employee report includes bills, units/products, revenue, refunds, and net sales.
- [ ] **M05:** Inventory report reconciles stock units/cost value/low stock/movements/suppliers.
- [ ] **M06:** Supplier/PO report reconciles ordered/received/cancelled/paid/due totals.
- [ ] **M07:** Refund report reconciles receipts/items/categories/reasons/payout methods/profit adjustment.
- [ ] **M08:** Tax report separates sales VAT payable, purchase VAT paid, and selected-period net VAT.
- [ ] **M09:** Day-close and shift reports reconcile to bills, payments, refunds, expenses, and drawer movements.
- [ ] **M10:** Ledger control totals debit equals credit and discrepancies are zero.
- [ ] **M11:** PDFs include logo, shop, VAT, report title/period, generation time, sections, page numbers, totals.
- [ ] **M12:** Large reports include all rows or explicit pagination/continuation, never a silent row limit.

## N. Settings, Permissions, Backup, Language, And Support

- [ ] **N01:** Settings navigation remains visible and only authorized sections are accessible.
- [ ] **N02:** Shop/logo/VAT/contact/currency/timezone settings propagate to receipts/reports after reload.
- [ ] **N03:** Day/shift auto settings, printer, receipt, and tax settings save with visible confirmation.
- [ ] **N04:** Promotion/permanent-discount schedules validate dates/scope/value and stop at expiry.
- [ ] **N05:** Users list/create/edit/deactivate/remove and custom roles/permissions enforce server-side access.
- [ ] **N06 Critical:** Cashier cannot import/export/backup, delete forever, refund, manage users, or change tax
  merely by calling an API directly.
- [ ] **N07:** Product Trash filters/pagination/restore/permanent delete preserve audit metadata.
- [ ] **N08:** Full JSON backup exports/imports exactly once with schema/version validation.
- [ ] **N09:** Product/customer templates and import/export preserve barcodes, names, phone rules, and categories.
- [ ] **N10:** English LTR, Arabic RTL, Urdu RTL translate visible text rather than only changing direction.
- [ ] **N11:** Bilingual receipt option affects view, print, PDF, WhatsApp/email link, and public receipt.
- [ ] **N12:** Support page masks key, shows current status/company contacts, and opens correct channels.

## O. Owner Billing, Branding, Access, Audit, And Reports

- [ ] **O01:** Store filters by status/country/city/created date and pagination are correct.
- [ ] **O02:** Paid/pending/cancelled billing groups and package changes reconcile amount, balance, expiry.
- [ ] **O03:** Recording payment extends expiry exactly once and cannot overstate collected revenue.
- [ ] **O04:** Owner package CRUD validates cycle, amount, trial, and active state.
- [ ] **O05:** Activation-key screen searches by store and copy/replace/revoke/delete affects that store only.
- [ ] **O06:** Branding name/logo/images/quotes save with visible confirmation and appear on all shop logins.
- [ ] **O07:** Branding image upload/URL gallery validates dimensions, compresses, and supports removal.
- [ ] **O08:** Announcement/ad appears on dashboard only when enabled and targeted.
- [ ] **O09:** Owner team roles enforce full owner vs customer-service access.
- [ ] **O10 Critical:** Support impersonation requires reason, expires, shows banner, and audits every action.
- [ ] **O11:** Audit log records actor/action/store/target/time/detail and supports filters/pagination.
- [ ] **O12:** Owner reports reconcile stores, status, expiries, devices, users, packages, payments, revenue.

## P. Reliability, Performance, Offline, Native, And Release

- [ ] **P01 Critical:** Two tills create simultaneous sales without lost updates or duplicate numbers.
- [ ] **P02 Critical:** Retried requests are idempotent for sale/refund/settlement/PO receive/payment.
- [ ] **P03:** Slow/failed network shows loading/offline state and never freezes or discards an unsynced action.
- [ ] **P04:** Browser close/reopen preserves only safe local drafts and does not resurrect cloud-deleted data.
- [ ] **P05:** Snapshot/API payload, query count, and page load remain acceptable with 10k products, 100k bills,
  10k customers, and one year of movements.
- [ ] **P06:** Public/activation/login/reset endpoints are rate-limited and do not leak secrets or stack traces.
- [ ] **P07:** Security headers, HTTPS, cookies, CORS, RLS, signed URLs, and secret rotation are verified.
- [ ] **P08:** Windows installer launches, updates, downloads PDFs, and prints to installed printers.
- [ ] **P09:** Android APK installs, camera/location/share/download/print handoff works, and permissions recover.
- [ ] **P10:** `npm run check:launch`, smoke, dependency audit, cloud audit, and migration audit all pass.
- [ ] **P11:** Backup restore drill succeeds on staging and monitoring/alerts/log retention are configured.
- [ ] **P12 Critical:** Pilot shop completes opening, sales, account payment, refund, closing, reports, backup,
  next-day reopen, and two-device reconciliation with zero unexplained difference.

## Release Sign-Off

Critical failures: ______  Noncritical failures: ______  Blocked tests: ______

Shop QA: __________  Owner QA: __________  Engineering: __________  Business owner: __________

Decision: [ ] Launch  [ ] Pilot only  [ ] Reject release
