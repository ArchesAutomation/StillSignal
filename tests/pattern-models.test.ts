import { test } from "node:test";
import assert from "node:assert/strict";
import { regression } from "../src/lib/pattern-engine/regression";
import {
  describe,
  difference,
  type ComparisonGroup,
  type EvidenceRow,
} from "../src/lib/pattern-engine/compare";
test("multivariable associations require independent-day coverage and preserve recorded units", () => {
  const rows = Array.from({ length: 120 }, (_, i) => {
    const x1 = (i % 7) + i / 100,
      x2 = ((i * 3) % 11) - i / 90;
    return {
      day: String(Math.floor(i / 4)),
      x: [x1, x2],
      y: 10 + 2 * x1 - 3 * x2,
    };
  });
  assert.equal(
    regression(rows.slice(0, 40), ["Sleep", "Caffeine"]).available,
    false,
  );
  const model = regression(rows, ["Sleep", "Caffeine"]);
  assert.equal(model.available, true);
  if (model.available) {
    assert.ok(Math.abs(model.coefficients[1].estimate - 2) < 1e-8);
    assert.ok(Math.abs(model.coefficients[2].estimate + 3) < 1e-8);
    assert.ok(Math.abs(model.rSquared! - 1) < 1e-8);
    assert.equal(model.days, 30);
  }
  assert.equal(
    regression(
      rows.map((r) => ({ ...r, x: [r.x[0], r.x[0] * 2] })),
      ["A", "B"],
    ).available,
    false,
  );
});
test("day-cluster uncertainty preserves paired conditions from the same days", () => {
  const group = (offset: number): ComparisonGroup => {
    const values = Array.from({ length: 8 }, (_, i) => i * 100 + offset),
      rows = values.map(
        (_, i) =>
          ({ day: String(i), session: { id: String(i) } }) as EvidenceRow,
      );
    return {
      key: String(offset),
      values,
      rows,
      stats: describe(values),
      days: 8,
      sessions: 8,
      coverage: 1,
    };
  };
  const result = difference(group(0), group(1));
  assert.equal(result.effect, 1);
  assert.ok(result.interval);
  assert.ok(Math.abs(result.interval![0] - 1) < 1e-8);
  assert.ok(Math.abs(result.interval![1] - 1) < 1e-8);
  const a = group(0),
    b = group(1);
  a.days = 1;
  assert.equal(difference(a, b).interval, null);
});
