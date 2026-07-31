import { NextResponse } from "next/server";
import { sanitizePhoneInput } from "@/lib/phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readShopUserSession } from "@/lib/supabase/shop-session";

type ShopUserPayload = {
  email?: string;
  id?: string;
  isActive?: boolean;
  name?: string;
  password?: string;
  phone?: string;
  role?: "shop_admin" | "cashier" | "support";
};

type ShopProfile = {
  created_at: string | null;
  email: string;
  id: string;
  is_active: boolean;
  last_login_at: string | null;
  name: string;
  phone: string | null;
  role: "shop_admin" | "cashier" | "support";
  shop_id: string;
};

function mapShopUser(profile: ShopProfile) {
  return {
    id: profile.id,
    shopId: profile.shop_id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? undefined,
    role: profile.role,
    isActive: profile.is_active,
    lastLoginAt: profile.last_login_at ?? undefined,
    createdAt: profile.created_at ?? new Date().toISOString()
  };
}

async function authorizeShopAdmin(request: Request) {
  const session = readShopUserSession(request);

  if (!session || session.role !== "shop_admin") {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data: admin, error } = await supabase
    .from("profiles")
    .select("id, shop_id, email, role, is_active")
    .eq("id", session.userId)
    .eq("shop_id", session.shopId)
    .eq("email", session.email)
    .eq("role", "shop_admin")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;

  return admin ? { session, supabase } : null;
}

export async function POST(request: Request) {
  let body: ShopUserPayload;

  try {
    body = (await request.json()) as ShopUserPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid shop user payload." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const name = body.name?.trim() ?? "";
  const password = body.password?.trim() ?? "";
  const phone = sanitizePhoneInput(body.phone ?? "") || null;
  const role = body.role;

  if (!email || !name || !role || !["shop_admin", "cashier", "support"].includes(role)) {
    return NextResponse.json({ ok: false, message: "Name, email, and role are required." }, { status: 400 });
  }

  if (!body.id && password.length < 8) {
    return NextResponse.json({ ok: false, message: "Password must be at least 8 characters." }, { status: 400 });
  }

  if (password && password.length < 8) {
    return NextResponse.json({ ok: false, message: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const authorization = await authorizeShopAdmin(request);

    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Shop user management is not authorized." }, { status: 401 });
    }

    const { session, supabase } = authorization;
    let userId = body.id?.trim() ?? "";
    let createdAuthUserId: string | null = null;
    let isActive = true;

    if (userId) {
      const { data: existingProfile, error: existingError } = await supabase
        .from("profiles")
        .select("id, shop_id, email, role, is_active")
        .eq("id", userId)
        .eq("shop_id", session.shopId)
        .neq("role", "super_admin")
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existingProfile) {
        return NextResponse.json({ ok: false, message: "Shop user was not found." }, { status: 404 });
      }

      if (userId === session.userId && existingProfile.email.toLowerCase() !== email) {
        return NextResponse.json({ ok: false, message: "Sign out before changing your own admin email." }, { status: 400 });
      }

      if (userId === session.userId && role !== "shop_admin") {
        return NextResponse.json({ ok: false, message: "You cannot change your own active admin role." }, { status: 400 });
      }

      isActive = existingProfile.is_active;

      const authUpdate: { email: string; password?: string; user_metadata: { name: string; phone: string | null; role: string; shop_id: string } } = {
        email,
        user_metadata: { name, phone, role, shop_id: session.shopId }
      };
      if (password) authUpdate.password = password;

      const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdate);
      if (authError) throw authError;
    } else {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone, role, shop_id: session.shopId }
      });

      if (authError || !authData.user) {
        throw authError ?? new Error("Unable to create shop auth user.");
      }

      userId = authData.user.id;
      createdAuthUserId = userId;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          shop_id: session.shopId,
          name,
          email,
          phone,
          role,
          is_active: isActive
        },
        { onConflict: "id" }
      )
      .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
      .single();

    if (profileError) {
      if (createdAuthUserId) await supabase.auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
      throw profileError;
    }

    await supabase.from("audit_logs").insert({
      action: body.id ? "shop.user.update" : "shop.user.create",
      actor_id: session.userId,
      detail: `${body.id ? "Updated" : "Created"} ${role} user ${email}.`,
      shop_id: session.shopId,
      target_id: userId
    });

    return NextResponse.json({ ok: true, user: mapShopUser(profile as ShopProfile) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to save shop user." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  let body: ShopUserPayload;

  try {
    body = (await request.json()) as ShopUserPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid shop user payload." }, { status: 400 });
  }

  const userId = body.id?.trim() ?? "";

  if (!userId || typeof body.isActive !== "boolean") {
    return NextResponse.json({ ok: false, message: "User and access state are required." }, { status: 400 });
  }

  try {
    const authorization = await authorizeShopAdmin(request);

    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Shop user management is not authorized." }, { status: 401 });
    }

    const { session, supabase } = authorization;

    if (!body.isActive && userId === session.userId) {
      return NextResponse.json({ ok: false, message: "You cannot deactivate your own admin account." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
      .eq("id", userId)
      .eq("shop_id", session.shopId)
      .neq("role", "super_admin")
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ ok: false, message: "Shop user was not found." }, { status: 404 });

    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ is_active: body.isActive })
      .eq("id", userId)
      .eq("shop_id", session.shopId)
      .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
      .single();

    if (updateError) throw updateError;

    await supabase.from("audit_logs").insert({
      action: body.isActive ? "shop.user.activate" : "shop.user.deactivate",
      actor_id: session.userId,
      detail: `${body.isActive ? "Activated" : "Deactivated"} shop user ${profile.email}.`,
      shop_id: session.shopId,
      target_id: userId
    });

    return NextResponse.json({ ok: true, user: mapShopUser(updated as ShopProfile) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to update shop user access." },
      { status: 500 }
    );
  }
}
