/** FULL-PIPELINE E2E: CloudPipeline.run() executed end-to-end on REAL synthetic
 * media (pure-Node audio layer, no mocks in the audio path) + mock cloud session.
 * Proves the happy path actually runs — green unit tests alone once masked a
 * missing import in this exact flow. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { CloudPipeline, MODEL_JIANYING, MODEL_AUTO } = await import("../src/pipeline/orchestrator.js");
const { Options } = await import("../src/core/domain.js");
const { CancelToken } = await import("../src/core/cancel.js");
const { setSession } = await import("../src/decode/http-pool.js");
const { buildMp4Aac, buildWav } = await import("./fixtures.mjs");

function response(payload, status = 200) {
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

/** Mock JianYing cloud: sign → auth → PUT stream → merge → submit → query. */
class MockJianYing {
  constructor() {
    this.uploadedBytes = [];
    this.mergeBody = null;
    this.submitBody = null;
  }
  async request(method, url, opts = {}) {
    return this.#dispatch(url, opts);
  }
  async post(url, opts = {}) {
    return this.#dispatch(url, opts);
  }
  async get(url) {
    assert.ok(url.startsWith("https://vod.bytedanceapi.com/?"), url);
    return response({
      Result: {
        UploadAddress: {
          StoreInfos: [{ StoreUri: "store/uri", Auth: "auth", UploadID: "up" }],
          UploadHosts: ["host.example"],
        },
      },
    });
  }
  async put(url, opts = {}) {
    // Stream factory body — collect bytes to prove disk-streaming works E2E.
    if (typeof opts.body === "function") {
      const stream = opts.body();
      for await (const chunk of stream) this.uploadedBytes.push(chunk);
    }
    assert.ok(url.includes("partNumber=1&uploadID=up"), url);
    return response({ success: 0 });
  }
  #dispatch(url, opts = {}) {
    if (url.endsWith("/upload_sign")) {
      return Promise.resolve(
        response({ ret: "0", data: { access_key_id: "a", secret_access_key: "s", session_token: "t" } }),
      );
    }
    if (url.endsWith("/audio_subtitle/submit")) {
      this.submitBody = JSON.parse(opts.body);
      return Promise.resolve(response({ ret: "0", data: { id: "task-e2e" } }));
    }
    if (url.endsWith("/audio_subtitle/query")) {
      return Promise.resolve(
        response({ ret: "0", data: { utterances: [{ text: "Xin chào bạn", start_time: 0, end_time: 1000 }] } }),
      );
    }
    if (url.includes("uploadID=up") && !url.includes("partNumber")) {
      this.mergeBody = opts.body; // multipart merge commit "1:{crc}"
      return Promise.resolve(response({}));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  }
}

