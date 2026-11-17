import {
  assistantPrototypeEnabled,
  forwardToLocalAssistant,
  isLoopbackRequest,
} from "@/lib/assistant-prototype";
export const runtime = "nodejs";
const notFound = () =>
  Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  // Unavailable outside local synthetic review: no cloud account, no deployed host.
  if (!assistantPrototypeEnabled() || !isLoopbackRequest(request)) return notFound();
  return forwardToLocalAssistant(request);
}
