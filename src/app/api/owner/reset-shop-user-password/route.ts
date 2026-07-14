import { NextResponse } from "next/server";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";

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

export async function POST(request: Request) {
  try {
    const authorization = await getAuthorizedOwnerSession(request);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner password reset is not authorized." }, { status: 401 });
    }
    const { session, supabase } = authorization;

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

    let { data: profile, error: profileError } = await query.maybeSingle();

    if (!profile && userId && userEmail) {
      let emailQuery = supabase
        .from("profiles")
        .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
        .eq("email", userEmail)
        .neq("role", "super_admin");

      if (shopId) {
        emailQuery = emailQuery.eq("shop_id", shopId);
      }

      const fallback = await emailQuery.maybeSingle();
      profile = fallback.data;
      profileError = fallback.error;
    }

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
      detail: `Owner ${session.email} reset temporary POS sign-in password for ${profile.email}.`,
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
