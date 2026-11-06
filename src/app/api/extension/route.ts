import { extensionActionSchema } from "@/lib/journal-command";
import { boundedJson } from "@/lib/validation";
import { forwardToSupabase } from "@/lib/edge-proxy";
import { workersTranscription } from "@/lib/workers-transcription";
import { env } from "cloudflare:workers";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const body = extensionActionSchema.parse(await boundedJson(request, 4100000));
    const upstream = await forwardToSupabase(request, "pulse-extension", body);
    if (body.action !== "transcribe" || upstream.status !== 503) return upstream;
    const detail = await upstream.clone().json().catch(() => ({})) as { error?: string };
    // The existing service authenticates, rate-limits and validates the recording
    // before reporting that its optional transcription provider is unavailable.
    if (!detail.error?.includes("Remote transcription is not configured")) return upstream;
    return workersTranscription(body.audio, env.AI);
  } catch {
    return Response.json({ error: "Invalid journal request." }, {
      status: 400, headers: { "Cache-Control": "no-store" },
    });
  }
}
