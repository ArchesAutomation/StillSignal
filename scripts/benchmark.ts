import { performance } from "node:perf_hooks";
import { downsample, summary } from "../src/lib/analytics";
const samples = Array.from({ length: 100000 }, (_, i) => ({
  t: i * 1000,
  bpm: Math.round(75 + 25 * Math.sin(i / 37)),
}));
const times: number[] = [];
for (let i = 0; i < 100; i++) {
  const start = performance.now();
  summary(samples, 0, 300);
  downsample(samples, 600);
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      scope: "Local computation only; not a production concurrency test",
      samples: samples.length,
      iterations: 100,
      renderedPoints: downsample(samples, 600).length,
      p50_ms: +times[50].toFixed(2),
      p95_ms: +times[95].toFixed(2),
    },
    null,
    2,
  ),
);
