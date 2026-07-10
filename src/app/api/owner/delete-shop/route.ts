import { NextResponse } from "next/server";
import { stableUuid } from "@/lib/cloud-sync";
import { POS_ASSETS_BUCKET } from "@/lib/supabase/storage-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SNAPSHOT_BUCKET = "shop-cloud-snapshots";

type DeleteShopRequest = {
  shopId?: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function getCandidateShopIds(shopId: string) {
  return Array.from(new Set([shopId, stableUuid(`shop:${shopId}`)]));
}

function isMissingTableOrColumn(error: { code?: string; message?: string }) {
  return (
    ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") ||
    /could not find|does not exist|schema cache/i.test(error.message ?? "")
  );
}

async function deleteFromTable(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: string,
  column: string,
  value: string
) {
  const { error } = await supabase.from(table).delete().eq(column, value);

  if (error && !isMissingTableOrColumn(error)) {
    throw error;
  }
}

async function resolveCloudShopId(supabase: ReturnType<typeof createSupabaseAdminClient>, shopId: string) {
  const candidateIds = getCandidateShopIds(shopId);
  const { data, error } = await supabase.from("shops").select("id").in("id", candidateIds).limit(1);

  if (error) {
    throw error;
  }

  return data?.[0]?.id ?? candidateIds[0];
}

async function listStorageObjectsRecursively(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string,
  prefix: string
) {
  const paths: string[] = [];

  async function walk(currentPrefix: string) {
    const { data, error } = await supabase.storage.from(bucket).list(currentPrefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" }
    });

    if (error) {
      if (/not found|does not exist|bucket/i.test(error.message)) {
        return;
      }

      throw error;
    }

    for (const item of data ?? []) {
      const path = `${currentPrefix}/${item.name}`.replace(/^\/+/, "");

      if (item.metadata) {
        paths.push(path);
      } else {
        await walk(path);
      }
    }
  }

  await walk(prefix.replace(/\/+$/, ""));

  return paths;
}

async function removeStoragePrefix(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string,
  prefix: string
) {
  const paths = await listStorageObjectsRecursively(supabase, bucket, prefix);

  if (paths.length === 0) {
    return 0;
  }

  const { error } = await supabase.storage.from(bucket).remove(paths);

  if (error && !/not found|does not exist|object/i.test(error.message)) {
    throw error;
  }

  return paths.length;
}

async function deleteShopRows(supabase: ReturnType<typeof createSupabaseAdminClient>, shopId: string) {
  const deletePlan: Array<[string, string]> = [
    ["refund_items", "shop_id"],
    ["payments", "shop_id"],
    ["bill_items", "shop_id"],
    ["purchase_order_items", "shop_id"],
    ["customer_account_payments", "shop_id"],
    ["accounting_ledger_entries", "shop_id"],
    ["inventory_adjustments", "shop_id"],
    ["inventory_batches", "shop_id"],
    ["day_closes", "shop_id"],
    ["cash_movements", "shop_id"],
    ["expenses", "shop_id"],
    ["refunds", "shop_id"],
    ["bills", "shop_id"],
    ["purchase_orders", "shop_id"],
    ["deleted_products", "shop_id"],
    ["products", "shop_id"],
    ["product_categories", "shop_id"],
    ["suppliers", "shop_id"],
    ["customers", "shop_id"],
    ["shifts", "shop_id"],
    ["business_days", "shop_id"],
    ["expense_categories", "shop_id"],
    ["support_sessions", "shop_id"],
    ["support_tickets", "shop_id"],
    ["audit_logs", "shop_id"],
    ["dictionary_entries", "shop_id"],
    ["announcements", "target_shop_id"],
    ["device_activations", "shop_id"],
    ["product_keys", "shop_id"],
    ["licenses", "shop_id"],
    ["pos_settings", "shop_id"],
    ["shop_cloud_snapshots", "shop_id"],
    ["profiles", "shop_id"],
    ["shops", "id"]
  ];

  for (const [table, column] of deletePlan) {
    await deleteFromTable(supabase, table, column, shopId);
  }
}

export async function POST(request: Request) {
  const ownerEmail = request.headers.get("x-owner-email")?.trim().toLowerCase();
  const expectedOwnerEmail = process.env.POS_OWNER_EMAIL?.trim().toLowerCase();

  if (expectedOwnerEmail && ownerEmail !== expectedOwnerEmail) {
    return NextResponse.json({ ok: false, message: "Owner shop delete is not authorized." }, { status: 401 });
  }

  let body: DeleteShopRequest;

  try {
    body = (await request.json()) as DeleteShopRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid shop delete payload." }, { status: 400 });
  }

  const requestedShopId = clean(body.shopId);

  if (!requestedShopId) {
    return NextResponse.json({ ok: false, message: "Shop id is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const cloudShopId = await resolveCloudShopId(supabase, requestedShopId);
    const candidateShopIds = getCandidateShopIds(requestedShopId);
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("shop_id", cloudShopId);

    if (profileError && !isMissingTableOrColumn(profileError)) {
      throw profileError;
    }

    const storagePrefixes = Array.from(new Set([...candidateShopIds, cloudShopId]));
    let removedStorageObjects = 0;

    for (const shopId of storagePrefixes) {
      removedStorageObjects += await removeStoragePrefix(supabase, POS_ASSETS_BUCKET, `shops/${shopId}`);
      removedStorageObjects += await removeStoragePrefix(supabase, SNAPSHOT_BUCKET, shopId);
    }

    await deleteShopRows(supabase, cloudShopId);

    for (const profile of profiles ?? []) {
      await supabase.auth.admin.deleteUser(profile.id).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      cloudShopId,
      deletedAuthUsers: profiles?.length ?? 0,
      removedStorageObjects
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to delete shop cloud data." },
      { status: 500 }
    );
  }
}
