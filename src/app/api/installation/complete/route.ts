import { NextResponse } from "next/server";
import { hashProductKey } from "@/lib/cloud-sync";
import { uploadDataUrlPosAsset } from "@/lib/supabase/storage-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CompleteInstallationRequest = {
  adminEmail?: string;
  adminName?: string;
  adminPassword?: string;
  adminPhone?: string;
  address?: string;
  currency?: string;
  email?: string;
  logoUrl?: string;
  phone?: string;
  productKey?: string;
  receiptFooterText?: string;
  receiptQrUrl?: string;
  shopName?: string;
  taxEnabled?: boolean;
  taxMode?: string;
  taxName?: string;
  taxRate?: number;
  vatNumber?: string;
  website?: string;
};

const MIN_PASSWORD_LENGTH = 8;

function clean(value?: string) {
  return value?.trim() ?? "";
}

function optionalClean(value?: string) {
  const normalized = clean(value);

  return normalized || null;
}

function normalizeTaxMode(value?: string) {
  return value === "exclusive" ? "exclusive" : "inclusive";
}

function mapProfile(profile: {
  created_at: string | null;
  email: string;
  id: string;
  is_active: boolean;
  last_login_at: string | null;
  name: string;
  phone: string | null;
  role: "super_admin" | "shop_admin" | "cashier" | "support";
  shop_id: string | null;
}) {
  return {
    id: profile.id,
    shopId: profile.shop_id ?? undefined,
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? undefined,
    role: profile.role,
    isActive: profile.is_active,
    lastLoginAt: profile.last_login_at ?? undefined,
    createdAt: profile.created_at ?? new Date().toISOString()
  };
}

