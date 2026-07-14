import { NextResponse } from "next/server";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";

type DeleteDeviceActivationRequest = {
  deviceActivationId?: string;
  shopId?: string;
  allForShop?: boolean;
};

export async function POST(request: Request) {
  let body: DeleteDeviceActivationRequest;

  try {
    body = (await request.json()) as DeleteDeviceActivationRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid device removal payload." }, { status: 400 });
  }

  const deviceActivationId = body.deviceActivationId?.trim();
  const shopId = body.shopId?.trim();

  if (!deviceActivationId && !(body.allForShop && shopId)) {
    return NextResponse.json({ ok: false, message: "Connected device id is required." }, { status: 400 });
  }

  try {
    const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner device removal is not authorized." }, { status: 401 });
    }
    const { supabase } = authorization;
    const query = supabase.from("device_activations").delete();
    const { error } = body.allForShop && shopId ? await query.eq("shop_id", shopId) : await query.eq("id", deviceActivationId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to remove connected device." },
      { status: 500 }
    );
  }
}
