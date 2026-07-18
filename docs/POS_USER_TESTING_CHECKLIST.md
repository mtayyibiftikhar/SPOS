# Simple POS - POS User Testing Checklist

This checklist covers the **shop/POS application only**. It does not test the POS Owner Portal.

## Test Record

| Field | Value |
| --- | --- |
| Release/build | |
| POS URL | |
| Shop name | |
| Tester | |
| Test date | |
| Device | |
| Browser/app version | |
| Shop timezone | |
| Admin user | |
| Cashier user | |

Use these result values: **Pass**, **Fail**, **Blocked**, or **N/A**.

Priority guide: **P0** blocks launch, **P1** is a major operational issue, and **P2** is a minor issue.

For every failure, record the checklist ID, exact steps, expected result, actual result, screenshot/video,
receipt or report number, device, browser, and time.

## Required Test Data

- [ ] One activated shop with a logo, VAT number, address, phone, email, website, SAR currency, and Riyadh timezone.
- [ ] One admin, one manager/custom role, two cashiers, and one inactive user.
- [ ] Two licensed devices and one additional device for device-limit testing.
- [ ] At least five categories, ten physical products, and two services.
- [ ] Products include taxable, non-taxable, low-stock, zero-stock, multiple-barcode, image, Arabic-name, and Urdu-name examples.
- [ ] At least three suppliers and three saved customers, including one customer with an account balance.
- [ ] Test printers or print previews for 58 mm, 80 mm, and A4.
- [ ] Chrome desktop, a tablet viewport/device, and a mobile viewport/device.

## Critical End-To-End Journey

Complete this journey before detailed testing. Any failure here is a launch blocker.

- [ ] **SMK-01 [P0]** Activate the POS with a valid key. The correct shop is loaded and no password is exposed.
- [ ] **SMK-02 [P0]** Complete first-time setup once. Later launches show staff sign-in instead of setup.
- [ ] **SMK-03 [P0]** Sign in as admin, clock in, open the business day, and open a shift.
- [ ] **SMK-04 [P0]** Create a category, product, service, supplier, and saved customer.
- [ ] **SMK-05 [P0]** Add inventory for the physical product. The service is rejected from stock receiving.
- [ ] **SMK-06 [P0]** Create one cash sale, one card sale, and one account/pay-later sale.
- [ ] **SMK-07 [P0]** Print and download a receipt, open its QR link, and send its WhatsApp/email handoff.
- [ ] **SMK-08 [P0]** Receive a partial customer account payment and verify the remaining balance.
- [ ] **SMK-09 [P0]** Create a partial refund and verify revenue, stock, customer balance, and cash treatment.
- [ ] **SMK-10 [P0]** End the shift, close the day, and reconcile reports with the completed transactions.
- [ ] **SMK-11 [P0]** Sign in on a second licensed device and confirm both devices see the same cloud data.
- [ ] **SMK-12 [P0]** Sign out and sign back in. Products, bills, customers, inventory, and reports remain available.

## 1. Activation, First Run, And Shop Sign-In

- [ ] **ACT-01 [P0]** A valid activation key activates the intended shop and device.
- [ ] **ACT-02 [P0]** An invalid activation key shows a clear error and does not open the POS.
- [ ] **ACT-03 [P0]** A revoked, expired, locked, or deleted-shop key cannot activate the POS.
- [ ] **ACT-04 [P0]** A key over its device limit shows the correct device-limit message.
- [ ] **ACT-05 [P1]** Activation auto-fills safe shop information such as shop identity or setup email, but never a password.
- [ ] **ACT-06 [P1]** First-run setup validates required fields, email, country code/phone, and minimum eight-character password.
- [ ] **ACT-07 [P0]** First-run setup creates the first admin only once and cannot be repeated to create another admin.
- [ ] **ACT-08 [P1]** The activation page shows the configured POS company logo/name, quote, image, and clickable contact details.
- [ ] **ACT-09 [P1]** Staff sign-in shows the shop logo/name and registered user names rather than only the setup email.
- [ ] **ACT-10 [P0]** Valid admin and cashier passwords sign in to their own accounts.
- [ ] **ACT-11 [P1]** Invalid credentials show a clear generic error without exposing the correct password.
- [ ] **ACT-12 [P0]** An inactive user cannot sign in.
- [ ] **ACT-13 [P1]** Store logout requires admin confirmation and returns to the correct store-level screen.
- [ ] **ACT-14 [P1]** Refreshing or reopening the browser preserves a valid activated-store state without repeating setup.

