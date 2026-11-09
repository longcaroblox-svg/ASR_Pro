/** Hardening contracts from recursive audit rounds — regression locks. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { mapAsCompleted } = await import("../src/pipeline/work-queue.js");
const { CancelToken } = await import("../src/core/cancel.js");
const { ASRError, CancelledError } = await import("../src/core/errors.js");
const { similarity } = await import("../src/pipeline/merge.js");
const { parseArgs } = await import("../src/cli.js");
const { LiveSRTPublisher } = await import("../src/export/live-publisher.js");
const { Options } = await import("../src/core/domain.js");

test("mapAsCompleted yields every job exactly once despite same-tick settlement", async () => {
  const items = [0, 1, 2, 3, 4, 5];
  const seen = [];
  for await (const [item] of mapAsCompleted(async (n) => n * 2, items, { maxWorkers: 3 })) {
    seen.push(item);
  }
  seen.sort((a, b) => a - b);
  assert.deepEqual(seen, items); // nothing dropped
});

test("mapAsCompleted surfaces job errors as [item, Error]", async () => {
  const results = [];
  for await (const [item, outcome] of mapAsCompleted(
    (n) => {
      if (n === 1) throw new Error("boom");
      return n;
    },
    [0, 1, 2],
    { maxWorkers: 2 },
  )) {
    results.push([item, outcome]);
  }
  assert.equal(results.length, 3);
  const errEntry = results.find(([, o]) => o instanceof Error);
  assert.ok(errEntry && errEntry[0] === 1);
});

test("mapAsCompleted rejects invalid maxWorkers", async () => {
  await assert.rejects(async () => {
    // eslint-disable-next-line no-unused-vars
    for await (const _ of mapAsCompleted((x) => x, [1], { maxWorkers: NaN })) {
      /* consume */
    }
  }, TypeError);
});

test("mapAsCompleted honors cancel token mid-stream", async () => {
  const token = new CancelToken();
  let first = true;
  await assert.rejects(async () => {
    for await (const [, outcome] of mapAsCompleted(async (n) => n, [0, 1, 2], {
      maxWorkers: 1,
      token,
    })) {
      void outcome;
      if (first) {
        first = false;
        token.cancel();
      }
    }
  }, CancelledError);
});

test("casefold parity: ß folds to ss", () => {
  assert.equal(similarity("Straße", "STRASSE"), 1.0);
});

function extname(p) {
  const base = p.replace(/\\/g, "/").split("/").pop();
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx) : "";
}

test("extensionless output derivation", () => {
  const derive = (inputPath) => {
    const e = extname(inputPath);
    return e ? inputPath.slice(0, -e.length) + ".srt" : inputPath + ".srt";
  };
  assert.equal(derive("D:/abs/recording"), "D:/abs/recording.srt");
  assert.equal(derive("video.mp4"), "video.srt");
  assert.equal(derive(".env"), ".env.srt");
});

test("cli parseArgs strictness", () => {
  const opts = parseArgs(["in.mp4", "--workers", "8"]);
  assert.equal(opts.workers, 8);
  assert.equal(opts.input, "in.mp4");
  assert.throws(() => parseArgs(["in.mp4", "--model"]), ASRError);
  assert.throws(() => parseArgs(["in.mp4", "--workers", "5abc"]), ASRError);
  assert.throws(() => parseArgs(["in.mp4", "--model", "whisper"]), /không hợp lệ/);
  assert.throws(() => parseArgs(["a.mp4", "b.mp4"]), /Thừa đối số/);
  assert.throws(() => parseArgs(["in.mp4", "-o", "-x"]), ASRError);
});

test("live publisher waits for contiguous prefix", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-live-pub-"));
  try {
    const outPath = path.join(dir, "out.srt");
    const options = Options({ inputPath: path.join(dir, "in.mp4"), outputPath: outPath });
    const publisher = new LiveSRTPublisher(outPath, options, { exact: true });
    const seg = (s) => [{ startMs: s * 1000, endMs: (s + 1) * 1000, text: `t${s}`, words: [] }];
    assert.deepEqual(publisher.onChunkDone(2, seg(20)), []); // out of order → nothing yet
    assert.deepEqual(publisher.onChunkDone(1, seg(10)), []);
    const cues = publisher.onChunkDone(0, seg(0)); // prefix closes → all three
    assert.equal(cues.length, 3);
    assert.deepEqual(publisher.published.map((p) => p[0].startMs), [0, 10000, 20000]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