test("CloudPipeline.run() ORIGINAL mode — real MP4 passthrough happy path", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-e2e-run-"));
  const inputPath = path.join(dir, "media.mp4");
  const outputPath = path.join(dir, "media.srt");
  fs.writeFileSync(inputPath, buildMp4Aac({ auCount: 60, mdatChunks: 2 }));

  const mock = new MockJianYing();
  const previousSession = setSession(mock);
  try {
    const progressLog = [];
    const result = await new CloudPipeline(new CancelToken(), (v, m) => progressLog.push([v, m])).run(
      Options({ inputPath, outputPath, model: MODEL_JIANYING, maxWorkers: 2 }),
    );

    // Uploaded payload must be the EXACT ADTS passthrough of all 60 AUs.
    const uploaded = Buffer.concat(mock.uploadedBytes);
    let frames = 0;
    let pos = 0;
    while (pos + 7 <= uploaded.length) {
      assert.equal(uploaded[pos], 0xff);
      assert.equal(uploaded[pos + 1] & 0xf6, 0xf0); // MPEG-4 ADTS, no CRC
      const len = ((uploaded[pos + 3] & 0x03) << 11) | (uploaded[pos + 4] << 3) | (uploaded[pos + 5] >> 5);
      pos += len;
      frames += 1;
    }
    assert.equal(frames, 60);
    assert.equal(pos, uploaded.length);

    // SRT written atomically with raw server ms preserved.
    const srt = fs.readFileSync(outputPath, "utf8");
    assert.ok(srt.includes("00:00:00,000 --> 00:00:01,000"));
    assert.ok(srt.includes("Xin chào bạn"));

    // RAW sidecar keeps server fidelity 1:1.
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "media.raw.json"), "utf8"));
    assert.equal(raw.provider, "JianYing");
    assert.deepEqual(raw.utterances, [{ start_time: 0, end_time: 1000, text: "Xin chào bạn" }]);

    // Metadata sidecar: NO-FALLBACK + passthrough markers.
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "media.json"), "utf8"));
    assert.equal(meta.no_fallback, true);
    assert.equal(meta.jianying_first, true);
    assert.equal(meta.cues, 1);
    assert.equal(meta.audio_passthrough, true);
    assert.equal(meta.audio_kind, "mp4-aac");

    // Result contract.
    assert.equal(result.segments.length, 1);
    assert.equal(result.outputPath, outputPath);
    assert.ok(result.elapsed > 0);

    // Protocol evidence: merge commit received CRC body; submit payload locked.
    assert.match(mock.mergeBody, /^1:[0-9a-f]{8}$/);
    assert.equal(mock.submitBody.words_per_line, 16);
    assert.equal(mock.submitBody.caption_type, 2);
    assert.ok(progressLog.some(([v]) => v === 100));
  } finally {
    setSession(previousSession);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CloudPipeline.run() AUTO mode — composed timeline branch", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-e2e-auto-"));
  const inputPath = path.join(dir, "short.wav");
  const outputPath = path.join(dir, "short.srt");
  fs.writeFileSync(inputPath, buildWav({ seconds: 10, sampleRate: 8000 }));

  const mock = new MockJianYing();
  const previousSession = setSession(mock);
  try {
    // duration=10s < CHUNK_CORE_S → single boundary pair [0,10]; this exercises
    // the AUTO composed-timeline branch (mergeParts+compose+renderSrt) and
    // asserts no raw sidecar is written. True multi-chunk overlap merging is
    // covered by mergeParts/LiveSRTPublisher unit contracts.
    const result = await new CloudPipeline(new CancelToken(), () => {}).run(
      Options({ inputPath, outputPath, model: MODEL_AUTO, maxWorkers: 2 }),
    );
    // AUTO path: composed output must be structurally perfect — single-line
    // cues, monotonic timeline, no overlap. Length is a soft target.
    const srt = fs.readFileSync(outputPath, "utf8");
    const blocks = srt.trim().split("\n\n");
    let prevEndMs = -1;
    for (const block of blocks) {
      const [, timing, ...textLines] = block.split("\n");
      assert.equal(textLines.length, 1, `multi-line cue: ${block}`);
      assert.ok(textLines[0].trim().length > 0, "empty cue text");
      const m = timing.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> /);
      assert.ok(m, `bad timing: ${timing}`);
      const startMs =
        Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + Number(m[4]);
      assert.ok(startMs >= prevEndMs, "overlap/monotonic violation");
      prevEndMs = Number(timing.split(" --> ")[1].replace(/[^\d]/g, ""));
    }
    assert.ok(result.segments.length >= 1);
    assert.ok(!fs.existsSync(path.join(dir, "short.raw.json"))); // AUTO ≠ exact mode

    // Uploaded WAV passthrough: RIFF sizes exact, PCM frame count exact.
    const uploaded = Buffer.concat(mock.uploadedBytes);
    assert.equal(uploaded.toString("latin1", 0, 4), "RIFF");
    assert.equal(uploaded.readUInt32LE(4), uploaded.length - 8);
    const dataBytes = uploaded.readUInt32LE(40);
    assert.equal(dataBytes % 2, 0); // mono 16-bit frames
    assert.equal(dataBytes / 2, 10 * 8000);
  } finally {
    setSession(previousSession);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CloudPipeline.run() surfaces provider errors — NO-FALLBACK", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-e2e-fail-"));
  const inputPath = path.join(dir, "media.mp4");
  const outputPath = path.join(dir, "media.srt");
  fs.writeFileSync(inputPath, buildMp4Aac({ auCount: 10 }));

  class AlwaysFail {
    async request() {
      return Promise.reject(new Error("server exploded"));
    }
    async post() {
      return Promise.reject(new Error("server exploded"));
    }
    async get() {
      return Promise.reject(new Error("server exploded"));
    }
    async put() {
      return Promise.reject(new Error("server exploded"));
    }
  }

  const previousSession = setSession(new AlwaysFail());
  try {
    await assert.rejects(
      new CloudPipeline(new CancelToken(), () => {}).run(
        Options({ inputPath, outputPath, model: MODEL_JIANYING, maxWorkers: 1 }),
      ),
      (exc) => /Đoạn 1 thất bại · JianYing/.test(exc.message),
    );
    assert.ok(!fs.existsSync(outputPath)); // nothing published on failure
  } finally {
    setSession(previousSession);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ORIGINAL byte-exact fidelity — server integers ARE the SRT bytes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-e2e-orig-"));
  const inputPath = path.join(dir, "media.mp4");
  const outputPath = path.join(dir, "media.srt");
  fs.writeFileSync(inputPath, buildMp4Aac({ auCount: 10 }));

  // Adversarial server payload: unicode, >1h timestamps, leading zeros,
  // internal spaces, a text that LOOKS like a timestamp — all must survive
  // byte-for-byte. No rounding, no trimming, no transformation.
  const utterances = [
    { start_time: 440, end_time: 1560, text: "黑市有动静" },
    { start_time: 3661234, end_time: 3661999, text: "01:01:01,234 check" },
    { start_time: 0, end_time: 1, text: " zero-pad" },
    { start_time: 359999999, end_time: 360000000, text: "99:59:59,999 → 100:00:00,000" },
  ];
  class ExactServer {
    async request(method, url, opts = {}) {
      return this.#dispatch(url, opts);
    }
    async post(url, opts = {}) {
      return this.#dispatch(url, opts);
    }
    async get() {
      return response({
        Result: {
          UploadAddress: {
            StoreInfos: [{ StoreUri: "uri", Auth: "auth", UploadID: "up" }],
            UploadHosts: ["host.example"],
          },
        },
      });
    }
    async put() {
      return response({ success: 0 });
    }
    #dispatch(url, opts = {}) {
      if (url.endsWith("/upload_sign")) {
        return Promise.resolve(
          response({ ret: "0", data: { access_key_id: "a", secret_access_key: "s", session_token: "t" } }),
        );
      }
      if (url.endsWith("/audio_subtitle/submit")) {
        return Promise.resolve(response({ ret: "0", data: { id: "t" } }));
      }
      if (url.endsWith("/audio_subtitle/query")) {
        return Promise.resolve(response({ ret: "0", data: { utterances } }));
      }
      if (url.includes("uploadID=")) return Promise.resolve(response({ success: 0 }));
      return Promise.reject(new Error(`unexpected ${url}`));
    }
  }

  const previousSession = setSession(new ExactServer());
  try {
    await new CloudPipeline(new CancelToken(), () => {}).run(
      Options({ inputPath, outputPath, model: MODEL_JIANYING }),
    );

    // Hand-built expectation straight from the server integers above.
    const expected =
      "1\n00:00:00,440 --> 00:00:01,560\n黑市有动静\n\n" +
      "2\n01:01:01,234 --> 01:01:01,999\n01:01:01,234 check\n\n" +
      "3\n00:00:00,000 --> 00:00:00,001\n zero-pad\n\n" +
      "4\n99:59:59,999 --> 100:00:00,000\n99:59:59,999 → 100:00:00,000\n";

    const srt = fs.readFileSync(outputPath, "utf8");
    assert.equal(srt, expected); // BYTE-FOR-BYTE

    // raw.json sidecar is field-for-field the server payload.
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "media.raw.json"), "utf8"));
    assert.equal(raw.provider, "JianYing");
    assert.deepEqual(raw.utterances, utterances);
  } finally {
    setSession(previousSession);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
