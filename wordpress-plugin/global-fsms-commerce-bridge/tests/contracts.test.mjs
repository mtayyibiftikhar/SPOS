import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const phpFiles = files(root).filter((path) => path.endsWith(".php"));
const source = phpFiles.map((path) => readFileSync(path, "utf8")).join("\n");

test("Global FSMS is the safe default and Absher is isolated", () => {
  assert.match(source, /const GLOBAL_FSMS = 'global_fsms'/);
  assert.match(source, /const ABSHER_POS\s+= 'absher_pos'/);
  assert.match(source, /get_option\( 'gfcb_active_connector', self::GLOBAL_FSMS \)/);
  assert.match(source, /SWITCH CONNECTOR/);
});

test("REST routes declare permission callbacks", () => {
  const rest = readFileSync(join(root, "includes/class-gfcb-rest-controller.php"), "utf8");
  const routes = [...rest.matchAll(/register_rest_route\([^;]+;/gs)].map((match) => match[0]);
  assert.ok(routes.length >= 10);
  for (const route of routes) assert.match(route, /permission_callback/);
});

test("secrets and passwords are excluded from audit payloads", () => {
  assert.match(source, /'current_password'.*'new_password'.*'otp'.*'token'.*'secret'.*'store_key'.*'api_key'/s);
  assert.doesNotMatch(source, /update_user_meta\([^\n]+(?:pos|store)[^\n]+password/i);
});

test("verification limits match the security contract", () => {
  assert.match(source, /const OTP_TTL\s+= 300/);
  assert.match(source, /attempt_count\s+>= 5/);
  assert.match(source, /password_reset_expiration/);
  assert.match(source, /return 600/);
});

test("HPOS and Cart Checkout Blocks compatibility are declared", () => {
  const main = readFileSync(join(root, "global-fsms-commerce-bridge.php"), "utf8");
  assert.match(main, /custom_order_tables/);
  assert.match(main, /cart_checkout_blocks/);
});

test("uninstall preserves operational and audit history", () => {
  const uninstall = readFileSync(join(root, "uninstall.php"), "utf8");
  assert.doesNotMatch(uninstall, /DROP TABLE/i);
  assert.match(uninstall, /preserves customer, trial, entitlement, audit/);
});

test("release metadata and secure connector callbacks are production versioned", () => {
  const main = readFileSync(join(root, "global-fsms-commerce-bridge.php"), "utf8");
  const readme = readFileSync(join(root, "readme.txt"), "utf8");
  assert.match(main, /Version: 1\.0\.0/);
  assert.match(readme, /Stable tag: 1\.0\.0/);
  assert.match(source, /GFCB_GLOBAL_FSMS_WEBHOOK_SECRET/);
  assert.match(source, /x-gfcb-event-id/);
});

test("paid order items are marked processed only after entitlement work succeeds", () => {
  const woo = readFileSync(join(root, "includes/class-gfcb-woocommerce.php"), "utf8");
  assert.match(woo, /if \( ! \$processed \)[\s\S]+continue;[\s\S]+_gfcb_processed_at/);
  assert.match(woo, /woocommerce_subscription_renewal_payment_failed/);
});

test("setup completion requires product mapping, OTP, pages, and a signed connection test", () => {
  const admin = readFileSync(join(root, "includes/class-gfcb-admin.php"), "utf8");
  assert.match(admin, /Phone OTP configured/);
  assert.match(admin, /WooCommerce products mapped/);
  assert.match(admin, /Active POS connection tested/);
  assert.match(admin, /Validate and finish setup/);
});

test("POS password setup links expire in ten minutes and are one-time tokens", () => {
  const verification = readFileSync(join(root, "includes/class-gfcb-verification-service.php"), "utf8");
  const rest = readFileSync(join(root, "includes/class-gfcb-rest-controller.php"), "utf8");
  assert.match(verification, /'pos_password'.*600/s);
  assert.match(rest, /consume_pos_password_token/);
  assert.match(rest, /works once/);
});