## 2. License, Lock, Expiry, And Device Messages

- [ ] **LIC-01 [P0]** An active license allows normal POS use.
- [ ] **LIC-02 [P0]** A locked shop shows a dedicated locked screen and blocks sales, product edits, inventory, and refunds.
- [ ] **LIC-03 [P0]** An expired subscription shows a dedicated expiry screen and support contact details.
- [ ] **LIC-04 [P0]** An ended trial shows a clear trial-ended message and blocks restricted operations.
- [ ] **LIC-05 [P1]** License recovery after renewal/unlock works after refresh without reinstalling the POS.
- [ ] **LIC-06 [P1]** License status is rechecked after browser refresh and after closing/reopening the POS.
- [ ] **LIC-07 [P1]** The Support page masks the activation key and shows the current license status.
- [ ] **LIC-08 [P0]** A removed or no-longer-authorized device cannot open a new shift after refresh.

## 3. Dashboard, Business Day, Shift, Expenses, And Drawer

- [ ] **REG-01 [P0]** Only one business day can be open for the shop at a time.
- [ ] **REG-02 [P1]** Business date follows the configured shop timezone.
- [ ] **REG-03 [P0]** A user can open a shift only after the business day is open.
- [ ] **REG-04 [P0]** Open shifts cannot exceed the licensed device limit.
- [ ] **REG-05 [P1]** A device with no available shift slot shows active shifts and the correct recovery guidance.
- [ ] **REG-06 [P1]** Shift opening records user, device, date/time, and opening cash.
- [ ] **REG-07 [P0]** Billing is blocked without an open day and a current-device open shift.
- [ ] **REG-08 [P0]** Day totals include all shifts for the business date; shift totals include only that shift.
- [ ] **REG-09 [P1]** Dashboard today/week/month sales and current-month profit match the relevant reports.
- [ ] **REG-10 [P1]** Dashboard day bill count, shift bill count, refunds, expenses, and inventory pulse are accurate.
- [ ] **REG-11 [P0]** Expected cash equals opening cash + cash sales + cash in - cash out - cash refunds.
- [ ] **REG-12 [P1]** Card and account sales do not increase expected drawer cash.
- [ ] **REG-13 [P1]** Cash expense affects the drawer correctly; card/bank expense does not alter drawer cash.
- [ ] **REG-14 [P1]** Cash in/out accepts only a positive amount and a reason.
- [ ] **REG-15 [P1]** Expense entry saves category, amount, payment method, vendor, notes, user, and timestamp.
- [ ] **REG-16 [P1]** Expense and drawer logs open in dedicated views with correct filters and pagination.
- [ ] **REG-17 [P0]** Ending a shift calculates expected cash, counted cash, shortage/overage, and saves the note.
- [ ] **REG-18 [P0]** A closed shift cannot be closed again or silently edited.
- [ ] **REG-19 [P0]** The day cannot close while any shift is still open.
- [ ] **REG-20 [P0]** Day close records sales, payment split, refunds, expenses, expected cash, counted cash, and difference.
- [ ] **REG-21 [P1]** Auto-rollover closes stale shifts/day and opens the next configured day/shift exactly once.
- [ ] **REG-22 [P1]** Reopening the POS after rollover shows the correct current day and current-device shift.

## 4. Attendance, Time Clock, And Salary

- [ ] **ATT-01 [P0]** A staff user who must clock in is stopped at the attendance gate before using the POS.
- [ ] **ATT-02 [P1]** Admin bypass is available only to authorized admins and requires a reason.
- [ ] **ATT-03 [P0]** The clock-in QR expires and cannot be reused after successful clock-in.
- [ ] **ATT-04 [P1]** QR scan requests camera/selfie and geolocation with understandable permission guidance.
- [ ] **ATT-05 [P0]** Clock-in stores the correct employee, shop, date/time, selfie, and location.
- [ ] **ATT-06 [P1]** Selfie images are compressed without becoming unusable.
- [ ] **ATT-07 [P1]** A user already clocked in is not asked to clock in again during the same attendance period.
- [ ] **ATT-08 [P1]** Clock-out stores time, location/selfie where required, and prevents duplicate clock-out.
- [ ] **ATT-09 [P1]** Clocking out and signing in later starts the intended new attendance flow.
- [ ] **ATT-10 [P1]** A missing clock-out applies the configured default hours at day end.
- [ ] **ATT-11 [P1]** Admin manual attendance correction records reason, old value, new value, actor, and time.
- [ ] **ATT-12 [P1]** Timecard filters by employee and date and shows scheduled, worked, and paid hours.
- [ ] **ATT-13 [P1]** Salary calculation matches hourly rate multiplied by approved paid hours.
- [ ] **ATT-14 [P0]** Cashiers cannot view other employees' selfies/salary or edit attendance without permission.
- [ ] **ATT-15 [P1]** Attendance/timecard PDF matches the on-screen period and totals.

