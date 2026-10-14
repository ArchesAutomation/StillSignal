import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "npm:zod@4.6.7";
import { boundedJson } from "./validation.ts";
import { canonicalJson } from "./brokers/security.ts";
import { checked, failure, service } from "./server.ts";
const schema = z.object({
  webhookId: z.string().min(1).max(160),
  userId: z.string().regex(/^pulse-[a-f0-9-]{36}$/),
  clientId: z.string(),
  eventType: z.string().min(1).max(80),
  eventTimestamp: z.iso.datetime({ offset: true }),
});
export async function POST(request: Request) {
  try {
    const secret = Deno.env.get("SNAPTRADE_CONSUMER_KEY");
    if (!secret) throw new Error("NOT_CONFIGURED");
    const body = await boundedJson(request, 100000),
      signature = Buffer.from(request.headers.get("Signature") || "", "base64");
    const expected = createHmac("sha256", secret)
      .update(canonicalJson(body))
      .digest();
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(signature, expected)
    )
      throw new Error("UNAUTHORIZED");
    const p = schema.parse(body);
    if (
      p.clientId !== Deno.env.get("SNAPTRADE_CLIENT_ID") ||
      Date.parse(p.eventTimestamp) > Date.now() + 300000 ||
      Date.parse(p.eventTimestamp) < Date.now() - 7 * 86400000
    )
      throw new Error("UNAUTHORIZED");
    const db = service(),
      result = await db.rpc("pulse_accept_broker_receipt", {
        p_user: p.userId.slice(6),
        p_id: p.webhookId,
        p_type: p.eventType,
      });
    checked(result.error);
    // Receipt and account-discovery queue are durable before acknowledging. No provider calls here.
    return Response.json(
      { accepted: true },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
