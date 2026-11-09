import test from "node:test";
import assert from "node:assert/strict";
import { renderVtt } from "../src/export/vtt.js";
import { renderLrc } from "../src/export/lrc.js";
import { renderTxt } from "../src/export/txt.js";

const sampleCues = [
  { startMs: 1200, endMs: 3500, text: "Xin chào các bạn" },
  { startMs: 3800, endMs: 6200, text: "Chào mừng đến với ASR Studio UltraX" }
];

test("renderVtt produces valid WebVTT output", () => {
  const vtt = renderVtt(sampleCues);
  assert.ok(vtt.startsWith("WEBVTT\n\n"));
  assert.ok(vtt.includes("00:00:01.200 --> 00:00:03.500"));
  assert.ok(vtt.includes("Xin chào các bạn"));
  assert.ok(vtt.includes("00:00:03.800 --> 00:00:06.200"));
});

test("renderLrc produces valid synchronized LRC lyrics", () => {
  const lrc = renderLrc(sampleCues);
  assert.ok(lrc.includes("[00:01.20]Xin chào các bạn"));
  assert.ok(lrc.includes("[00:03.80]Chào mừng đến với ASR Studio UltraX"));
});

test("renderTxt produces clean paragraphs without timestamps", () => {
  const txt = renderTxt(sampleCues);
  assert.strictEqual(txt, "Xin chào các bạn\nChào mừng đến với ASR Studio UltraX\n");
});