## 5. Categories, Products, Services, Images, And Barcodes

- [ ] **PRD-01 [P1]** Product Overview statistics match Product List and Category List.
- [ ] **PRD-02 [P1]** Category list, create, and edit are separate, clear, searchable, and paginated.
- [ ] **PRD-03 [P0]** Category names are case-insensitive: `Milk`, `MILK`, and `milk` cannot exist separately.
- [ ] **PRD-04 [P1]** A category can be added from the product form without losing entered product data.
- [ ] **PRD-05 [P1]** Category edit updates the category everywhere it is displayed.
- [ ] **PRD-06 [P1]** Category deletion is blocked or safely handled when products still use it.
- [ ] **PRD-07 [P1]** Product form saves English, Arabic, and Urdu names correctly.
- [ ] **PRD-08 [P1]** Product/service type controls stock and reorder fields; services cannot carry stock.
- [ ] **PRD-09 [P0]** Sale price, cost price, and profit preview calculate correctly and reject invalid negative values.
- [ ] **PRD-10 [P1]** Taxable/non-taxable selection persists and is used during billing.
- [ ] **PRD-11 [P1]** Active/inactive status persists; inactive items cannot be sold.
- [ ] **PRD-12 [P1]** Product/category image upload and image URL work, compress correctly, and can be replaced/removed.
- [ ] **PRD-13 [P1]** Quick-tab selection persists and appears in the correct category on Billing.
- [ ] **PRD-14 [P0]** Automatic barcode generation creates a unique barcode.
- [ ] **PRD-15 [P0]** Duplicate manual or scanned barcodes show a clear error instead of silently replacing data.
- [ ] **PRD-16 [P1]** Multiple barcodes can be assigned to one product and all find the same product.
- [ ] **PRD-17 [P1]** Assigned Barcodes lists all barcodes and allows deletion while protecting the last required barcode.
- [ ] **PRD-18 [P1]** Product edit saves every changed field and shows visible save confirmation.
- [ ] **PRD-19 [P1]** Product list search, category filter, type filter, status filter, and pagination work together.
- [ ] **PRD-20 [P1]** Quick Billing Preview can search, add, and remove quick-tab products.
- [ ] **PRD-21 [P1]** Product delete requires a reason and moves the product to Product Trash with audit details.
- [ ] **PRD-22 [P1]** Restoring a trashed product returns it with the correct prior details.
- [ ] **PRD-23 [P0]** Permanent deletion is available only to an authorized admin.
- [ ] **PRD-24 [P1]** Barcode print supports selected/all products and selected/all barcodes.
- [ ] **PRD-25 [P1]** Barcode labels fit custom sticker width/height and A4 row/column settings without clipping.

## 6. Inventory, Suppliers, Purchase Orders, And Receiving

