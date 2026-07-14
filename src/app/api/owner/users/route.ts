import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";

type OwnerUserPayload = {
  email?: string;
  id?: string;
  isActive?: boolean;
  name?: string;
  password?: string;
  phone?: string;
  role?: "super_admin" | "support";
};

function mapOwnerUser(profile: {
  created_at: string | null;
  email: string;
  id: string;
  is_active: boolean;
  last_login_at: string | null;
  name: string;
  phone: string | null;
  role: "super_admin" | "support";
}) {
  return {
    id: profile.id,
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
  let body: OwnerUserPayload;

  try {
    body = (await request.json()) as OwnerUserPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid owner user payload." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const name = body.name?.trim() ?? "";
  const phone = body.phone?.trim() || null;
  const password = body.password ?? "";
  const role = body.role;

  if (!email || !name || !role || !["super_admin", "support"].includes(role)) {
    return NextResponse.json({ ok: false, message: "Name, email, and owner role are required." }, { status: 400 });
  }

  if (!body.id && password.length < 8) {
    return NextResponse.json({ ok: false, message: "Password must be at least 8 characters." }, { status: 400 });
  }

  if (password && password.length < 8) {
    return NextResponse.json({ ok: false, message: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner team management is not authorized." }, { status: 401 });
    }

    const { supabase } = authorization;
    let userId = body.id?.trim() ?? "";
    let createdAuthUserId: string | null = null;

    if (userId) {
      const { data: existingProfile, error: existingError } = await supabase
        .from("profiles")
        .select("id, shop_id, role")
        .eq("id", userId)
        .is("shop_id", null)
        .in("role", ["super_admin", "support"])
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existingProfile) {
        return NextResponse.json({ ok: false, message: "Owner portal user was not found." }, { status: 404 });
      }

      const authUpdate: { email?: string; password?: string } = { email };
      if (password) authUpdate.password = password;

      const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdate);
      if (authError) throw authError;
    } else {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role }
      });

      if (authError || !authData.user) {
        throw authError ?? new Error("Unable to create owner auth user.");
      }

      userId = authData.user.id;
      createdAuthUserId = userId;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          shop_id: null,
          name,
          email,
          phone,
          role,
          is_active: body.isActive ?? true
        },
        { onConflict: "id" }
      )
      .select("id, name, email, phone, role, is_active, last_login_at, created_at")
      .single();

    if (profileError) {
      if (createdAuthUserId) await supabase.auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
      throw profileError;
    }

    return NextResponse.json({ ok: true, user: mapOwnerUser(profile) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to save owner portal user." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  let body: OwnerUserPayload;

  try {
    body = (await request.json()) as OwnerUserPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid owner user payload." }, { status: 400 });
  }

  const userId = body.id?.trim() ?? "";

  if (!userId || typeof body.isActive !== "boolean") {
    return NextResponse.json({ ok: false, message: "Owner user and access state are required." }, { status: 400 });
  }

  try {
    const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner team management is not authorized." }, { status: 401 });
    }

    const { session, supabase } = authorization;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email, phone, role, is_active, last_login_at, created_at")
      .eq("id", userId)
      .is("shop_id", null)
      .in("role", ["super_admin", "support"])
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ ok: false, message: "Owner portal user was not found." }, { status: 404 });
    if (!body.isActive && profile.email.toLowerCase() === session.email) {
      return NextResponse.json({ ok: false, message: "You cannot deactivate your own owner account." }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ is_active: body.isActive })
      .eq("id", userId)
      .select("id, name, email, phone, role, is_active, last_login_at, created_at")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, user: mapOwnerUser(updated) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to update owner portal user." },
      { status: 500 }
    );
  }
}
