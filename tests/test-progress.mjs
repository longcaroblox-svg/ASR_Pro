/** Progress measurement contracts — duration-weighted, monotonic, ETA-ready. */

import { test } from "node:test";
import assert from "node:assert/strict";

const { CloudPipeline } = await import("../src/pipeline/orchestrator.js");
const { formatEta, progressSmooth } = await import("../src/ui/telemetry.js");

test("weighted progress — big chunk dominates small chunk", () => {
  const progress = new Map([
    [0, 0],   // 480s chunk untouched
    [1, 100], // 10s chunk fully done
  ]);
  const weights = new Map([
    [0, 480],
    [1, 10],
  ]);
  const avg = CloudPipeline.weightedAverage(progress, weights);
  // Naive average would say 50% — truth is ~2% of media processed.
  assert.ok(avg < 3, `weighted avg should be tiny, got ${avg}`);
  assert.ok(avg > 1.5);
});

test("weighted progress — empty map yields zero", () => {
  assert.equal(CloudPipeline.weightedAverage(new Map(), new Map()), 0);
});

test("ASR band constants — 26..94", () => {
  assert.equal(CloudPipeline.ASR_BASE, 26);
  assert.equal(CloudPipeline.ASR_SPAN, 68);
});

test("formatEta — guards and formats", () => {
  assert.equal(formatEta(10, 0), "--:--");
  assert.equal(formatEta(100, 0.5), "01:40"); // total 200s → remain 100s
  assert.equal(formatEta(3600, 0.5), "1:00:00");
});

test("progressSmooth — monotonic clamp", () => {
  assert.equal(progressSmooth(40, 30), 40);
  assert.equal(progressSmooth(40, 55), 55);
  assert.equal(progressSmooth(99, 120), 100);
});
