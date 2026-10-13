import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeHeartRate,
  downsample,
  eventWindow,
  nearest,
  summary,
} from "../src/lib/analytics";
import { parseTrades } from "../src/lib/csv";
import {
  actionSchema,
  boundedJson,
  webhookSchema,
} from "../src/lib/validation";
import type { TradeEvent } from "../src/lib/model";
test("BLE reads 8-bit, 16-bit and rejects truncation/contact loss", () => {
  assert.equal(
    decodeHeartRate(new DataView(Uint8Array.from([0, 85]).buffer)),
    85,
  );
  assert.equal(
    decodeHeartRate(new DataView(Uint8Array.from([1, 150, 0]).buffer)),
    150,
  );
  assert.equal(
    decodeHeartRate(new DataView(Uint8Array.from([1, 85]).buffer)),
    null,
  );
  assert.equal(
    decodeHeartRate(new DataView(Uint8Array.from([4, 85]).buffer)),
    null,
  );
  assert.equal(
    decodeHeartRate(new DataView(Uint8Array.from([6, 85]).buffer)),
    85,
  );
  assert.equal(
    decodeHeartRate(new DataView(Uint8Array.from([0, 0]).buffer)),
    null,
  );
});
test("baseline uses only opening window and reports gaps", () => {
  const s = [
    { t: 0, bpm: 60 },
    { t: 1000, bpm: 80 },
    { t: 20000, bpm: 120 },
  ];
  const r = summary(s, 0, 2);
  assert.equal(r.baseline, 70);
  assert.equal(r.peak, 120);
  assert.equal(r.gaps, 1);
  assert.equal(summary([], 0, 300).baseline, null);
});
test("downsampling preserves peaks and keeps ordered, bounded output", () => {
  const s = Array.from({ length: 100000 }, (_, i) => ({
    t: i * 1000,
    bpm: i === 35219 ? 200 : 70,
  }));
  const result = downsample(s, 600);
  assert.ok(result.length <= 600);
  assert.equal(Math.max(...result.map((p) => p.bpm)), 200);
  assert.equal(result[0].t, 0);
  assert.equal(result.at(-1)!.t, s.at(-1)!.t);
  assert.ok(result.every((p, i) => !i || p.t >= result[i - 1].t));
});
test("event window does not fabricate absent heart rate", () => {
  const event: TradeEvent = {
    id: "e",
    t: 100000,
    symbol: "NQ",
    kind: "entry",
    side: "long",
    price: 100,
    quantity: 1,
    source: "manual",
  };
  const s = [{ t: 0, bpm: 60 }];
  assert.equal(eventWindow(s, event, 15).at, null);
  assert.equal(eventWindow(s, event, 15).before, null);
  assert.equal(nearest(s, 1000)?.bpm, 60);
});
test("CSV enforces explicit timezones, valid numbers and stable IDs", () => {
  const csv =
    "timestamp,symbol,kind,side,price,quantity,pnl\n2026-10-12T12:00:00Z,NQ,entry,long,100,1,\n";
  const a = parseTrades(csv);
  assert.equal(a[0].id, parseTrades(csv)[0].id);
  assert.equal(a[0].pnl, undefined);
  assert.throws(
    () => parseTrades(csv.replace("12:00:00Z", "12:00:00")),
    /timezone/,
  );
  assert.throws(() => parseTrades(csv.replace(",100,1,", ",,1,")), /price/);
});
test("batch size and webhook payload limits reject malformed input", () => {
  const base = {
    action: "batch",
    sessionId: "11111111-1111-4111-8111-111111111111",
    batchId: "22222222-2222-4222-8222-222222222222",
    samples: Array.from({ length: 121 }, () => ({ t: 1, bpm: 70 })),
  };
  assert.equal(actionSchema.safeParse(base).success, false);
  assert.equal(
    webhookSchema.safeParse({ token: "bad", event: {} }).success,
    false,
  );
});
test("body limit works without trusting Content-Length", async () => {
  await assert.rejects(
    boundedJson(
      new Request("https://example.test", {
        method: "POST",
        body: "x".repeat(20),
      }),
      10,
    ),
    /TOO_LARGE/,
  );
});
