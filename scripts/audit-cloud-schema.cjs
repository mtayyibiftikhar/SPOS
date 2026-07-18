const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const requiredTables = [
  "shops",
  "profiles",
  "brand_profile",
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
  "shifts",
  "bills",
  "bill_items",
  "payments",
  "refunds",
  "refund_items",
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
  "dictionary_entries",
  "announcements",
  "support_tickets",
  "support_sessions",
  "audit_logs",
  "owner_packages",
  "owner_subscription_payments",
  "payroll_rates",
  "attendance_qr_sessions",
  "attendance_records",
  "api_rate_limits"
];

const requiredBuckets = ["owner-cloud-snapshots", "pos-assets", "shop-cloud-snapshots"];
const requiredColumnProbes = [
  [
    "shops",
    "id,name,slug,email,phone,address,country,city,plan_name,billing_cycle,package_price,total_paid,last_owner_payment_at,auto_payment_enabled,cancelled_at,license_status,created_at"
  ],
  ["attendance_qr_sessions", "id,user_id,used_at"],
  [
    "attendance_records",
    "id,shop_id,user_id,business_date,clock_in_at,clock_out_at,scheduled_hours,paid_hours,hourly_rate,source,clock_in_latitude,clock_in_longitude,clock_in_selfie_url,note"
  ],
  ["payroll_rates", "id,shop_id,user_id,hourly_rate,default_daily_hours,effective_from,updated_at"],
  ["shop_cloud_snapshots", "shop_id,state,revision,updated_at"],
  ["owner_packages", "id,name,billing_cycle,duration_days,price,is_active"],
  ["owner_subscription_payments", "id,shop_id,package_id,amount,status,period_start,period_end"]
  ,
  ["api_rate_limits", "scope,identifier_hash,window_started_at,attempt_count,blocked_until,updated_at"]
];

function describeError(error) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(" | ") || "Supabase rejected the schema probe without returning diagnostic text";
}

function loadEnvironmentFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvironmentFile(".env.local");
  loadEnvironmentFile(".env");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const missingTables = [];
  const missingColumns = [];
  const tableCounts = {};

  for (const table of requiredTables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });

    if (error) {
      missingTables.push({ table, message: describeError(error) });
    } else {
      tableCounts[table] = count ?? 0;
    }
  }

  for (const [table, columns] of requiredColumnProbes) {
    const { error } = await supabase.from(table).select(columns, { head: true }).limit(1);
    if (error) missingColumns.push({ table, columns, message: describeError(error) });
  }

  const { data: activationProbe, error: activationProbeError } = await supabase.rpc(
    "activate_product_key_device",
    {
      p_browser_info: "schema-probe",
      p_device_fingerprint: "schema-probe",
      p_product_key_id: "00000000-0000-4000-8000-000000000000",
      p_shop_id: "00000000-0000-4000-8000-000000000000"
    }
  );
  const activationRpcAvailable = !activationProbeError && activationProbe?.reason === "key_not_found";

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  const bucketNames = new Set((buckets ?? []).map((bucket) => bucket.name));
  const missingBuckets = requiredBuckets.filter((bucket) => !bucketNames.has(bucket));
  const populatedTables = Object.entries(tableCounts).filter(([, count]) => count > 0);

  console.log(`Cloud schema: ${requiredTables.length - missingTables.length}/${requiredTables.length} required tables available.`);
  console.log(`Storage: ${requiredBuckets.length - missingBuckets.length}/${requiredBuckets.length} required buckets available.`);
  console.log(`Populated tables: ${populatedTables.map(([table, count]) => `${table}=${count}`).join(", ") || "none"}.`);

  if (bucketError) console.error(`Storage inspection failed: ${describeError(bucketError)}`);
  if (missingTables.length) {
    for (const issue of missingTables) console.error(`Missing/inaccessible table ${issue.table}: ${issue.message}`);
  }
  if (missingColumns.length) {
    for (const issue of missingColumns) {
      console.error(`Missing/inaccessible columns ${issue.table}(${issue.columns}): ${issue.message}`);
    }
  }
  if (missingBuckets.length) console.error(`Missing buckets: ${missingBuckets.join(", ")}`);
  if (!activationRpcAvailable) {
    console.error(`Atomic device activation RPC unavailable: ${describeError(activationProbeError)}`);
  }

  if (bucketError || missingTables.length || missingColumns.length || missingBuckets.length || !activationRpcAvailable) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
