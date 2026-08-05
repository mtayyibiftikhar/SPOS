=== Global FSMS Commerce Bridge ===
Contributors: globalfsms
Tags: woocommerce, pos, licensing, subscriptions, customer portal
Requires at least: 6.9
Tested up to: 7.0.2
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Production customer portal, licensing, subscriptions, store provisioning, and device management bridge for Global FSMS.

== Description ==

Global FSMS Commerce Bridge keeps WooCommerce authoritative for checkout, orders, billing, and payment methods while maintaining a dedicated POS entitlement layer for stores, trials, devices, keys, access, and provisioning.

Global FSMS is the safe default connector. Absher POS is completely separate and cannot become active until its own HTTPS URL, signing key, webhook secret, and fingerprint are configured and an administrator explicitly types SWITCH CONNECTOR.

Features include verified customer registration, Twilio Verify OTP, Turnstile or reCAPTCHA, one-trial identity ledger, Action Scheduler provisioning retries, WooCommerce Subscriptions lifecycle support, encrypted store keys, one-time device codes, signed webhooks, customer and administrator dashboards, shortcodes, blocks, Elementor widgets, email templates, HPOS support, RTL styling, and non-destructive uninstall.

== Installation ==

1. Install and activate WooCommerce. Install WooCommerce Subscriptions when recurring plans are sold.
2. Upload this ZIP once and activate it.
3. Open Global FSMS and complete every setup check.
4. Configure the Global FSMS connector and run the signed connection test.
5. Configure CAPTCHA, Twilio Verify, products, trial policy, email delivery, and portal pages.
6. Select Validate and finish setup. Customer provisioning remains visibly incomplete until every required gate passes.

Production signing and webhook secrets should be supplied in wp-config.php:

define( 'GFCB_GLOBAL_FSMS_API_KEY', 'a-long-random-secret' );
define( 'GFCB_GLOBAL_FSMS_WEBHOOK_SECRET', 'a-different-long-random-secret' );

The Absher equivalents are GFCB_ABSHER_POS_API_KEY and GFCB_ABSHER_POS_WEBHOOK_SECRET. Never reuse values between brands.

== Security Notes ==

POS administrator passwords are sent only in authenticated, signed reset requests and are never stored or logged by WordPress. Store keys are encrypted at rest, masked by default, excluded from email and audit data, and revealed only after website-password reauthentication. Uninstall intentionally preserves financial, trial, entitlement, licensing, and audit records.

== Changelog ==

= 1.0.0 =
* Complete customer registration, verification, trial, store, subscription, entitlement, device, security, email, administration, and provisioning workflows.
* Added signed and isolated Global FSMS and Absher POS connector profiles.
* Added POS commerce API, one-time activation codes, signed callbacks, and global session invalidation.
* Added automated security contracts and production packaging.
