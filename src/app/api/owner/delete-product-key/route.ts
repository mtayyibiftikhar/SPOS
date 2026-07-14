import { NextResponse } from "next/server";
import { hashProductKey } from "@/lib/cloud-sync";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";

type DeleteProductKeyRequest = {
  productKey?: string;
};

export async function POST(request: Request) {
  let body: DeleteProductKeyRequest;

  try {
    body = (await request.json()) as DeleteProductKeyRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid product key delete payload." }, { status: 400 });
  }

  const productKey = body.productKey?.trim();

  if (!productKey || productKey.length < 30) {
    return NextResponse.json({ ok: false, message: "A valid product key is required." }, { status: 400 });
  }

  try {
    const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner key delete is not authorized." }, { status: 401 });
    }
    const { supabase } = authorization;
    const { error } = await supabase.from("product_keys").delete().eq("key_hash", hashProductKey(productKey));

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to delete product key." },
      { status: 500 }
    );
  }
}
