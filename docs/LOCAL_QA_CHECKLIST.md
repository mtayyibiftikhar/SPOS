# Local POS QA Checklist

Date: 2026-07-07

Use this checklist before moving to Supabase/cloud deployment.

## 1. Access And First Run

- [ ] Open `http://localhost:3000/login`.
- [ ] Sign in as Shop admin.
- [ ] Sign out and sign in as Cashier.
- [ ] Sign out and sign in as POS owner.
- [ ] Open `/register`.
- [ ] Register a fresh shop with shop name, address, phone, email, website, VAT number, receipt QR URL, tax settings, logo, admin user, and optional cashier.
- [ ] Confirm the new shop opens on Dashboard after registration.
- [ ] Confirm the new shop details can later be edited from Settings > Shop Settings.

## 2. Dashboard And Cash Control

- [ ] Confirm dashboard opens without loading freeze.
- [ ] Start business day as admin.
- [ ] Start shift with opening cash.
- [ ] Add cash in.
- [ ] Add cash out.
- [ ] Confirm expected cash formula looks correct.
- [ ] Try closing day while shift is open and confirm it blocks.
- [ ] End shift with counted cash and confirm difference.
- [ ] Close business day and confirm day close totals.
- [ ] Reopen/start another day flow on the same date if needed and confirm it does not break the workspace.

## 3. Products And Categories

- [ ] Add category.
- [ ] Try adding duplicate category name and confirm it blocks.
- [ ] Edit category.
- [ ] Remove category.
- [ ] Add product with English, Arabic, and Urdu names.
- [ ] Add service and confirm it does not appear in physical inventory.
- [ ] Confirm barcode is generated automatically.
- [ ] Try manual duplicate barcode behavior.
- [ ] Set taxable and non-taxable products.
- [ ] Mark product for quick billing tab.
- [ ] Edit product sale price and cost price.
- [ ] Delete product and confirm it moves to Settings > Product Trash.
- [ ] Restore product from Product Trash.
- [ ] Permanently delete only as admin.
- [ ] Check product pagination and search.

## 4. Inventory

- [ ] Open standalone Inventory.
- [ ] Confirm only physical products appear.
- [ ] Add inventory through normal add stock flow.
- [ ] Add inventory through quick restock barcode flow.
- [ ] Change cost price while adding inventory and confirm profit reports reflect new cost for future sales.
- [ ] Remove inventory as manager/admin.
- [ ] Confirm cashier cannot adjust inventory.
- [ ] Confirm movement history records add/remove/sale/refund movements.
- [ ] Add supplier with VAT/contact/payment details.
- [ ] Create purchase order by searching products and adding quantities.
- [ ] Receive a purchase order.
- [ ] Test supplier payment method: cash, card/bank, credit/account.
- [ ] Check expired and near-expiry sections.

## 5. Billing Main Screen

- [ ] Open Billing as admin with day and shift closed; confirm bill creation is blocked.
- [ ] Open day and shift, then return to Billing.
- [ ] Search item by name.
- [ ] Search item by barcode.
- [ ] Add quick/favorite item.
- [ ] Add normal catalog item.
- [ ] Change item quantity in cart.
- [ ] Change selling price in cart.
- [ ] Add per-item discount.
- [ ] Confirm overselling is blocked when stock is insufficient.
- [ ] Remove item from cart.
- [ ] Confirm cart total, VAT, and item tax handling.
- [ ] Continue to customer step.

## 6. Checkout Customer Step

- [ ] Leave customer empty and confirm walk-in customer behavior.
- [ ] Add new customer with country code and phone.
- [ ] Search/select saved customer by name.
- [ ] Search/select saved customer by phone.
- [ ] Try duplicate phone number and confirm it blocks.
- [ ] Add whole-bill fixed discount.
- [ ] Add whole-bill percentage discount.
- [ ] Confirm discount totals are clear before payment.

## 7. Checkout Payment Step

- [ ] Create cash bill.
- [ ] Create card bill.
- [ ] Try account/pay-later with walk-in customer and confirm it blocks.
- [ ] Create account/pay-later bill with saved customer.
- [ ] Confirm bill creation redirects to receipt page.
- [ ] Confirm receipt number increments.
- [ ] Confirm stock reduces after product sale.

## 8. Receipt And Sharing

- [ ] Confirm receipt shows shop logo.
- [ ] Confirm receipt shows shop name, address, phone, VAT number, QR, cashier, customer, items, totals, paid and due.
- [ ] Print receipt.
- [ ] Download PDF.
- [ ] Share PDF where browser supports Web Share.
- [ ] Email PDF handoff: if no email exists, confirm prompt asks for email.
- [ ] WhatsApp handoff: if no WhatsApp exists, confirm prompt asks for number.
- [ ] Confirm WhatsApp/email message includes customer, store, items, total, and receipt reminder.
- [ ] Confirm no refund action exists directly on receipt page.
- [ ] Test a long multi-item receipt PDF.

## 9. Bills

- [ ] Open Bills.
- [ ] Search by receipt number.
- [ ] Search by customer.
- [ ] Search by phone.
- [ ] Filter today.
- [ ] Filter yesterday.
- [ ] Filter this week.
- [ ] Filter this month.
- [ ] Filter this year.
- [ ] Use custom date range.
- [ ] Check pagination.
- [ ] Open an old receipt.
- [ ] Reprint receipt.
- [ ] Download/share/email/WhatsApp from receipt.