export async function POST(request: Request) {
  let body: CompleteInstallationRequest;

  try {
    body = (await request.json()) as CompleteInstallationRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid installation payload." }, { status: 400 });
  }

  const productKey = clean(body.productKey);
  const shopName = clean(body.shopName);
  const adminName = clean(body.adminName);
  const adminEmail = clean(body.adminEmail).toLowerCase();
  const adminPassword = clean(body.adminPassword);

  if (!productKey || !shopName || !adminName || !adminEmail || !adminPassword) {
    return NextResponse.json(
      { ok: false, message: "Activation key, shop name, admin name, admin email, and admin password are required." },
      { status: 400 }
    );
  }

  if (productKey.length < 30) {
    return NextResponse.json({ ok: false, message: "Product key must be at least 30 characters." }, { status: 400 });
  }

  if (adminPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `Admin password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const keyHash = hashProductKey(productKey);
    const now = new Date().toISOString();
    const { data: productKeyRow, error: productKeyError } = await supabase
      .from("product_keys")
      .select("id, shop_id, status, expires_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (productKeyError) {
      throw productKeyError;
    }

    if (!productKeyRow) {
      return NextResponse.json({ ok: false, message: "Product key not found." }, { status: 404 });
    }

    if (["revoked", "locked", "expired"].includes(productKeyRow.status)) {
      return NextResponse.json(
        { ok: false, message: `This product key is ${productKeyRow.status}.` },
        { status: 403 }
      );
    }

    if (productKeyRow.expires_at && new Date(productKeyRow.expires_at).getTime() < Date.now()) {
      await supabase.from("product_keys").update({ status: "expired" }).eq("id", productKeyRow.id);

      return NextResponse.json({ ok: false, message: "This product key has expired." }, { status: 403 });
    }

    const [{ data: shop, error: shopError }, { data: license, error: licenseError }, { data: existingAdmins }] =
      await Promise.all([
        supabase
          .from("shops")
          .select("id, name, slug, license_status")
          .eq("id", productKeyRow.shop_id)
          .maybeSingle(),
        supabase
          .from("licenses")
          .select("id, status, expires_at")
          .eq("shop_id", productKeyRow.shop_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, name, email, phone, role, is_active, shop_id, created_at, last_login_at")
          .eq("shop_id", productKeyRow.shop_id)
          .eq("role", "shop_admin")
      ]);

    if (shopError) {
      throw shopError;
    }

    if (licenseError) {
      throw licenseError;
    }

    if (!shop) {
      return NextResponse.json({ ok: false, message: "The shop for this activation key was not found." }, { status: 404 });
    }

    if (!license) {
      return NextResponse.json({ ok: false, message: "No license is attached to this shop." }, { status: 403 });
    }

    if (license.status === "locked") {
      return NextResponse.json(
        { ok: false, message: "Your POS is temporarily locked. Please contact support." },
        { status: 403 }
      );
    }

    if (license.status === "expired" || (license.expires_at && new Date(license.expires_at).getTime() < Date.now())) {
      return NextResponse.json(
        { ok: false, message: "Your POS license has expired. Please contact support." },
        { status: 403 }
      );
    }

    const existingAdmin = existingAdmins?.[0];

    if (existingAdmin) {
      return NextResponse.json(
        {
          ok: false,
          alreadyInstalled: true,
          message: "This shop already has an admin account. Go back to login and sign in.",
          adminUser: mapProfile(existingAdmin)
        },
        { status: 409 }
      );
    }

    const { data: emailProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", adminEmail)
      .maybeSingle();

    if (emailProfile) {
      return NextResponse.json(
        { ok: false, message: "This admin email is already used. Use another email or ask the POS owner to reset access." },
        { status: 409 }
      );
    }

    const { data: createdAuthUser, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      email_confirm: true,
      password: adminPassword,
      user_metadata: {
        name: adminName,
        phone: optionalClean(body.adminPhone),
        role: "shop_admin",
        shop_id: shop.id
      }
    });

    if (authError) {
      return NextResponse.json(
        { ok: false, message: authError.message || "Unable to create the store admin login." },
        { status: 409 }
      );
    }

    const authUserId = createdAuthUser.user?.id;

    if (!authUserId) {
      return NextResponse.json({ ok: false, message: "Unable to create the store admin login." }, { status: 500 });
    }

    const profileRow = {
      id: authUserId,
      shop_id: shop.id,
      name: adminName,
      email: adminEmail,
      phone: optionalClean(body.adminPhone),
      role: "shop_admin" as const,
      is_active: true,
      last_login_at: now,
      created_at: now
    };
    const { error: profileError } = await supabase.from("profiles").insert(profileRow);

    if (profileError) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
      throw profileError;
    }

    const currency = clean(body.currency) || "SAR";
    const storedLogoUrl = await uploadDataUrlPosAsset(supabase, body.logoUrl, {
      fileName: "shop-logo.jpg",
      folder: `shops/${shop.id}/shop-logo`
    });

    const [{ error: updateShopError }, { error: settingsError }, { error: keyUpdateError }, { error: auditError }] =
      await Promise.all([
        supabase
          .from("shops")
          .update({
            name: shopName,
            phone: clean(body.phone),
            email: optionalClean(body.email),
            website: optionalClean(body.website),
            address: clean(body.address),
            currency,
            license_status: license.status,
            updated_at: now
          })
          .eq("id", shop.id),
        supabase.from("pos_settings").upsert(
          {
            shop_id: shop.id,
            shop_name: shopName,
            logo_url: optionalClean(storedLogoUrl),
            address: clean(body.address),
            phone: clean(body.phone),
            email: optionalClean(body.email),
            website: optionalClean(body.website),
            currency,
            vat_number: optionalClean(body.vatNumber),
            receipt_qr_url: optionalClean(body.receiptQrUrl),
            printer_settings: {
              receiptSize: "80mm",
              autoPrintAfterSale: false
            },
            receipt_settings: {
              footerText: clean(body.receiptFooterText) || `Thank you for visiting ${shopName}.`,
              showTax: true,
              showCustomer: true,
              showCashier: true,
              showVatNumber: true,
              showSecondaryLanguage: false,
              secondaryLanguage: "ar",
              receiptSize: "80mm"
            },
            tax_settings: {
              enabled: body.taxEnabled ?? true,
              name: clean(body.taxName) || "VAT",
              rate: Number.isFinite(body.taxRate) ? Math.max(0, Number(body.taxRate)) : 15,
              mode: normalizeTaxMode(body.taxMode),
              showOnReceipt: true
            },
            updated_at: now
          },
          { onConflict: "shop_id" }
        ),
        supabase
          .from("product_keys")
          .update({
            status: "active",
            activated_at: now
          })
          .eq("id", productKeyRow.id),
        supabase.from("audit_logs").insert({
          action: "shop.install.complete",
          actor_id: authUserId,
          detail: `First shop admin created for ${shopName}.`,
          shop_id: shop.id,
          target_id: shop.id
        })
      ]);

    if (updateShopError) {
      throw updateShopError;
    }

    if (settingsError) {
      throw settingsError;
    }

    if (keyUpdateError) {
      throw keyUpdateError;
    }

    if (auditError) {
      throw auditError;
    }

    return NextResponse.json({
      ok: true,
      adminUser: mapProfile(profileRow),
      shopId: shop.id
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to complete shop installation." },
      { status: 500 }
    );
  }
}
