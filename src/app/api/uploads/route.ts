import { NextResponse } from "next/server";
import { stableUuid } from "@/lib/cloud-sync";
import { deletePrivatePosAsset, getPrivatePosAssetPathFromUrl, uploadPrivatePosAsset } from "@/lib/supabase/storage-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";
import { readShopUserSession } from "@/lib/supabase/shop-session";
import { optimizePosImage } from "@/lib/server/optimize-pos-image";

type UploadScope = "category" | "owner-ad" | "owner-login-hero" | "owner-logo" | "product" | "shop-logo";

const shopScopes = new Set<UploadScope>(["category", "product", "shop-logo"]);
const ownerScopes = new Set<UploadScope>(["owner-ad", "owner-login-hero", "owner-logo"]);
const uploadLimitsByScope: Record<UploadScope, number> = {
  category: 350 * 1024,
  "owner-ad": 900 * 1024,
  "owner-login-hero": 900 * 1024,
  "owner-logo": 220 * 1024,
  product: 350 * 1024,
  "shop-logo": 220 * 1024
};
const imageProfilesByScope: Record<UploadScope, { width: number; height: number }> = {
  category: { width: 1_000, height: 1_000 },
  "owner-ad": { width: 1_600, height: 1_000 },
  "owner-login-hero": { width: 1_600, height: 1_000 },
  "owner-logo": { width: 800, height: 800 },
  product: { width: 1_000, height: 1_000 },
  "shop-logo": { width: 800, height: 800 }
};

function clean(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getCandidateShopIds(shopId: string) {
  return Array.from(new Set([shopId, stableUuid(`shop:${shopId}`)]));
}

function folderForScope(scope: UploadScope, shopId?: string) {
  if (scope === "owner-logo") return "owner/branding";
  if (scope === "owner-ad") return "owner/login-ads";
  if (scope === "owner-login-hero") return "owner/login-hero";
  if (scope === "shop-logo") return `shops/${shopId}/shop-logo`;
  if (scope === "category") return `shops/${shopId}/categories`;
  return `shops/${shopId}/products`;
}

async function authorizeShopUpload(request: Request, requestedShopId: string) {
  const supabase = createSupabaseAdminClient();
  const candidateShopIds = getCandidateShopIds(requestedShopId);
  const session = readShopUserSession(request);

  if (session && candidateShopIds.includes(session.shopId)) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, shop_id, email, role, is_active")
      .eq("shop_id", session.shopId)
      .eq("id", session.userId)
      .eq("email", session.email)
      .eq("role", session.role)
      .eq("is_active", true)
      .neq("role", "super_admin")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (profile?.shop_id) {
      return { ok: true, shopId: profile.shop_id, supabase };
    }
  }

  return { ok: false, shopId: requestedShopId, supabase };
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "A multipart image upload is required." }, { status: 400 });
  }

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

  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type.toLowerCase())) {
    return NextResponse.json({ ok: false, message: "Use a valid JPG, PNG, or WebP image." }, { status: 400 });
  }

  const maxUploadBytes = uploadLimitsByScope[scope];

  if (file.size > maxUploadBytes) {
    return NextResponse.json(
      {
        ok: false,
        message: `Image must be ${Math.round(maxUploadBytes / 1024)} KB or smaller after optimization.`
      },
      { status: 400 }
    );
  }

  try {
    let folder: string;
    let supabase = createSupabaseAdminClient();

    if (ownerScopes.has(scope)) {
      const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
      if (!authorization) {
        return NextResponse.json({ ok: false, message: "Owner upload is not authorized." }, { status: 401 });
      }

      supabase = authorization.supabase;
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

    const optimized = await optimizePosImage(
      Buffer.from(await file.arrayBuffer()),
      imageProfilesByScope[scope],
      maxUploadBytes
    );
    const uploaded = await uploadPrivatePosAsset(supabase, {
      buffer: optimized.buffer,
      contentType: optimized.contentType,
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

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { path?: string; url?: string };
    const urlOrPath = clean(body.path ?? body.url ?? "");
    const storagePath = getPrivatePosAssetPathFromUrl(urlOrPath);

    if (!storagePath) {
      return NextResponse.json({ ok: true, deleted: false, message: "External image removed from rotation only." });
    }

    if (!storagePath.startsWith("owner/login-hero/")) {
      if (!/^shops\/[^/]+\/(categories|products|shop-logo)\//.test(storagePath)) {
        return NextResponse.json({ ok: false, message: "This image cannot be deleted from this endpoint." }, { status: 400 });
      }

      const [, storageShopId] = storagePath.split("/");
      const authorization = await authorizeShopUpload(request, storageShopId);

      if (!authorization.ok || authorization.shopId !== storageShopId) {
        return NextResponse.json({ ok: false, message: "Shop image delete is not authorized." }, { status: 401 });
      }

      const deleted = await deletePrivatePosAsset(authorization.supabase, storagePath);

      return NextResponse.json({ ok: true, ...deleted });
    }

    const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner delete is not authorized." }, { status: 401 });
    }

    const deleted = await deletePrivatePosAsset(authorization.supabase, storagePath);

    return NextResponse.json({ ok: true, ...deleted });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, message: "A valid image delete payload is required." }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to delete image." },
      { status: 500 }
    );
  }
}
