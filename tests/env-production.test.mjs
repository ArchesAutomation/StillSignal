// .env.production is committed and compiled into the browser bundle. It may hold only reviewed public flags.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test(".env.production holds only the public Away Days flag", () => {
  const lines = readFileSync(new URL("../.env.production", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter(line => line.trim() !== "");
  assert.deepEqual(lines, ["NEXT_PUBLIC_STILL_SIGNAL_DAY_AWAY=true"]);
});
