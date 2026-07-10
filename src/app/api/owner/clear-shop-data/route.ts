import { NextResponse } from "next/server";
import { stableUuid } from "@/lib/cloud-sync";
import { clearShopDataScope, ownerClearShopDataScopeLabels, type OwnerClearShopDataScope } from "@/lib/shop-data-reset";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

function getCandidateShopIds(shopId: string) {
  return Array.from(new Set([shopId, stableUuid(`shop:${shopId}`)]));
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
  const candidateIds = getCandidateShopIds(shopId);
  const { data, error } = await supabase.from("shops").select("id").in("id", candidateIds).limit(1);

  if (error) {
    throw error;
  }

  return data?.[0]?.id ?? candidateIds[0];
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
  const ownerEmail = request.headers.get("x-owner-email")?.trim().toLowerCase();
  const expectedOwnerEmail = process.env.POS_OWNER_EMAIL?.trim().toLowerCase();

  if (expectedOwnerEmail && ownerEmail !== expectedOwnerEmail) {
    return NextResponse.json({ ok: false, message: "Owner data reset is not authorized." }, { status: 401 });
  }

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
    const supabase = createSupabaseAdminClient();
    const cloudShopId = await resolveCloudShopId(supabase, shopId);
    const snapshot = await loadSnapshot(supabase, cloudShopId);
    const clearedState = clearShopDataScope(snapshot.state ?? {}, cloudShopId, scope, {
      actorId: ownerEmail || "owner",
      shopName: body.shopName,
      createdAt: new Date().toISOString()
    });

    await saveSnapshot(supabase, cloudShopId, clearedState, snapshot.usesStorageFallback);

    return NextResponse.json({
      ok: true,
      cloudShopId,
      message: `${ownerClearShopDataScopeLabels[scope]} cleared for this store.`
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to clear store data." },
      { status: 500 }
    );
  }
}
