import test from "node:test";
import assert from "node:assert/strict";
import { workersTranscription } from "../src/lib/workers-transcription";
test("Workers transcription validates recordings before inference", async () => {
  let calls = 0;
  const ai = { async run() { calls++; return { text: "unused" }; } };
  assert.equal((await workersTranscription("invalid!", ai)).status, 400);
  assert.equal((await workersTranscription(Buffer.alloc(3000001).toString("base64"), ai)).status, 413);
  assert.equal(calls, 0);
});
test("Workers transcription keeps text as an unsaved review draft", async () => {
  const response = await workersTranscription("YXVkaW8=", {
    async run(model, input) {
      assert.equal(model, "@cf/openai/whisper-large-v3-turbo");
      assert.equal(input.audio, "YXVkaW8=");
      return { text: "  Waiting for my setup.  " };
    },
  });
  assert.deepEqual(await response.json(), { text: "Waiting for my setup.", review: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("Workers transcription preserves retry behavior on provider failure", async () => {
  const response = await workersTranscription("YXVkaW8=", { async run() { throw new Error("quota"); } });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Retry or cancel/);
});