- [ ] **INV-01 [P1]** Inventory Overview excludes services and shows accurate units, cost value, and low-stock count.
- [ ] **INV-02 [P1]** Inventory list filters by product, category, and supplier and paginates correctly.
- [ ] **INV-03 [P1]** Inventory PDF includes shop details, filters, products, units, costs, and totals.
- [ ] **INV-04 [P1]** Clicking Low Stock opens Order Inventory with the intended low-stock items available.
- [ ] **INV-05 [P0]** Add Inventory finds products by name and every assigned barcode.
- [ ] **INV-06 [P0]** Scanning a service barcode shows that only physical products can be restocked.
- [ ] **INV-07 [P1]** Add Inventory allows quantity, received cost, and supplier selection before committing.
- [ ] **INV-08 [P1]** Two inventory drafts can be held locally, identified, restored, continued, and removed.
- [ ] **INV-09 [P0]** Held inventory does not change stock, cost, supplier totals, or reports before completion.
- [ ] **INV-10 [P0]** Completing Add Inventory updates stock once and creates a movement record.
- [ ] **INV-11 [P1]** Inventory adjustment by item changes only selected items.
- [ ] **INV-12 [P1]** Inventory adjustment by supplier changes only that supplier's listed items.
- [ ] **INV-13 [P1]** Inventory adjustment by category changes only that category's listed items.
- [ ] **INV-14 [P0]** Stock removal cannot reduce stock below zero.
- [ ] **INV-15 [P0]** Every add/remove/adjust/sale/refund/receive movement records before, change, after, actor, and time.
- [ ] **INV-16 [P1]** Supplier create/edit saves name, contact, VAT, address, payment terms, and status.
- [ ] **INV-17 [P1]** Supplier detail shows products, purchases, payments, paid amount, and due amount accurately.
- [ ] **INV-18 [P1]** PO item search works by product name and barcode and excludes services.
- [ ] **INV-19 [P1]** Low-stock products can be loaded, removed, or edited before creating a PO.
- [ ] **INV-20 [P0]** One PO belongs to one supplier and changing supplier is explicit before creation.
- [ ] **INV-21 [P0]** PO amount paid cannot be negative or exceed the PO total.
- [ ] **INV-22 [P1]** PO number, expected date, quantities, unit costs, VAT, total, paid, and due are correct.
- [ ] **INV-23 [P1]** PO print/PDF includes shop, supplier, PO number, dates, items, totals, and payment state.
- [ ] **INV-24 [P0]** Partial receiving adds only confirmed quantities and leaves remaining quantities open.
- [ ] **INV-25 [P0]** Completing a PO restocks each confirmed product once and closes the order.
- [ ] **INV-26 [P1]** Cancelling a PO does not restock inventory or create a supplier purchase.
- [ ] **INV-27 [P1]** PO History correctly separates open, completed, and cancelled orders.
- [ ] **INV-28 [P1]** Reorder creates an editable new order and does not modify the previous PO.
- [ ] **INV-29 [P1]** A new purchase cost affects future margins without changing historical bill-item cost.

## 7. Billing Cart, Quick Items, Held Bills, And Checkout

- [ ] **BIL-01 [P0]** Billing opens in the full-screen counter layout with a usable menu and no clipped actions.
- [ ] **BIL-02 [P1]** Quick categories are compact, searchable, and show configured category images.
- [ ] **BIL-03 [P0]** Selecting a quick category shows only its intended products.
- [ ] **BIL-04 [P0]** Each quick product adds the correct distinct product rather than reusing the first item.
- [ ] **BIL-05 [P0]** Product search works by English, Arabic, Urdu, primary barcode, and secondary barcodes.
- [ ] **BIL-06 [P1]** Repeated barcode scans increase the correct product quantity.
- [ ] **BIL-07 [P1]** Cart quantity plus/minus controls update totals immediately.
- [ ] **BIL-08 [P1]** Authorized users can edit selling price; unauthorized users cannot.
- [ ] **BIL-09 [P1]** Item removal removes only the selected line.
- [ ] **BIL-10 [P0]** Billing blocks quantities above available stock and never permits negative stock.
- [ ] **BIL-11 [P0]** Fixed item discount cannot be negative or exceed that line's value.
- [ ] **BIL-12 [P0]** Percentage item discount cannot be negative or exceed 100 percent.
- [ ] **BIL-13 [P0]** Mixed taxable/non-taxable cart totals match an independent calculation.
- [ ] **BIL-14 [P0]** Inclusive and exclusive VAT totals match the configured tax mode.
- [ ] **BIL-15 [P1]** A bill can be held with a useful identifier and a maximum of two held bills is enforced.
- [ ] **BIL-16 [P0]** Held bills are local drafts and do not appear in sales, stock movements, or reports.
- [ ] **BIL-17 [P1]** A held bill can be restored, edited, checked out, or removed.
- [ ] **BIL-18 [P1]** Continue to Customer is disabled for an empty cart.
- [ ] **BIL-19 [P1]** Customer search finds saved customers by name and normalized phone.
- [ ] **BIL-20 [P1]** A new customer can be added with country code, phone, WhatsApp, and optional email.
- [ ] **BIL-21 [P0]** Duplicate normalized customer phone is rejected.
- [ ] **BIL-22 [P1]** Walk-in customer can pay by cash or card.
- [ ] **BIL-23 [P0]** Account/Pay later requires a saved customer.
- [ ] **BIL-24 [P0]** Whole-bill fixed discount cannot be negative or exceed the bill value.
- [ ] **BIL-25 [P0]** Whole-bill percentage discount cannot be negative or exceed 100 percent.
- [ ] **BIL-26 [P1]** Scheduled promotion starts/ends at configured dates and applies only to its configured scope.
- [ ] **BIL-27 [P1]** Permanent item discount follows the configured products/services and stacking rule.
- [ ] **BIL-28 [P1]** Cash is selected by default; Cash, Card, and Account show correct paid/due amounts.
- [ ] **BIL-29 [P0]** Double-clicking Create Bill creates only one bill and decrements stock once.
- [ ] **BIL-30 [P0]** Successful checkout clears the draft/cart and opens the created receipt.