## 10. Customers

- [ ] Open Customers.
- [ ] Add customer.
- [ ] Edit customer.
- [ ] Remove/deactivate customer.
- [ ] Search customer by name, phone, and email.
- [ ] Export customers.
- [ ] Import customers.
- [ ] Create account sale for customer.
- [ ] Confirm balance due increases.
- [ ] Apply partial account payment.
- [ ] Confirm payment cannot exceed due balance.
- [ ] Apply second payment to clear remaining due.
- [ ] Confirm settlement history.
- [ ] Download customer statement PDF.
- [ ] Confirm account payment receipt is created.

## 11. Refunds

- [ ] Open Refunds.
- [ ] Search original bill.
- [ ] Create refund for today from older sale.
- [ ] Select refund items and quantities.
- [ ] Enter refund reason.
- [ ] Select refund payout method: cash, card, account adjustment.
- [ ] Confirm refund creates a new negative transaction.
- [ ] Confirm original sale date remains unchanged.
- [ ] Confirm return date is today.
- [ ] Confirm stock is returned for refunded products.
- [ ] Check Refund History.
- [ ] Confirm reports show refund and profit adjustment correctly.

## 12. Reports

- [ ] Open Reports.
- [ ] Check today report.
- [ ] Check yesterday report.
- [ ] Check this week report.
- [ ] Check this month report.
- [ ] Check this year report.
- [ ] Check custom date report.
- [ ] Export PDF for overview/sales.
- [ ] Export PDF for profit/loss.
- [ ] Export PDF for employee sales.
- [ ] Export PDF for inventory.
- [ ] Export PDF for refunds.
- [ ] Confirm report PDFs include store logo/name/date sections and organized totals.
- [ ] Confirm closed-day reports make sense after day close.

## 13. Settings

- [ ] Shop Settings: edit shop name, logo, address, phone, email, website, VAT number, QR URL.
- [ ] Printer Settings: switch 58mm, 80mm, A4 and auto-print toggle.
- [ ] Receipt Settings: footer, show/hide tax, customer, cashier, receipt size.
- [ ] Tax Settings: enable/disable tax, tax name, rate, inclusive/exclusive.
- [ ] Users: add user.
- [ ] Users: edit user role.
- [ ] Users: deactivate/remove user.
- [ ] Confirm only owner/admin can manage users.
- [ ] Support: confirm WhatsApp/email/call support details.
- [ ] Support: confirm product key is masked.
- [ ] Dictionary: edit a visible translation.
- [ ] Change language to Arabic and confirm visible text translates and RTL applies.
- [ ] Change language to Urdu and confirm visible text translates and RTL applies.
- [ ] Backup: export full POS data.
- [ ] Backup: import full POS data.

## 14. Owner Portal

- [ ] Sign in as POS owner.
- [ ] Confirm shop routes are blocked while in owner workspace.
- [ ] Create shop account.
- [ ] Generate product key.
- [ ] Activate product key from login screen.
- [ ] Set license status: trial, active, expired, locked.
- [ ] Set license expiry date.
- [ ] Set auto-lock days after expiry.
- [ ] Lock shop remotely.
- [ ] Confirm locked shop cannot create bills or edit products/inventory/refunds.
- [ ] Unlock shop remotely.
- [ ] Send announcement to one shop.
- [ ] Send announcement to all shops.
- [ ] Start support impersonation with reason and minutes.
- [ ] Confirm support banner appears.
- [ ] End support session.
- [ ] Confirm support/audit logs record session.
- [ ] Edit POS company name/logo/address/phone/email/website.
- [ ] Toggle POS company receipt imprint.
- [ ] Edit loading screen title/message.
- [ ] Confirm loading screen uses owner brand.

## 15. Responsive QA

- [ ] Test laptop width around 1440x900.
- [ ] Test tablet width around 1024x768.
- [ ] Test mobile width around 390x844.
- [ ] Confirm Billing main screen uses available height and only inner panels scroll where intended.
- [ ] Confirm checkout steps are usable on laptop without losing primary action.
- [ ] Confirm mobile flows scroll cleanly without hidden buttons.
- [ ] Confirm sidebar/top navigation does not cover content.

## 16. Negative And Edge Cases

- [ ] Invalid login.
- [ ] Invalid product key.
- [ ] Expired product key.
- [ ] Locked license.
- [ ] Device limit reached.
- [ ] Empty cart checkout.
- [ ] Account sale without customer.
- [ ] Duplicate customer phone.
- [ ] Duplicate category.
- [ ] Delete product used in old bill.
- [ ] Refund more than sold quantity.
- [ ] Remove more inventory than available.
- [ ] Import malformed backup/customer file.
- [ ] Browser refresh during active billing flow.
- [ ] Close/reopen browser and confirm local state persists.

## Known Local-Only Limitations

- Cloud database is not wired yet; most app state still uses localStorage.
- Login is local/simple hash for QA; Supabase Auth must replace it before real cloud launch.
- Receipt and account payment numbering is local sequence based.
- Product keys exist in local client state for the demo; production must keep only hashed keys server-side.
- WhatsApp/email PDF sharing is browser handoff. Automatic attachment/send requires backend email provider or WhatsApp Business API.
- Arabic/Urdu translations still need human review before commercial rollout.
