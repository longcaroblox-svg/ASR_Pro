/** Contracts for 0.5x–1.5x playback speed scaling, Chinese (CJK) subtitle
 * segmentation/alignment/merge perfection, instant CancelToken wakeup, and GUI APIs. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import {
  CancelToken,
  CloudPipeline,
  MODEL_AUTO,
  MODEL_JIANYING,
  Options,
  SPEED_MAX,
  SPEED_MIN,
  Segment,
  Word,
  buildCues,
  mergeParts,
  normalizeSpeed,
  scaleRangeMs,
  setSession,
  splitSentences,
  validateNetflix,
} from "../src/index.js";
import { parseArgs } from "../src/cli.js";
import { buildMp4Aac, buildWav } from "./fixtures.mjs";

function mockResponse(payload, status = 200) {
  const body = JSON.stringify(payload);
  return {
    status,
    ok: status < 400,
    headers: {},
    header: () => undefined,
    text: () => body,
    json: () => JSON.parse(body),
  };
}

class SpeedMockJianYing {
  constructor(utterances) {
    this.utterances = utterances;
  }
  async request(method, url, opts = {}) {
    return this.#dispatch(url, opts);
  }
  async post(url, opts = {}) {
    return this.#dispatch(url, opts);
  }
  async get() {
    return mockResponse({
      Result: {
        UploadAddress: {
          StoreInfos: [{ StoreUri: "store/uri", Auth: "auth", UploadID: "up" }],
          UploadHosts: ["host.example"],
        },
      },
    });
  }
  async put(url, opts = {}) {
    if (typeof opts.body === "function") {
      const s = opts.body();
      for await (const _ of s) {
        /* drain */
      }
    }
    return mockResponse({ success: 0 });
  }
  #dispatch(url) {
    if (url.endsWith("/upload_sign")) {
      return Promise.resolve(
        mockResponse({ ret: "0", data: { access_key_id: "a", secret_access_key: "s", session_token: "t" } }),
      );
    }
    if (url.endsWith("/audio_subtitle/submit")) {
      return Promise.resolve(mockResponse({ ret: "0", data: { id: "task-speed" } }));
    }
    if (url.endsWith("/audio_subtitle/query")) {
      return Promise.resolve(mockResponse({ ret: "0", data: { utterances: this.utterances } }));
    }
    if (url.includes("uploadID=up")) {
      return Promise.resolve(mockResponse({ success: 0 }));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  }
}

test("normalizeSpeed and scaleRangeMs enforce 0.5x–1.5x precision", () => {
  assert.equal(normalizeSpeed(undefined), 1.0);
  assert.equal(normalizeSpeed(0.5), 0.5);
  assert.equal(normalizeSpeed("1.25x"), 1.25);
  assert.equal(normalizeSpeed(1.5), 1.5);
  assert.equal(normalizeSpeed(1.2500004), 1.25);
  assert.throws(() => normalizeSpeed(0.49), /0\.5x – 1\.5x/);
  assert.throws(() => normalizeSpeed(1.51), /0\.5x – 1\.5x/);
  assert.throws(() => normalizeSpeed(NaN), /0\.5x – 1\.5x/);
  assert.equal(SPEED_MIN, 0.5);
  assert.equal(SPEED_MAX, 1.5);

  // At 0.5x (half speed), video takes 2x longer -> timestamps double.
  assert.deepEqual(scaleRangeMs(1000, 2500, 0.5), [2000, 5000]);
  // At 1.25x, 1000ms -> 800ms, 2500ms -> 2000ms.
  assert.deepEqual(scaleRangeMs(1000, 2500, 1.25), [800, 2000]);
  // At 1.5x, 1500ms -> 1000ms, 3000ms -> 2000ms.
  assert.deepEqual(scaleRangeMs(1500, 3000, 1.5), [1000, 2000]);
});

test("CLI parseArgs supports --speed 0.5..1.5 and rejects out-of-range values", () => {
  const p1 = parseArgs(["input.mp4", "--speed", "1.25x"]);
  assert.equal(p1.speed, 1.25);
  const p2 = parseArgs(["input.mp4", "--speed", "0.5"]);
  assert.equal(p2.speed, 0.5);
  assert.throws(() => parseArgs(["input.mp4", "--speed", "0.4"]), /--speed/);
  assert.throws(() => parseArgs(["input.mp4", "--speed", "1.8"]), /--speed/);
});

