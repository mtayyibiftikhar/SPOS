# Global FSMS Commerce Bridge 1.0 architecture

## Authority boundaries

- WordPress owns website identities and website passwords.
- WooCommerce owns products, checkout, coupons, orders, invoices, and saved payment methods.
- WooCommerce Subscriptions owns recurring payment schedules and billing status.
- This plugin owns customer verification, the permanent trial ledger, stores, devices, entitlements, provisioning jobs, webhook idempotency, and audit history.
- The POS backend owns POS administrator credentials, actual POS databases, device activation, and live sessions.

Website and POS administrator credentials are deliberately independent. WordPress never reads or stores a current POS password.

## Connector isolation

`global_fsms` is the default. `absher_pos` has a separate URL, key, webhook secret, environment, and URL fingerprint. A target connector must be configured before an administrator with `manage_gfcb` can activate it using a nonce-protected form and the phrase `SWITCH CONNECTOR`. All switches are audited.

Outgoing requests use HMAC-SHA256 over method, path, Unix timestamp, and the SHA-256 JSON-body hash. Mutations use UUID idempotency keys. Incoming callbacks use a different webhook secret, a five-minute timestamp window, an event UUID, HMAC verification, and a persistent replay ledger.

Recommended production constants:

```php
define( 'GFCB_GLOBAL_FSMS_API_KEY', 'unique-request-signing-key' );
define( 'GFCB_GLOBAL_FSMS_WEBHOOK_SECRET', 'unique-callback-key' );
define( 'GFCB_ABSHER_POS_API_KEY', 'different-request-signing-key' );
define( 'GFCB_ABSHER_POS_WEBHOOK_SECRET', 'different-callback-key' );
```

## Operational flow

Paid WooCommerce line items create independent idempotent entitlements only after payment confirmation. Store work is queued through Action Scheduler and retried immediately, after 5 minutes, 15 minutes, 1 hour, and 6 hours before manual review. Subscription events change access through the entitlement layer. Trial identity hashes remain after account deletion to enforce one trial per verified email or phone.

The backend produces one-time eight-character device activation codes that expire after ten minutes and are consumed once. First installation always requires the permanent store key. “Sign out all” increments the store session version; every protected shop API compares that version before accepting a device or user session.

## Release verification

The release gate includes PHP parsing, TypeScript checking, static security contracts, application logic tests, a production Next.js build, ZIP path inspection, and an administrator-run signed connection test against the intended test environment. A real WooCommerce staging site remains required for customer acceptance because payment gateways, mail delivery, Twilio, and hosting configuration are external systems.
