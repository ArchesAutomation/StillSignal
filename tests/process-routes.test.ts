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

test("the process proxy explains a rejected field instead of returning Invalid request", async () => {
  const result = await POST(new Request("https://example.test/api/process", {
    method: "POST", headers: { Authorization: "Bearer test" },
    body: JSON.stringify({ action: "list", kind: "day", after: "bad-cursor" }),
  }));
  assert.equal(result.status, 400);
  const body = await result.json();
  assert.match(body.error, /local records are preserved/);
  assert.equal(body.fields[0].field, "after");
  assert.ok(body.fields[0].message);
});
