import {
  assistantPrototypeEnabled,
  forwardToLocalAssistant,
  isLoopbackRequest,
} from "@/lib/assistant-prototype";
import { assistantPilotRouteEnabled, forwardToHostedAssistant } from "@/lib/assistant-pilot";
export const runtime = "nodejs";
const notFound = () =>
  Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  // The signed-in pilot is off unless this deployment enables it. The Edge Function checks the account.
  if (assistantPilotRouteEnabled()) return forwardToHostedAssistant(request);
  // Otherwise unavailable outside local synthetic review: no cloud account, no deployed host.
  if (!assistantPrototypeEnabled() || !isLoopbackRequest(request)) return notFound();
  return forwardToLocalAssistant(request);
}
