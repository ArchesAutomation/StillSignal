import assert from "node:assert/strict";
const origin = new URL(process.env.STILL_SIGNAL_SMOKE_ORIGIN || "https://still-signal.archesautomation.workers.dev").origin;
const get = (path, options = {}) => fetch(origin + path, { ...options, signal: AbortSignal.timeout(20000), redirect: "manual" });
const health = await get("/api/health");
assert.equal(health.status, 200, "health endpoint");
assert.equal(health.headers.get("cache-control"), "no-store");
const status = await health.json();
assert.equal(status.cloudConfigured, true, "Supabase public configuration is present");
assert.equal(status.authenticationRequired, true);
assert.equal(status.exampleData, false);
const page = await get("/");
assert.equal(page.status, 200, "application page");
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.match(page.headers.get("content-security-policy") || "", /ipfurgwqqjkybhadzutj\.supabase\.co/);
assert.match(await page.text(), /Still Signal/);
for (const [path, body] of [
  ["/api/data", {}],
  ["/api/process", {}],
  ["/api/brokers", { action: "status" }],
  ["/api/market", { action: "status" }],
  ["/api/extension", { action: "context" }],
  ["/api/extension", { action: "transcribe", audio: "YXVkaW8=", mime: "audio/webm", durationMs: 1000 }],
]) {
  const response = await get(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(response.status, 401, path + " rejects anonymous requests");
  assert.equal(response.headers.get("cache-control"), "no-store", path + " must not cache account responses");
}
const extension = await get("/trade-pulse-voice-extension.zip");
assert.equal(extension.status, 200, "extension package");
const bytes = new Uint8Array(await extension.arrayBuffer());
assert.ok(bytes.length > 1000 && bytes[0] === 0x50 && bytes[1] === 0x4b, "installable ZIP package");
console.log(JSON.stringify({ origin, health: "passed", pageAndSecurityHeaders: "passed", anonymousApiIsolation: "passed", extensionDownload: "passed" }));
