import { NextResponse } from "next/server";
import { hashProductKey, stableUuid } from "@/lib/cloud-sync";
import { uploadPrivatePosAsset } from "@/lib/supabase/storage-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type UploadScope = "category" | "owner-ad" | "owner-logo" | "product" | "shop-logo";

const shopScopes = new Set<UploadScope>(["category", "product", "shop-logo"]);
const ownerScopes = new Set<UploadScope>(["owner-ad", "owner-logo"]);
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function clean(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getCandidateShopIds(shopId: string) {
  return Array.from(new Set([shopId, stableUuid(`shop:${shopId}`)]));
}

function folderForScope(scope: UploadScope, shopId?: string) {
  if (scope === "owner-logo") return "owner/branding";
  if (scope === "owner-ad") return "owner/login-ads";
  if (scope === "shop-logo") return `shops/${shopId}/shop-logo`;
  if (scope === "category") return `shops/${shopId}/categories`;
  return `shops/${shopId}/products`;
}

async function authorizeShopUpload(request: Request, requestedShopId: string) {
  const supabase = createSupabaseAdminClient();
  const candidateShopIds = getCandidateShopIds(requestedShopId);
  const userId = request.headers.get("x-user-id")?.trim();
  const userEmail = request.headers.get("x-user-email")?.trim().toLowerCase();
  const productKey = request.headers.get("x-product-key")?.trim();

  if (userId) {
    let query = supabase
      .from("profiles")
      .select("id, shop_id, email, role, is_active")
      .in("shop_id", candidateShopIds)
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

    if (profile?.shop_id) {
      return { ok: true, shopId: profile.shop_id, supabase };
    }
  }

  if (productKey && productKey.length >= 30) {
    const { data: keyRow, error } = await supabase
      .from("product_keys")
      .select("id, shop_id, status")
      .eq("key_hash", hashProductKey(productKey))
      .in("shop_id", candidateShopIds)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (keyRow && !["expired", "locked", "revoked"].includes(keyRow.status)) {
      return { ok: true, shopId: keyRow.shop_id, supabase };
    }
  }

  return { ok: false, shopId: requestedShopId, supabase };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const scope = clean(formData.get("scope")) as UploadScope;
  const requestedShopId = clean(formData.get("shopId") ?? request.headers.get("x-shop-id"));
  const fileName = clean(formData.get("fileName")) || (file instanceof File ? file.name : "image");

  if (!scope || ![...shopScopes, ...ownerScopes].includes(scope)) {
    return NextResponse.json({ ok: false, message: "Upload scope is required." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Image file is required." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, message: "Only image uploads are allowed." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, message: "Image must be 4 MB or smaller after optimization." }, { status: 400 });
  }

  try {
    const ownerEmail = request.headers.get("x-owner-email")?.trim().toLowerCase();
    const expectedOwnerEmail = process.env.POS_OWNER_EMAIL?.trim().toLowerCase();
    let folder: string;
    let supabase = createSupabaseAdminClient();

    if (ownerScopes.has(scope)) {
      if (expectedOwnerEmail && ownerEmail !== expectedOwnerEmail) {
        return NextResponse.json({ ok: false, message: "Owner upload is not authorized." }, { status: 401 });
      }

      folder = folderForScope(scope);
    } else {
      if (!requestedShopId) {
        return NextResponse.json({ ok: false, message: "Shop id is required for this upload." }, { status: 400 });
      }

      const authorization = await authorizeShopUpload(request, requestedShopId);
      supabase = authorization.supabase;

      if (!authorization.ok) {
        return NextResponse.json({ ok: false, message: "Shop upload is not authorized." }, { status: 401 });
      }

      folder = folderForScope(scope, authorization.shopId);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadPrivatePosAsset(supabase, {
      buffer,
      contentType: file.type,
      fileName,
      folder
    });

    return NextResponse.json({ ok: true, ...uploaded });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to upload image." },
      { status: 500 }
    );
  }
}