test("CloudPipeline ORIGINAL 1:1 mode scales timestamps accurately for 1.25x and 0.5x", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-speed-orig-"));
  const inputPath = path.join(dir, "clip.mp4");
  const outFast = path.join(dir, "clip-125.srt");
  const outSlow = path.join(dir, "clip-050.srt");
  fs.writeFileSync(inputPath, buildMp4Aac({ auCount: 20 }));

  const utterances = [
    { start_time: 1000, end_time: 2500, text: "第一句字幕" },
    { start_time: 3000, end_time: 4500, text: "第二句字幕" },
  ];
  const prev = setSession(new SpeedMockJianYing(utterances));
  try {
    const resFast = await new CloudPipeline(new CancelToken(), () => {}).run(
      Options({ inputPath, outputPath: outFast, model: MODEL_JIANYING, speed: 1.25 }),
    );
    assert.equal(resFast.speed, 1.25);
    const srtFast = fs.readFileSync(outFast, "utf8");
    // 1000/1.25 = 800, 2500/1.25 = 2000; 3000/1.25 = 2400, 4500/1.25 = 3600
    assert.ok(srtFast.includes("00:00:00,800 --> 00:00:02,000\n第一句字幕"));
    assert.ok(srtFast.includes("00:00:02,400 --> 00:00:03,600\n第二句字幕"));

    const metaFast = JSON.parse(fs.readFileSync(path.join(dir, "clip-125.json"), "utf8"));
    assert.equal(metaFast.speed, 1.25);
    assert.ok(Math.abs(metaFast.scaled_duration_seconds - metaFast.duration_seconds / 1.25) < 0.01);

    const resSlow = await new CloudPipeline(new CancelToken(), () => {}).run(
      Options({ inputPath, outputPath: outSlow, model: MODEL_JIANYING, speed: 0.5 }),
    );
    assert.equal(resSlow.speed, 0.5);
    const srtSlow = fs.readFileSync(outSlow, "utf8");
    // 1000/0.5 = 2000, 2500/0.5 = 5000; 3000/0.5 = 6000, 4500/0.5 = 9000
    assert.ok(srtSlow.includes("00:00:02,000 --> 00:00:05,000\n第一句字幕"));
    assert.ok(srtSlow.includes("00:00:06,000 --> 00:00:09,000\n第二句字幕"));
  } finally {
    setSession(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CloudPipeline AUTO mode scales composed timeline for 1.5x speed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-speed-auto-"));
  const inputPath = path.join(dir, "clip.wav");
  const outPath = path.join(dir, "clip.srt");
  fs.writeFileSync(inputPath, buildWav({ seconds: 8, sampleRate: 8000 }));

  const utterances = [
    { start_time: 1500, end_time: 4500, text: "大家好，欢迎来到今天的节目。" },
  ];
  const prev = setSession(new SpeedMockJianYing(utterances));
  try {
    const res = await new CloudPipeline(new CancelToken(), () => {}).run(
      Options({ inputPath, outputPath: outPath, model: MODEL_AUTO, speed: 1.5 }),
    );
    assert.equal(res.speed, 1.5);
    assert.equal(res.segments.length, 1);
    // 1.5s / 1.5 = 1.0s start; 4.5s / 1.5 = 3.0s end
    assert.ok(Math.abs(res.segments[0].start - 1.0) < 1e-6);
    assert.ok(Math.abs(res.segments[0].end - 3.0) < 1e-6);
  } finally {
    setSession(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Chinese (CJK) unpunctuated utterances WITH word timings never fuse across segments", () => {
  // JianYing returns word-level timestamps on unpunctuated Chinese utterances.
  // Phase 2 must NOT fuse them into a giant run-on with ASCII spaces.
  const segs = [
    Segment({
      start: 0.5,
      end: 1.8,
      text: "大家好我是程秋",
      words: [
        Word({ start: 0.5, end: 1.0, text: "大家好" }),
        Word({ start: 1.0, end: 1.8, text: "我是程秋" }),
      ],
    }),
    Segment({
      start: 2.0,
      end: 3.2,
      text: "今天给大家带来新作品",
      words: [
        Word({ start: 2.0, end: 2.5, text: "今天" }),
        Word({ start: 2.5, end: 3.2, text: "给大家带来新作品" }),
      ],
    }),
  ];
  const { cues } = buildCues(segs, {});
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "大家好我是程秋");
  assert.equal(cues[1].text, "今天给大家带来新作品");
  assert.ok(!cues[0].text.includes(" "));
  assert.ok(!cues[1].text.includes(" "));
});

test("Chinese (CJK) multi-sentence and clause splitting with word timings preserves zero-space Hanzi", () => {
  assert.deepEqual(splitSentences("你好世界。今天天气真好！我们出发吧？"), [
    "你好世界。",
    "今天天气真好！",
    "我们出发吧？",
  ]);

  // Multi-sentence with word timings:
  const words = [
    Word({ start: 0.0, end: 0.4, text: "你好" }),
    Word({ start: 0.4, end: 0.9, text: "世界。" }),
    Word({ start: 1.2, end: 1.7, text: "今天" }),
    Word({ start: 1.7, end: 2.4, text: "天气真好！" }),
  ];
  const { cues: sentCues } = buildCues(
    [Segment({ start: 0.0, end: 2.4, text: "你好世界。今天天气真好！", words })],
    {},
  );
  assert.equal(sentCues.length, 2);
  assert.equal(sentCues[0].text, "你好世界。");
  assert.equal(sentCues[0].start, 0.0);
  assert.ok(sentCues[0].end >= 0.9);
  assert.equal(sentCues[1].text, "今天天气真好！");
  assert.equal(sentCues[1].start, 1.2);

  // Overlong Chinese sentence (> 28 Hanzi = > 56 visual units) with Chinese comma `，`:
  const longClauseWords = [
    Word({ start: 0.0, end: 1.2, text: "在这个充满挑战与机遇的全新时代里，" }),
    Word({ start: 1.5, end: 3.0, text: "每一个人都需要不断学习新的知识与技能。" }),
  ];
  const longText = longClauseWords.map((w) => w.text).join("");
  const { cues: clauseCues } = buildCues(
    [Segment({ start: 0.0, end: 3.0, text: longText, words: longClauseWords })],
    {},
  );
  assert.equal(clauseCues.length, 2);
  assert.equal(clauseCues[0].text, "在这个充满挑战与机遇的全新时代里，");
  assert.equal(clauseCues[1].text, "每一个人都需要不断学习新的知识与技能。");
  assert.deepEqual(validateNetflix(clauseCues), []);
});

test("Chinese (CJK) overlap deduplication weights Hanzi at 2x and prefers punctuated text", () => {
  // 6 Hanzi = 12 visual info units -> uses MERGE_THRESHOLD (0.78) instead of 0.92.
  // 5 of 6 Hanzi match -> similarity = 5/6 = 0.833 >= 0.78 -> deduplicated cleanly.
  const merged = mergeParts([
    [Segment({ start: 9.0, end: 11.0, text: "今天天气真好" })],
    [Segment({ start: 9.05, end: 11.05, text: "今天天气很好。" })],
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "今天天气很好。");
});

test("CancelToken.onCancel fires immediately on cancel()", () => {
  const token = new CancelToken();
  let fired = 0;
  const unsub = token.onCancel(() => {
    fired += 1;
  });
  unsub();
  let firedActive = 0;
  token.onCancel(() => {
    firedActive += 1;
  });
  token.cancel();
  assert.equal(fired, 0);
  assert.equal(firedActive, 1);
  // Subscribing after already cancelled fires synchronously:
  let firedLate = 0;
  token.onCancel(() => {
    firedLate += 1;
  });
  assert.equal(firedLate, 1);
});

test("Web GUI serves localhost/127.0.0.1 and HTTP 206 Range media streaming", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-gui-test-"));
  const mediaPath = path.join(dir, "sample.wav");
  const wavBuf = buildWav({ seconds: 1, sampleRate: 8000 });
  fs.writeFileSync(mediaPath, wavBuf);

  // Pick a high ephemeral port via env before importing gui.js
  const testPort = 18760 + Math.floor(Math.random() * 5000);
  process.env.ASR_GUI_PORT = String(testPort);
  const { startGui } = await import(`../src/gui.js?port=${testPort}`);
  const server = await startGui({ openBrowser: false });

  const requestGui = (reqPath, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: testPort,
          path: reqPath,
          method: "GET",
          headers,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        },
      );
      req.on("error", reject);
      req.end();
    });

  try {
    // 1. Accepts Host: localhost:<port> (previously rejected with 403)
    const homeRes = await requestGui("/", { Host: `localhost:${testPort}` });
    assert.equal(homeRes.status, 200);
    assert.ok(homeRes.body.toString("utf8").includes("speedSlider"));

    // 2. HTTP 206 Partial Content Range request on /api/media
    const rangeRes = await requestGui(
      `/api/media?path=${encodeURIComponent(mediaPath)}`,
      { Host: `127.0.0.1:${testPort}`, Range: "bytes=0-15" },
    );
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers["content-range"], `bytes 0-15/${wavBuf.length}`);
    assert.equal(rangeRes.body.length, 16);
    assert.deepEqual(rangeRes.body, wavBuf.subarray(0, 16));

    // 3. /api/fs returns roots and parent
    const fsRes = await requestGui(`/api/fs?path=${encodeURIComponent(dir)}`, {
      Host: `localhost:${testPort}`,
    });
    assert.equal(fsRes.status, 200);
    const fsData = JSON.parse(fsRes.body.toString("utf8"));
    assert.ok(Array.isArray(fsData.roots) && fsData.roots.length > 0);
    assert.ok(fsData.entries.some((e) => e.name === "sample.wav"));
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
