import { NextResponse } from "next/server";
import { hashProductKey } from "@/lib/cloud-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DemoAppState } from "@/types/pos";

const SNAPSHOT_BUCKET = "shop-cloud-snapshots";

type ShopStateRequest = {
  shopId?: string;
  state?: Partial<DemoAppState>;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function isMissingSnapshotTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /shop_cloud_snapshots/i.test(error.message ?? "");
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

async function authorizeShopStateAccess(request: Request, shopId: string) {
  const supabase = createSupabaseAdminClient();
  const userId = clean(request.headers.get("x-user-id"));
  const userEmail = clean(request.headers.get("x-user-email")).toLowerCase();
  const productKey = clean(request.headers.get("x-product-key"));

  if (userId) {
    let query = supabase
      .from("profiles")
      .select("id, shop_id, email, role, is_active")
      .eq("shop_id", shopId)
      .eq("id", userId)
      .eq("is_active", true)
      .neq("role", "super_admin");

    if (userEmail) {
      query = query.eq("email", userEmail);
    }

    const { data: profile, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    if (profile) {
      return { ok: true, supabase, userId: profile.id };
    }
  }

  if (productKey.length >= 30) {
    const { data: keyRow, error } = await supabase
      .from("product_keys")
      .select("id, shop_id, status")
      .eq("key_hash", hashProductKey(productKey))
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (keyRow && keyRow.status !== "revoked" && keyRow.status !== "locked" && keyRow.status !== "expired") {
      return { ok: true, supabase, userId: null };
    }
  }

  return { ok: false, supabase, userId: null };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = clean(url.searchParams.get("shopId") ?? request.headers.get("x-shop-id"));

  if (!shopId) {
    return NextResponse.json({ ok: false, message: "Shop id is required." }, { status: 400 });
  }

  try {
    const authorization = await authorizeShopStateAccess(request, shopId);

    if (!authorization.ok) {
      return NextResponse.json({ ok: false, message: "Shop cloud state is not authorized." }, { status: 401 });
    }

    const { data, error } = await authorization.supabase
      .from("shop_cloud_snapshots")
      .select("state, updated_at")
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) {
      if (isMissingSnapshotTableError(error)) {
        const state = await loadSnapshotFromStorage(authorization.supabase, shopId);

        return NextResponse.json({
          ok: true,
          state,
          storageFallback: true,
          updatedAt: null
        });
      }

      throw error;
    }

    return NextResponse.json({
      ok: true,
      state: (data?.state as Partial<DemoAppState> | null) ?? null,
      updatedAt: data?.updated_at ?? null
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to load shop cloud state." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: ShopStateRequest;

  try {
    body = (await request.json()) as ShopStateRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid shop state payload." }, { status: 400 });
  }

  const shopId = clean(body.shopId ?? request.headers.get("x-shop-id"));

  if (!shopId || !body.state) {
    return NextResponse.json({ ok: false, message: "Shop id and state are required." }, { status: 400 });
  }

  try {
    const authorization = await authorizeShopStateAccess(request, shopId);

    if (!authorization.ok) {
      return NextResponse.json({ ok: false, message: "Shop cloud state is not authorized." }, { status: 401 });
    }

    const { error } = await authorization.supabase.from("shop_cloud_snapshots").upsert(
      {
        shop_id: shopId,
        state: body.state,
        updated_by: authorization.userId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "shop_id" }
    );

    if (error) {
      if (isMissingSnapshotTableError(error)) {
        await saveSnapshotToStorage(authorization.supabase, shopId, body.state);

        return NextResponse.json({ ok: true, storageFallback: true });
      }

      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to save shop cloud state." },
      { status: 500 }
    );
  }
}
