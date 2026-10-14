import { extensionActionSchema } from "@/lib/journal-command";
import { boundedJson } from "@/lib/validation";
import { forwardToSupabase } from "@/lib/edge-proxy";
import { gateway } from "@ai-sdk/gateway";
import { transcribe } from "ai";
import { Buffer } from "node:buffer";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const body = extensionActionSchema.parse(await boundedJson(request,4100000));
    if (body.action === "transcribe" && (process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY)) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio)) return Response.json({error:"Invalid recording."},{status:400});
      const bytes = Buffer.from(body.audio,"base64");
      if (bytes.length > 3000000) return Response.json({error:"Recording exceeds the 3 MB limit."},{status:413});
      const auth = await forwardToSupabase(request,"pulse-extension",{action:"transcription-authorize"});
      if (!auth.ok) return auth;
      try {
        const result = await transcribe({
          model: gateway.transcriptionModel("openai/whisper-1"),
          audio: bytes,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(45000),
          telemetry: { recordInputs: false, recordOutputs: false },
        });
        const text = result.text.trim();
        // Gateway exposes timing segments but does not currently return Whisper's
        // confidence fields. Missing speech segments require an explicit review.
        const review = !text || text.length > 2000 || !result.segments.length;
        return Response.json({text,review},{headers:{"Cache-Control":"no-store"}});
      } catch {
        return Response.json({error:"Transcription failed. Retry or cancel the local recording."},{status:503});
      }
    }
    return forwardToSupabase(request,"pulse-extension",body);
  } catch {
    return Response.json({error:"Invalid journal request."},{status:400});
  }
}
