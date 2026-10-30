import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/process/route";
test("command center proxy authenticates before parsing and bounds every request", async () => {
  const request = (body: string, authenticated = true) =>
    new Request("https://example.test/api/process", {
      method: "POST",
      headers: authenticated ? { Authorization: "Bearer test" } : {},
      body,
    });
  assert.equal((await POST(request("invalid JSON", false))).status, 401);
  assert.equal(
    (
      await POST(
        request(JSON.stringify({ action: "list", kind: "private_table" })),
      )
    ).status,
    400,
  );
  assert.equal((await POST(request("x".repeat(512001)))).status, 413);
  assert.equal(
    (await POST(request(JSON.stringify({ action: "list", kind: "day" }))))
      .status,
    503,
    "Unconfigured cloud fails clearly; local storage remains independent",
  );
});
