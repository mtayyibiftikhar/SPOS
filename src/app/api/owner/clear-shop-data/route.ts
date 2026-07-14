import { NextResponse } from "next/server";
import { stableUuid } from "@/lib/cloud-sync";
import { POS_ASSETS_BUCKET } from "@/lib/supabase/storage-assets";
import { clearShopDataScope, ownerClearShopDataScopeLabels, type OwnerClearShopDataScope } from "@/lib/shop-data-reset";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";
import type { DemoAppState } from "@/types/pos";

const SNAPSHOT_BUCKET = "shop-cloud-snapshots";

type ClearShopDataRequest = {
  scope?: OwnerClearShopDataScope;
  shopId?: string;
  shopName?: string;
};

function isMissingSnapshotTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /shop_cloud_snapshots/i.test(error.message ?? "");
}

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? fallback);
  }

  return fallback;
}

function getCandidateShopIds(shopId: string) {
  return Array.from(new Set([shopId, stableUuid(`shop:${shopId}`)]));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

async function ensureSnapshotBucket(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { error } = await supabase.storage.createBucket(SNAPSHOT_BUCKET, {
    public: false
  });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error;
  }
}

async function loadSnapshotFromStorage(supabase: ReturnType<typeof createSupabaseAdminClient>, shopId: string) {
  const { data, error } = await supabase.storage.from(SNAPSHOT_BUCKET).download(`${shopId}/state.json`);

  if (error) {
    if (/not found|does not exist|object|bucket/i.test(error.message)) {
      return null;
    }

    throw error;
  }

  const text = await data.text();

  return text ? (JSON.parse(text) as Partial<DemoAppState>) : null;
}

async function saveSnapshotToStorage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string,
  state: Partial<DemoAppState>
) {
  await ensureSnapshotBucket(supabase);

  const { error } = await supabase.storage.from(SNAPSHOT_BUCKET).upload(`${shopId}/state.json`, JSON.stringify(state), {
    contentType: "application/json",
    upsert: true
  });

  if (error) {
    throw error;
  }
}

async function resolveCloudShopId(supabase: ReturnType<typeof createSupabaseAdminClient>, shopId: string) {
  const candidateIds = getCandidateShopIds(shopId).filter(isUuid);
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

async function deleteLedgerRowsForSalesReset(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string
) {
  const { error } = await supabase
    .from("accounting_ledger_entries")
    .delete()
    .eq("shop_id", shopId)
    .in("reference_type", ["bill", "cash_movement", "customer_payment", "refund"]);

  if (error && !isMissingTableOrColumn(error)) {
    throw error;
  }
}

async function clearShopRowsForScope(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string,
  scope: OwnerClearShopDataScope
) {
  const clearBills = scope === "all" || scope === "bills";
  const clearProducts = scope === "all" || scope === "products";

  if (clearBills) {
    const billTables: Array<[string, string]> = [
      ["refund_items", "shop_id"],
      ["payments", "shop_id"],
      ["bill_items", "shop_id"],
      ["customer_account_payments", "shop_id"],
      ["day_closes", "shop_id"],
      ["cash_movements", "shop_id"],
      ["attendance_records", "shop_id"],
      ["attendance_qr_sessions", "shop_id"],
      ["refunds", "shop_id"],
      ["bills", "shop_id"],
      ["shifts", "shop_id"],
      ["business_days", "shop_id"]
    ];

    await deleteLedgerRowsForSalesReset(supabase, shopId);

    for (const [table, column] of billTables) {
      await deleteFromTable(supabase, table, column, shopId);
    }
  }

  if (clearProducts) {
    const productTables: Array<[string, string]> = [
      ["purchase_order_items", "shop_id"],
      ["inventory_adjustments", "shop_id"],
      ["inventory_batches", "shop_id"],
      ["purchase_orders", "shop_id"],
      ["product_barcodes", "shop_id"],
      ["deleted_products", "shop_id"],
      ["products", "shop_id"],
      ["product_categories", "shop_id"],
      ["suppliers", "shop_id"]
    ];

    for (const [table, column] of productTables) {
      await deleteFromTable(supabase, table, column, shopId);
    }

    await removeStoragePrefix(supabase, POS_ASSETS_BUCKET, `shops/${shopId}/products`);
    await removeStoragePrefix(supabase, POS_ASSETS_BUCKET, `shops/${shopId}/categories`);
  }

  if (scope === "all") {
    const allOnlyTables: Array<[string, string]> = [
      ["expenses", "shop_id"],
      ["expense_categories", "shop_id"],
      ["support_sessions", "shop_id"],
      ["support_tickets", "shop_id"],
      ["payroll_rates", "shop_id"],
      ["customers", "shop_id"]
    ];

    for (const [table, column] of allOnlyTables) {
      await deleteFromTable(supabase, table, column, shopId);
    }
  }
}

async function loadSnapshot(supabase: ReturnType<typeof createSupabaseAdminClient>, shopId: string) {
  const { data, error } = await supabase
    .from("shop_cloud_snapshots")
    .select("state")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) {
    if (isMissingSnapshotTableError(error)) {
      return { state: await loadSnapshotFromStorage(supabase, shopId), usesStorageFallback: true };
    }

    throw error;
  }

  if (data?.state) {
    return { state: data.state as Partial<DemoAppState>, usesStorageFallback: false };
  }

  const storageState = await loadSnapshotFromStorage(supabase, shopId);

  return { state: storageState, usesStorageFallback: false };
}

async function saveSnapshot(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string,
  state: Partial<DemoAppState>,
  usesStorageFallback: boolean
) {
  if (!usesStorageFallback) {
    const { error } = await supabase.from("shop_cloud_snapshots").upsert(
      {
        shop_id: shopId,
        state,
        updated_by: null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "shop_id" }
    );

    if (error) {
      if (!isMissingSnapshotTableError(error)) {
        throw error;
      }

      await saveSnapshotToStorage(supabase, shopId, state);
      return;
    }
  }

  await saveSnapshotToStorage(supabase, shopId, state);
}

export async function POST(request: Request) {
  let body: ClearShopDataRequest;

  try {
    body = (await request.json()) as ClearShopDataRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid store data reset payload." }, { status: 400 });
  }

  const shopId = clean(body.shopId);
  const scope = body.scope;

  if (!shopId || !scope || !["all", "bills", "products"].includes(scope)) {
    return NextResponse.json({ ok: false, message: "Store and reset type are required." }, { status: 400 });
  }

  try {
    const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner data reset is not authorized." }, { status: 401 });
    }
    const { session, supabase } = authorization;

    const cloudShopId = await resolveCloudShopId(supabase, shopId);
    const snapshot = await loadSnapshot(supabase, cloudShopId);
    const clearedState = clearShopDataScope(snapshot.state ?? {}, cloudShopId, scope, {
      actorId: session.email,
      shopName: body.shopName,
      createdAt: new Date().toISOString()
    });

    await clearShopRowsForScope(supabase, cloudShopId, scope);
    await saveSnapshot(supabase, cloudShopId, clearedState, snapshot.usesStorageFallback);

    return NextResponse.json({
      ok: true,
      cloudShopId,
      message: `${ownerClearShopDataScopeLabels[scope]} cleared for this store.`
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: errorMessage(error, "Unable to clear store data.") },
      { status: 500 }
    );
  }
}