## 8. Receipts, Public QR, PDF, Print, WhatsApp, And Email

- [ ] **RCP-01 [P0]** Receipt view shows correct receipt number, date/time, cashier, customer, and payment status.
- [ ] **RCP-02 [P0]** Receipt items show name, quantity, unit price, discount, tax, and line total clearly.
- [ ] **RCP-03 [P0]** Subtotal, discount, VAT, total, paid, and due equal the completed bill.
- [ ] **RCP-04 [P1]** Shop logo, name, address, phone, VAT number, and configured footer have clean spacing.
- [ ] **RCP-05 [P1]** Optional customer and cashier visibility settings affect every receipt format.
- [ ] **RCP-06 [P1]** English-only receipt shows one product name when second language is disabled.
- [ ] **RCP-07 [P1]** Arabic/Urdu second-language option affects receipt view, print, PDF, and public receipt.
- [ ] **RCP-08 [P0]** Receipt QR opens the exact public digital receipt for that transaction.
- [ ] **RCP-09 [P0]** Changing a public receipt token or number cannot expose another shop's receipt.
- [ ] **RCP-10 [P1]** 58 mm print fits without horizontal clipping or missing totals.
- [ ] **RCP-11 [P1]** 80 mm print fits without merged item rows or missing totals.
- [ ] **RCP-12 [P1]** A4 receipt uses the dedicated A4 layout and looks professional.
- [ ] **RCP-13 [P1]** Long multi-item receipts continue to additional PDF/print pages without lost rows.
- [ ] **RCP-14 [P1]** Download PDF creates a readable file with values identical to the receipt view.
- [ ] **RCP-15 [P1]** Share uses the browser/device share feature when supported and provides a safe fallback otherwise.
- [ ] **RCP-16 [P1]** WhatsApp message includes customer, shop, item summary, total, and public receipt link.
- [ ] **RCP-17 [P1]** Email message includes a clear subject, customer, shop, item summary, total, and public receipt link.
- [ ] **RCP-18 [P1]** Missing WhatsApp/email prompts for the detail before opening the external app.
- [ ] **RCP-19 [P1]** The POS never claims that a PDF was silently attached when the browser cannot attach it.
- [ ] **RCP-20 [P1]** Auto-print prints once; disabled auto-print does not open an unwanted print dialog.
- [ ] **RCP-21 [P1]** Receipt page remains available for the configured delay and then returns to Billing once.

## 9. Bills And Sales History

- [ ] **HIS-01 [P1]** Bills defaults to the intended period, currently This Month.
- [ ] **HIS-02 [P1]** Today, Yesterday, This Week, This Month, This Year, and Custom filters return correct bills.
- [ ] **HIS-03 [P1]** Search works by receipt number, customer, phone, email, and date.
- [ ] **HIS-04 [P1]** Pagination keeps the current filters and does not repeat or skip bills.
- [ ] **HIS-05 [P0]** Paid, account, cancelled, refunded, and partially refunded statuses are accurate.
- [ ] **HIS-06 [P1]** Opening any bill displays the correct immutable receipt.
- [ ] **HIS-07 [P1]** Reprint, PDF, Share, Email, and WhatsApp actions work from historical bills.
- [ ] **HIS-08 [P1]** Refunded Bills contains only refunded or partially refunded bills.
- [ ] **HIS-09 [P1]** Select and print multiple bills prints only selected records.
- [ ] **HIS-10 [P1]** Print filtered/all bills respects the active date filter and search.

## 10. Customers, Accounts, Settlements, Import, And Export

