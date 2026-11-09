/** SRT export contracts: exact ms, compose/render, raw ms, atomic write. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { exactMsToSrt } = await import("../src/export/timestamp-guard.js");
const { renderSrt, rawSrt, atomicWrite } = await import("../src/export/srt.js");
const { compose, validate } = await import("../src/export/timeline.js");
const { Segment, Word } = await import("../src/core/domain.js");

test("exact ms", () => {
  assert.equal(exactMsToSrt(3_661_234), "01:01:01,234");
});

test("compose and render", () => {
  const words = [
    Word({ start: 0, end: 0.4, text: " Xin" }),
    Word({ start: 0.4, end: 0.8, text: " chào" }),
    Word({ start: 0.8, end: 1.2, text: " bạn." }),
  ];
  const cues = compose([Segment({ start: 0, end: 1.2, text: "Xin chào bạn.", words })], 42, 7, 0.7);
  assert.deepEqual(validate(cues), []);
  const s = renderSrt(cues);
  assert.ok(s.includes("00:00:00,000 --> 00:00:01,200"));
  assert.ok(s.includes("Xin chào bạn."));
});

test("raw srt keeps server ms without float round-trip", () => {
  const cues = [Segment({ start: 0, end: 1, text: "A", rawStartMs: 0, rawEndMs: 1000 })];
  assert.ok(rawSrt(cues).includes("00:00:00,000 --> 00:00:01,000"));
});

test("atomic write round-trip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-test-"));
  try {
    const filePath = path.join(dir, "out.srt");
    atomicWrite(filePath, "1\n00:00:00,000 --> 00:00:01,000\nHi\n");
    assert.ok(fs.readFileSync(filePath, "utf8").startsWith("1\n"));
    assert.ok(!fs.existsSync(filePath + ".partial"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
