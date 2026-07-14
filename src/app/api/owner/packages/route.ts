import { NextResponse } from "next/server";
import { isMissingOwnerExtension } from "@/lib/supabase/owner-authorization";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";

type PackagePayload = {
  billingCycle?: "monthly" | "quarterly" | "yearly";
  durationDays?: number;
  name?: string;
  price?: number;
};

export async function GET(request: Request) {
  try {
    const authorization = await getAuthorizedOwnerSession(request);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner package access is not authorized." }, { status: 401 });
    }
    const { supabase } = authorization;

    const { data, error } = await supabase
      .from("owner_packages")
      .select("id, name, billing_cycle, duration_days, price, currency, is_active, created_at, updated_at")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (isMissingOwnerExtension(error)) {
      return NextResponse.json({ ok: true, packages: [], migrationRequired: true });
    }

    if (error) throw error;

    return NextResponse.json({ ok: true, packages: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to load owner packages." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: PackagePayload;

  try {
    body = (await request.json()) as PackagePayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid package payload." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const billingCycle = body.billingCycle;
  const durationDays = Math.max(1, Math.round(Number(body.durationDays ?? 0)));
  const price = Math.max(0, Number(body.price ?? 0));

  if (!name || !billingCycle || !["monthly", "quarterly", "yearly"].includes(billingCycle)) {
    return NextResponse.json({ ok: false, message: "Package name and billing cycle are required." }, { status: 400 });
  }

  try {
    const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner package creation is not authorized." }, { status: 401 });
    }
    const { supabase } = authorization;

    const { data, error } = await supabase
      .from("owner_packages")
      .insert({
        name,
        billing_cycle: billingCycle,
        duration_days: durationDays,
        price,
        currency: "SAR"
      })
      .select("id, name, billing_cycle, duration_days, price, currency, is_active, created_at, updated_at")
      .single();

    if (isMissingOwnerExtension(error)) {
      return NextResponse.json(
        { ok: false, message: "Apply the latest Supabase owner-control migration before creating packages." },
        { status: 409 }
      );
    }

    if (error) throw error;

    return NextResponse.json({ ok: true, package: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to create owner package." },
      { status: 500 }
    );
  }
}