- [ ] **CUS-01 [P1]** Customer Overview counts saved customers, customers with balance, outstanding balance, and settlements.
- [ ] **CUS-02 [P1]** Customer list is searchable, paginated, and uses a clean list-to-detail flow.
- [ ] **CUS-03 [P1]** Add Customer validates name, country code, normalized phone, WhatsApp, and optional email.
- [ ] **CUS-04 [P0]** Two customers cannot have the same normalized phone number.
- [ ] **CUS-05 [P1]** Editing a customer updates future use without changing historical receipt identity unexpectedly.
- [ ] **CUS-06 [P1]** Removing a customer with financial history is blocked or safely deactivated.
- [ ] **CUS-07 [P1]** Download Customer Template produces the supported Excel schema and example format.
- [ ] **CUS-08 [P1]** Import accepts a valid template, normalizes country code/leading zero, and assigns IDs automatically.
- [ ] **CUS-09 [P1]** Import rejects wrong columns and invalid phone rows with useful row-level errors.
- [ ] **CUS-10 [P1]** Import identifies duplicate phones and skips or resolves them without creating duplicates.
- [ ] **CUS-11 [P1]** Exported customers can be reimported using the template without losing supported fields.
- [ ] **CUS-12 [P0]** Account Overview contains only customers with open account bills.
- [ ] **CUS-13 [P1]** Selecting an account customer shows each due receipt and its remaining balance.
- [ ] **CUS-14 [P1]** Receipt search finds the intended open account receipt.
- [ ] **CUS-15 [P0]** Payment cannot be zero, negative, or greater than the selected receipt/customer due.
- [ ] **CUS-16 [P0]** Partial payment reduces only the selected due receipt by the paid amount.
- [ ] **CUS-17 [P0]** Multiple payments settle oldest/selected receipts according to the displayed allocation.
- [ ] **CUS-18 [P1]** Cash, Card, and Bank settlement methods affect the correct reports and drawer totals.
- [ ] **CUS-19 [P1]** Account payment creates a unique, printable payment receipt.
- [ ] **CUS-20 [P1]** Settlement History is customer-first, searchable, date-filtered, and paginated.
- [ ] **CUS-21 [P1]** Customer statement PDF includes shop/customer, period, bills, payments, and remaining balance.
- [ ] **CUS-22 [P0]** Users without import/export permission cannot access customer import/export actions.

## 11. Refunds And Returns

- [ ] **REF-01 [P0]** Only an admin or role with Refund permission can open and submit a refund.
- [ ] **REF-02 [P1]** Original bill lookup works by receipt scan/search, date, customer, and product.
- [ ] **REF-03 [P1]** Bill results paginate and preserve active filters.
- [ ] **REF-04 [P1]** Full refund selects all remaining refundable quantities.
- [ ] **REF-05 [P0]** Partial refund cannot exceed the remaining refundable quantity.
- [ ] **REF-06 [P0]** Refund reason is mandatory.
- [ ] **REF-07 [P0]** Refund creates a new transaction today and never edits the original sale date.
- [ ] **REF-08 [P0]** Refund links to the original receipt and records original sale date and return date.
- [ ] **REF-09 [P1]** Refund payout supports Cash, Card, and Account Adjustment.
- [ ] **REF-10 [P0]** Cash refund reduces expected drawer cash; Card/Account does not incorrectly reduce it.
- [ ] **REF-11 [P0]** Refunded physical quantity returns to stock once; refunded service does not alter stock.
- [ ] **REF-12 [P0]** Refund revenue and profit adjustment are negative and reconcile in reports.
- [ ] **REF-13 [P0]** Repeating/reloading the refund action cannot refund the same quantity twice.
- [ ] **REF-14 [P1]** Refund History filters by date, customer, product, and receipt and paginates correctly.
- [ ] **REF-15 [P1]** Selected refund print/PDF includes shop, original receipt, returned items, reason, payout, and totals.

## 12. Reports And Accounting

- [ ] **RPT-01 [P1]** Every report supports Today, Yesterday, This Week, This Month, This Year, and Custom dates.
- [ ] **RPT-02 [P1]** Report period labels, start/end dates, and timezone are consistent across tabs and PDFs.
- [ ] **RPT-03 [P0]** Sales report reconciles total sales with bills for the selected period.
- [ ] **RPT-04 [P1]** Sales by item, category, customer, payment method, employee, day, and shift reconcile to total sales.
- [ ] **RPT-05 [P0]** Profit/Loss reconciles net sales, COGS, gross profit, expenses, refund adjustments, VAT, and net profit.
- [ ] **RPT-06 [P1]** Profit with and without tax is labeled clearly and calculated consistently.
- [ ] **RPT-07 [P1]** Employee report includes bills, products/units sold, gross sales, refunds, and net sales.
- [ ] **RPT-08 [P1]** Inventory report reconciles units, cost value, low stock, movements, categories, and suppliers.
- [ ] **RPT-09 [P1]** Supplier/PO report reconciles ordered, received, cancelled, paid, and due totals.
- [ ] **RPT-10 [P1]** Expense/Drawer report separates expenses, cash in, and cash out and shows paginated logs.
- [ ] **RPT-11 [P1]** Refund report reconciles receipts, items, categories, reasons, payout methods, and profit adjustment.
- [ ] **RPT-12 [P0]** Tax report separates sales VAT payable, purchase VAT paid, and net VAT for the period.
- [ ] **RPT-13 [P0]** Day report reconciles every shift, payment method, refund, expense, and drawer movement for the day.
- [ ] **RPT-14 [P0]** Shift report includes only that shift's bills, payments, refunds, cash movements, and variance.
- [ ] **RPT-15 [P0]** Ledger control totals balance with zero unexplained difference.
- [ ] **RPT-16 [P1]** Every report PDF includes logo, shop name, VAT number, title, period, generated time, totals, and page numbers.
- [ ] **RPT-17 [P1]** Large PDFs include all rows or clearly continue across pages without silent row limits.
- [ ] **RPT-18 [P1]** On-screen values and PDF values are identical for the same report and period.

