/** Pipeline unit contracts: boundaries, merge, similarity, engine resolve, progress. */

import { test } from "node:test";
import assert from "node:assert/strict";

const { boundaries } = await import("../src/audio/silence.js");
const { PERF } = await import("../src/core/config.js");
const { Segment } = await import("../src/core/domain.js");
const { mergeParts, similarity } = await import("../src/pipeline/merge.js");
const { MODEL_AUTO, MODEL_JIANYING, resolveProvider, validateModel } = await import("../src/pipeline/load-balance.js");
const { progressSmooth } = await import("../src/ui/telemetry.js");

test("boundaries prefer silence", () => {
  assert.deepEqual(boundaries(1300, [598.0, 1203.0], 600, 55), [0.0, 598.0, 1203.0, 1300]);
});

test("boundary fallback to exact target", () => {
  assert.equal(boundaries(700, [], PERF.CHUNK_CORE_S)[1], PERF.CHUNK_CORE_S);
});

test("merge exact overlap duplicate", () => {
  const parts = [
    [Segment({ start: 0, end: 2, text: "Xin chào" }), Segment({ start: 590, end: 601, text: "Đoạn cuối" })],
    [Segment({ start: 599, end: 604, text: "Đoạn cuối" }), Segment({ start: 604, end: 608, text: "Tiếp theo" })],
  ];
  assert.deepEqual(mergeParts(parts).map((x) => x.text), ["Xin chào", "Đoạn cuối", "Tiếp theo"]);
});

test("merge fuzzy keeps longer", () => {
  const parts = [
    [Segment({ start: 590, end: 601, text: "chúng ta bắt đầu bài học" })],
    [Segment({ start: 591, end: 602, text: "Chúng ta bắt đầu bài học." })],
  ];
  const merged = mergeParts(parts);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "Chúng ta bắt đầu bài học.");
});

test("similarity identical", () => {
  assert.equal(similarity("Hello", "hello"), 1.0);
});

test("engine resolution — NO-FALLBACK: one model, one engine", () => {
  assert.equal(resolveProvider(MODEL_JIANYING), "JianYing");
  assert.equal(resolveProvider(MODEL_AUTO), "JianYing");
  assert.throws(() => validateModel("Whisper large-v3"), /không hợp lệ/);
});

test("progress monotonic", () => {
  assert.equal(progressSmooth(40, 30), 40);
  assert.equal(progressSmooth(40, 55), 55);
});
