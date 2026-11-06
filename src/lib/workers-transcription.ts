import { Buffer } from "node:buffer";
type Transcriber = {
  run(model: "@cf/openai/whisper-large-v3-turbo", input: { audio: string }): Promise<{ text?: string }>;
};
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
export async function workersTranscription(audio: string, ai: Transcriber) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio))
    return json({ error: "Invalid recording." }, 400);
  if (Buffer.from(audio, "base64").length > 3000000)
    return json({ error: "Recording exceeds the 3 MB limit." }, 413);
  try {
    const result = await ai.run("@cf/openai/whisper-large-v3-turbo", { audio });
    const text = typeof result.text === "string" ? result.text.trim() : "";
    // This fallback supplies no calibrated confidence; the trader reviews it.
    return json({ text, review: true });
  } catch {
    return json({ error: "Transcription failed. Retry or cancel the local recording." }, 503);
  }
}