## 13. Settings, Users, Roles, Trash, Backup, And Support

- [ ] **SET-01 [P1]** Settings navigation remains visible and opens each allowed section without broken links.
- [ ] **SET-02 [P1]** Unauthorized users see only settings sections allowed by their role.
- [ ] **SET-03 [P1]** Shop Settings saves logo, name, address, phone, email, website, VAT, currency, and timezone.
- [ ] **SET-04 [P1]** Updated shop details appear on new receipts and reports after reload.
- [ ] **SET-05 [P1]** Day/Shift Settings save auto-close/start behavior with visible confirmation.
- [ ] **SET-06 [P1]** Printer Settings save 58 mm, 80 mm, A4, and auto-print behavior.
- [ ] **SET-07 [P1]** Receipt Settings save footer and customer/cashier/tax visibility.
- [ ] **SET-08 [P1]** Receipt second-language selection saves English only, English + Arabic, or English + Urdu.
- [ ] **SET-09 [P0]** Tax Settings save enabled state, name, rate, inclusive/exclusive mode, and receipt visibility.
- [ ] **SET-10 [P1]** Promotion validates start/end dates, discount type/value, and bill/product/service/selected-item scope.
- [ ] **SET-11 [P1]** Expired or disabled promotion stops applying automatically.
- [ ] **SET-12 [P1]** Permanent item discount can be assigned, edited, and removed from selected items.
- [ ] **SET-13 [P1]** Users screen lists all users first and opens create/edit in a separate clear flow.
- [ ] **SET-14 [P0]** User creation validates unique identity, phone/email as configured, role, and eight-character password.
- [ ] **SET-15 [P1]** User edit, password reset, deactivate/reactivate, and remove show visible confirmation.
- [ ] **SET-16 [P0]** A newly reset password works and the old password stops working.
- [ ] **SET-17 [P1]** Custom role can be created, renamed, and assigned granular permissions.
- [ ] **SET-18 [P0]** Role permissions are enforced after sign-out/sign-in and cannot be bypassed through hidden navigation.
- [ ] **SET-19 [P0]** Cashier cannot refund, permanently delete, manage users, change tax, or import/export unless permitted.
- [ ] **SET-20 [P1]** Product Trash filters by date, category, product name, and deletion user and paginates.
- [ ] **SET-21 [P1]** Restore and permanent delete preserve/show deletion reason, actor, and timestamp.
- [ ] **SET-22 [P1]** Full POS backup downloads a versioned file containing supported shop data.
- [ ] **SET-23 [P0]** Importing a valid backup restores data once without duplicating transactions.
- [ ] **SET-24 [P0]** Invalid, wrong-shop, or unsupported backup files are rejected safely.
- [ ] **SET-25 [P1]** Product import template/export/import preserves names, type, category, barcodes, prices, tax, and quick-tab state.
- [ ] **SET-26 [P0]** Only an authorized admin can import, export, or restore POS data.
- [ ] **SET-27 [P1]** Support page shows clickable WhatsApp, email, call, website, masked key, and license state.
- [ ] **SET-28 [P1]** Every settings save action displays a clear saved/error state and prevents accidental duplicate submission.

## 14. Language, RTL, Responsive Layout, And Usability

