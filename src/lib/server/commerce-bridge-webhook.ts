import "server-only";

import { createHmac } from "node:crypto";

type CommerceWebhookPayload = {
  event_type: string;
  store_id: string;
  [key: string]: unknown;
};

export async function sendCommerceBridgeWebhook(eventId: string, payload: CommerceWebhookPayload) {
  const url = process.env.COMMERCE_BRIDGE_WEBHOOK_URL?.trim();
  const secret = process.env.COMMERCE_BRIDGE_WEBHOOK_SECRET?.trim();
  const profile = process.env.COMMERCE_BRIDGE_PROFILE?.trim();

  if (!url || !secret || !profile) return { configured: false, delivered: false };

  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  try {
    const response = await fetch(url, {
      body,
      headers: {
        "Content-Type": "application/json",
        "X-GFCB-Event-Id": eventId,
        "X-GFCB-Profile": profile,
        "X-GFCB-Signature": signature,
        "X-GFCB-Timestamp": timestamp
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000)
    });

    return { configured: true, delivered: response.ok, status: response.status };
  } catch {
    return { configured: true, delivered: false };
  }
}
