const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || process.env[match[1]]) continue;

    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

async function listObjects(supabase, bucket, prefix) {
  const paths = [];

  async function walk(currentPrefix) {
    const { data, error } = await supabase.storage.from(bucket).list(currentPrefix, { limit: 1000 });
    if (error) {
      if (/not found|does not exist|bucket/i.test(error.message)) return;
      throw error;
    }

    for (const item of data ?? []) {
      const itemPath = `${currentPrefix}/${item.name}`.replace(/^\/+/, "");
      if (item.metadata) paths.push(itemPath);
      else await walk(itemPath);
    }
  }

  await walk(prefix.replace(/\/+$/, ""));
  return paths;
}

async function removePrefix(supabase, bucket, prefix) {
  const paths = await listObjects(supabase, bucket, prefix);
  if (paths.length === 0) return 0;

  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error && !/not found|does not exist|object/i.test(error.message)) throw error;
  return paths.length;
}

async function countRows(supabase, table, configure = (query) => query) {
  const { count, error } = await configure(supabase.from(table).select("*", { count: "exact", head: true }));
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code) || /does not exist|could not find/i.test(error.message)) return null;
    throw error;
  }
  return count ?? 0;
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase URL and service-role key are required in .env.local.");

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: shops, error: shopsError } = await supabase.from("shops").select("id, name");
  if (shopsError) throw shopsError;

  const shopIds = (shops ?? []).map((shop) => shop.id);
  let shopAuthUsers = [];
  if (shopIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, shop_id").in("shop_id", shopIds);
    if (profileError) throw profileError;
    shopAuthUsers = profiles ?? [];
  }

  let removedObjects = 0;
  for (const shopId of shopIds) {
    removedObjects += await removePrefix(supabase, "pos-assets", `shops/${shopId}`);
    removedObjects += await removePrefix(supabase, "shop-cloud-snapshots", shopId);
  }

  if (shopIds.length > 0) {
    const { error: deleteError } = await supabase.from("shops").delete().in("id", shopIds);
    if (deleteError) throw deleteError;
  }

  let removedAuthUsers = 0;
  for (const profile of shopAuthUsers) {
    const { error } = await supabase.auth.admin.deleteUser(profile.id);
    if (!error) removedAuthUsers += 1;
  }

  const tenantTables = [
    "licenses",
    "product_keys",
    "device_activations",
    "shop_cloud_snapshots",
    "pos_settings",
    "product_categories",
    "products",
    "product_barcodes",
    "deleted_products",
    "customers",
    "business_days",
    "bills",
    "bill_items",
    "payments",
    "refunds",
    "refund_items",
    "shifts",
    "suppliers",
    "inventory_adjustments",
    "inventory_batches",
    "purchase_orders",
    "purchase_order_items",
    "customer_account_payments",
    "cash_movements",
    "expense_categories",
    "expenses",
    "day_closes",
    "accounting_ledger_entries",
    "support_tickets",
    "support_sessions",
    "payroll_rates",
    "attendance_qr_sessions",
    "attendance_records",
    "owner_subscription_payments"
  ];
  const verification = {
    shops: await countRows(supabase, "shops"),
    shopProfiles: await countRows(supabase, "profiles", (query) => query.not("shop_id", "is", null))
  };

  for (const table of tenantTables) {
    verification[table] = await countRows(supabase, table);
  }
  verification.dictionaryEntries = await countRows(supabase, "dictionary_entries", (query) => query.not("shop_id", "is", null));
  verification.shopAnnouncements = await countRows(supabase, "announcements", (query) => query.not("target_shop_id", "is", null));
  verification.shopAuditLogs = await countRows(supabase, "audit_logs", (query) => query.not("shop_id", "is", null));

  const remainingRows = Object.values(verification).some((count) => typeof count === "number" && count !== 0);
  if (remainingRows) throw new Error(`Store reset verification failed: ${JSON.stringify(verification)}`);

  for (const localPath of [
    path.join(process.cwd(), ".local", "simple-pos-state.json"),
    path.join(process.cwd(), "_local_owner_state", "owner-state.json")
  ]) {
    if (fs.existsSync(localPath)) fs.rmSync(localPath, { force: true });
  }

  console.log(JSON.stringify({
    ok: true,
    deletedStores: shopIds.length,
    removedAuthUsers,
    removedStorageObjects: removedObjects,
    verification
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