- [ ] **UI-01 [P1]** English translates visible labels and uses LTR layout.
- [ ] **UI-02 [P1]** Arabic translates visible labels, uses RTL layout, and shows Arabic product names.
- [ ] **UI-03 [P1]** Urdu translates visible labels, uses RTL layout, and shows Urdu product names.
- [ ] **UI-04 [P1]** Changing language does more than change text direction and does not require reinstall/setup.
- [ ] **UI-05 [P1]** Laptop layout around 1440x900 keeps critical Billing actions visible without page scrolling.
- [ ] **UI-06 [P1]** Billing quick items and cart each use the intended half-screen layout on large screens.
- [ ] **UI-07 [P1]** Billing internal lists scroll independently when many products/items exist.
- [ ] **UI-08 [P1]** Tablet layout keeps buttons, totals, fields, and dialogs reachable without overlap.
- [ ] **UI-09 [P1]** Mobile layout puts sign-in/actions first and allows clean page scrolling where necessary.
- [ ] **UI-10 [P1]** Billing hamburger opens/closes a scrollable navigation drawer and never covers an active dialog permanently.
- [ ] **UI-11 [P1]** Touch targets for add, quantity, payment, save, print, and navigation are easy to use.
- [ ] **UI-12 [P1]** No text, price, quantity, image, table, receipt, or primary button clips at 100 percent browser zoom.
- [ ] **UI-13 [P2]** Keyboard Tab order is logical and focused controls are visibly highlighted.
- [ ] **UI-14 [P1]** Barcode scanner input works through keyboard-style scan followed by Enter.
- [ ] **UI-15 [P1]** Loading states show progress rather than a frozen or permanent `Loading workplace` screen.
- [ ] **UI-16 [P1]** Success, validation, warning, and failure messages are clear and disappear or remain appropriately.

## 15. Cloud Persistence, Multi-Device, Network, And Security

- [ ] **CLD-01 [P0]** Product created on Device A appears on Device B after the intended sync/refresh.
- [ ] **CLD-02 [P0]** Bill created on Device A appears on Device B with the same receipt number and values.
- [ ] **CLD-03 [P0]** Customer, settlement, refund, inventory, supplier, PO, settings, and attendance data persist after logout.
- [ ] **CLD-04 [P0]** Two tills completing sales at nearly the same time create unique receipt numbers and preserve both sales.
- [ ] **CLD-05 [P0]** Two tills cannot oversell the final units of one product.
- [ ] **CLD-06 [P0]** Refresh/retry does not duplicate a sale, refund, settlement, inventory receive, or PO payment.
- [ ] **CLD-07 [P1]** Shift opened/closed on one device is reflected on another after the intended sync/refresh.
- [ ] **CLD-08 [P1]** Safe local drafts such as held bills/inventory survive accidental page refresh where designed.
- [ ] **CLD-09 [P0]** Old local data does not reappear after cloud deletion or reset.
- [ ] **CLD-10 [P1]** Slow network shows a loading state and does not allow repeated destructive submission.
- [ ] **CLD-11 [P0]** Failed network request shows a clear retry/error state and does not report a false successful sale.
- [ ] **CLD-12 [P1]** Returning online reloads authoritative cloud data without duplicating local drafts.
- [ ] **CLD-13 [P0]** Another shop's users, products, customers, bills, public receipts, and images are never visible.
- [ ] **CLD-14 [P0]** Passwords are never displayed in plain text in the UI, receipt, PDF, exported data, or browser URL.
- [ ] **CLD-15 [P1]** Back button after sign-out does not reopen protected shop data.

## 16. Optional Installed App Checks

Mark these N/A when testing browser-only deployment.

- [ ] **APP-01 [P1]** Windows app installs, opens the correct production POS, and retains its activated device state.
- [ ] **APP-02 [P1]** Windows app downloads PDFs and prints to an installed printer.
- [ ] **APP-03 [P1]** Windows app receives future application updates without losing local drafts or activation.
- [ ] **APP-04 [P1]** Android APK installs, opens, and retains its activated device state.
- [ ] **APP-05 [P1]** Android camera, location, QR, selfie, file download, and share permissions work after allow/deny/retry.
- [ ] **APP-06 [P1]** Android PDF/receipt opens in a compatible viewer and print/share handoff works.
- [ ] **APP-07 [P1]** Installed apps show the same cloud products, bills, customers, shifts, and reports as the browser.

## Defect Log

| Defect | Checklist ID | Priority | Summary | Steps/evidence | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |

## Test Summary

| Result | Count |
| --- | ---: |
| Pass | |
| Fail | |
| Blocked | |
| N/A | |
| Open P0 defects | |
| Open P1 defects | |
| Open P2 defects | |

## POS Release Sign-Off

| Sign-off | Name | Date | Decision/signature |
| --- | --- | --- | --- |
| Shop admin tester | | | |
| Cashier tester | | | |
| QA lead | | | |
| Engineering | | | |
| Business approval | | | |

Final decision: [ ] Approved for pilot  [ ] Approved for launch  [ ] Rejected  [ ] Retest required
