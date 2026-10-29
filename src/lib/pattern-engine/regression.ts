/** Small deterministic OLS model with day-cluster robust covariance.
 * Single-user exploratory analysis. Complete cases only; no imputing observations. */
export type RegressionRow = { day: string; y: number; x: number[] };
const transpose = (a: number[][]) => a[0].map((_, i) => a.map((row) => row[i]));
const multiply = (a: number[][], b: number[][]) =>
  a.map((row) =>
    b[0].map((_, j) => row.reduce((sum, v, i) => sum + v * b[i][j], 0)),
  );
function invert(matrix: number[][]) {
  const n = matrix.length,
    a = matrix.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    ]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++)
      if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    if (Math.abs(a[pivot][i]) < 1e-10) return null;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    const divisor = a[i][i];
    a[i] = a[i].map((v) => v / divisor);
    for (let j = 0; j < n; j++)
      if (j !== i) {
        const factor = a[j][i];
        a[j] = a[j].map((v, k) => v - factor * a[i][k]);
      }
  }
  return a.map((row) => row.slice(n));
}
export function regression(input: RegressionRow[], labels: string[]) {
  const rows = input.filter(
      (r) =>
        r.x.length === labels.length && [r.y, ...r.x].every(Number.isFinite),
    ),
    days = [...new Set(rows.map((r) => r.day))],
    n = rows.length,
    p = labels.length + 1,
    excluded = input.length - n;
  if (days.length < 30 || n < Math.max(100, 10 * p))
    return {
      available: false as const,
      reason:
        "Requires at least 100 complete executions across 30 independent recorded days.",
      n,
      days: days.length,
      excluded,
    };
  const means = labels.map((_, i) => rows.reduce((s, r) => s + r.x[i], 0) / n),
    scales = labels.map((_, i) =>
      Math.sqrt(rows.reduce((s, r) => s + (r.x[i] - means[i]) ** 2, 0) / n),
    );
  if (scales.some((s) => s < 1e-9))
    return {
      available: false as const,
      reason: "A selected predictor has no usable variation.",
      n,
      days: days.length,
      excluded,
    };
  const x = rows.map((r) => [
      1,
      ...r.x.map((v, i) => (v - means[i]) / scales[i]),
    ]),
    xt = transpose(x),
    inverse = invert(multiply(xt, x));
  if (!inverse)
    return {
      available: false as const,
      reason:
        "Predictors are redundant or collinear; choose different variables.",
      n,
      days: days.length,
      excluded,
    };
  const b = multiply(
      multiply(inverse, xt),
      rows.map((r) => [r.y]),
    ).map((r) => r[0]),
    residuals = rows.map(
      (r, i) => r.y - x[i].reduce((sum, v, j) => sum + v * b[j], 0),
    );
  const meat = Array.from({ length: p }, () => Array(p).fill(0) as number[]);
  for (const day of days) {
    const score = Array(p).fill(0) as number[];
    for (let i = 0; i < n; i++)
      if (rows[i].day === day)
        for (let j = 0; j < p; j++) score[j] += x[i][j] * residuals[i];
    for (let j = 0; j < p; j++)
      for (let k = 0; k < p; k++) meat[j][k] += score[j] * score[k];
  }
  const correction = ((days.length / (days.length - 1)) * (n - 1)) / (n - p),
    covariance = multiply(multiply(inverse, meat), inverse),
    ymean = rows.reduce((s, r) => s + r.y, 0) / n,
    tss = rows.reduce((s, r) => s + (r.y - ymean) ** 2, 0),
    rss = residuals.reduce((s, r) => s + r * r, 0);
  // Each slope is reported per original recorded unit. Intercept is centered at mean predictor values.
  const coefficients = ["At mean predictor values", ...labels].map(
    (name, i) => ({
      name,
      estimate: b[i] / (i ? scales[i - 1] : 1),
      standardError:
        Math.sqrt(Math.max(0, covariance[i][i] * correction)) /
        (i ? scales[i - 1] : 1),
    }),
  );
  return {
    available: true as const,
    n,
    days: days.length,
    excluded,
    coefficients,
    rSquared: tss > 0 ? 1 - rss / tss : null,
  };
}
