// Run only against a dedicated staging deployment and dedicated test accounts.
// Account JSON: [{"id":"<user UUID>","token":"<Supabase access token>"}, ...]. Never commit it.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
const origin = process.env.LOAD_TEST_URL;
if (!origin || !process.env.LOAD_TEST_USERS_FILE)
  throw new Error(
    "Set LOAD_TEST_URL and LOAD_TEST_USERS_FILE for a staging deployment.",
  );
const url = new URL(origin);
if (url.protocol !== "https:")
  throw new Error("Use an HTTPS staging deployment.");
const users = JSON.parse(
  await readFile(process.env.LOAD_TEST_USERS_FILE, "utf8"),
);
const concurrency = Number(process.env.LOAD_TEST_USERS || 10),
  rounds = Number(process.env.LOAD_TEST_ROUNDS || 3);
if (
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > users.length ||
  concurrency > 1000
)
  throw new Error(
    "Supply a unique test account for each virtual user (1–1000).",
  );
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100)
  throw new Error("Use 1–100 rounds.");
if (new Set(users.slice(0, concurrency).map((u) => u.id)).size !== concurrency)
  throw new Error("Virtual users must have distinct accounts.");
const times = [],
  statuses = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function request(user, body) {
  const begin = performance.now();
  const response = await fetch(new URL("/api/data", url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  times.push(performance.now() - begin);
  statuses[response.status] = (statuses[response.status] || 0) + 1;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
let failures = 0;
await Promise.all(
  users.slice(0, concurrency).map(async (user, index) => {
    const id = randomUUID(),
      start = Date.now();
    let created = false;
    try {
      await sleep(index * 10);
      await request(user, {
        action: "save",
        session: {
          id,
          owner: user.id,
          startedAt: start,
          name: "STAGING LOAD TEST",
          source: "whoop",
          sampleCount: 0,
          events: [],
          journal: [],
        },
      });
      created = true;
      for (let i = 0; i < rounds; i++) {
        await request(user, {
          action: "batch",
          sessionId: id,
          batchId: randomUUID(),
          samples: Array.from({ length: 30 }, (_, j) => ({
            t: start + (i * 30 + j) * 1000,
            bpm: 75 + (j % 5),
          })),
        });
        await request(user, { action: "get", sessionId: id });
        if (i < rounds - 1) await sleep(30000);
      }
    } catch {
      failures++;
    } finally {
      if (created)
        try {
          await request(user, { action: "delete", sessionId: id });
        } catch {
          failures++;
        }
    }
  }),
);
times.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      concurrency,
      rounds,
      requests: times.length,
      failures,
      statuses,
      p50_ms: times[Math.floor(times.length * 0.5)],
      p95_ms: times[Math.floor(times.length * 0.95)],
      p99_ms: times[Math.floor(times.length * 0.99)],
    },
    null,
    2,
  ),
);
if (failures) process.exitCode = 1;
