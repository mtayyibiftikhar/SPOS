import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ResetShopUserPasswordRequest = {
  password?: string;
  shopId?: string;
  userEmail?: string;
  userId?: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function isValidPassword(password: string) {
  return password.trim().length >= 8;
}

async function isAuthorizedOwnerUser(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  ownerEmail: string
) {
  const expectedOwnerEmail = clean(process.env.POS_OWNER_EMAIL).toLowerCase();

  if (!ownerEmail) {
    return false;
  }

  if (expectedOwnerEmail && ownerEmail === expectedOwnerEmail) {
    return true;
  }

  const { data: ownerProfile, error } = await supabase
    .from("profiles")
    .select("id, shop_id, role, is_active")
    .eq("email", ownerEmail)
    .eq("is_active", true)
    .in("role", ["super_admin", "support"])
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(ownerProfile && !ownerProfile.shop_id);
}

export async function POST(request: Request) {
  const ownerEmail = clean(request.headers.get("x-owner-email")).toLowerCase();

  try {
    const supabase = createSupabaseAdminClient();
    const isAuthorized = await isAuthorizedOwnerUser(supabase, ownerEmail);

    if (!isAuthorized) {
      return NextResponse.json({ ok: false, message: "Owner password reset is not authorized." }, { status: 401 });
    }

    let body: ResetShopUserPasswordRequest;

    try {
      body = (await request.json()) as ResetShopUserPasswordRequest;
    } catch {
      return NextResponse.json({ ok: false, message: "Invalid password reset payload." }, { status: 400 });
    }

    const password = clean(body.password);
    const shopId = clean(body.shopId);
    const userEmail = clean(body.userEmail).toLowerCase();
    const userId = clean(body.userId);

    if (!userId && !userEmail) {
      return NextResponse.json({ ok: false, message: "Store user is required." }, { status: 400 });
    }

    if (!isValidPassword(password)) {
      return NextResponse.json({ ok: false, message: "Temporary password must be at least 8 characters." }, { status: 400 });
    }

    let query = supabase
      .from("profiles")
      .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
      .neq("role", "super_admin");

    if (userId) {
      query = query.eq("id", userId);
    } else {
      query = query.eq("email", userEmail);
    }

    if (shopId) {
      query = query.eq("shop_id", shopId);
    }

    const { data: profile, error: profileError } = await query.maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile || !profile.shop_id) {
      return NextResponse.json({ ok: false, message: "Store user was not found in cloud auth." }, { status: 404 });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
      password
    });

    if (updateError) {
      throw updateError;
    }

    await supabase.from("audit_logs").insert({
      action: "owner.user_password.reset",
      detail: `Owner ${ownerEmail || "unknown"} reset temporary POS sign-in password for ${profile.email}.`,
      shop_id: profile.shop_id,
      target_id: profile.id
    });

    return NextResponse.json({
      ok: true,
      message: "Temporary POS sign-in password saved in cloud auth.",
      user: {
        id: profile.id,
        shopId: profile.shop_id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone ?? undefined,
        role: profile.role,
        isActive: profile.is_active,
        lastLoginAt: profile.last_login_at ?? undefined,
        createdAt: profile.created_at ?? new Date().toISOString()
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to reset store user password." },
      { status: 500 }
    );
  }
}
