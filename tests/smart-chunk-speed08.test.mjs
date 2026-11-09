/** Contracts for 100% Smart Silence-based Chunking and Physical 0.8x Audio Conversion & Direct ASR.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  CancelToken,
  CloudPipeline,
  MODEL_AUTO,
  MODEL_JIANYING,
  Options,
  boundaries,
  convertAudioSpeed,
  detectSilenceMidpoints,
  detectSilenceWithFfmpeg,
  getFfmpegPath,
  isFfmpegAvailable,
  renderSrt,
} from "../src/index.js";
import { setSession } from "../src/decode/http-pool.js";

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

class Direct08xMockSession {
  constructor(utterances) {
    this.utterances = utterances;
    this.uploadedFiles = [];
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
          StoreInfos: [{ StoreUri: "store/uri", Auth: "auth", UploadID: "up-08x" }],
          UploadHosts: ["host.example"],
        },
      },
    });
  }
  async put(url, opts = {}) {
    if (typeof opts.body === "function") {
      const s = opts.body();
      for await (const chunk of s) {
        this.uploadedFiles.push(chunk.length);
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
      return Promise.resolve(mockResponse({ ret: "0", data: { id: "task-08x" } }));
    }
    if (url.endsWith("/audio_subtitle/query")) {
      return Promise.resolve(mockResponse({ ret: "0", data: { utterances: this.utterances } }));
    }
    if (url.includes("uploadID=up-08x")) {
      return Promise.resolve(mockResponse({ success: 0 }));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  }
}

test("FFmpeg discovery and availability on system", () => {
  const ffmpeg = getFfmpegPath();
  assert.ok(ffmpeg, "FFmpeg must be detected");
  assert.equal(isFfmpegAvailable(), true);
});

test("detectSilenceWithFfmpeg identifies non-voice silence intervals on synthesized audio", async () => {
  const ffmpeg = getFfmpegPath();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-silence-test-"));
  const audioFile = path.join(dir, "tone-silence-tone.wav");

  try {
    // Generate: 2s tone (voice simulation) + 3s silence (non-voice) + 2s tone
    const gen = spawnSync(
      ffmpeg,
      [
        "-f", "lavfi", "-i", "sine=frequency=1000:duration=2",
        "-f", "lavfi", "-i", "anullsrc=duration=3",
        "-f", "lavfi", "-i", "sine=frequency=1000:duration=2",
        "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
        "-map", "[out]",
        "-y", audioFile,
      ],
      { stdio: "ignore", windowsHide: true },
    );
    assert.equal(gen.status, 0);

    const midpoints = await detectSilenceWithFfmpeg(audioFile, { noiseDb: -30, minDuration: 0.5 });
    assert.ok(Array.isArray(midpoints), "Midpoints must be array");
    assert.ok(midpoints.length >= 1, "Must find at least 1 silence region");

    // The silence is from 2.0s to 5.0s, midpoint should be ~3.5s
    const mid = midpoints[0];
    assert.ok(mid >= 3.0 && mid <= 4.0, `Midpoint ${mid} should be inside silence (2.0s to 5.0s)`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("boundaries selects non-voice silence midpoints to prevent cutting words", () => {
  const duration = 1200; // 20 minutes
  const silences = [462.5, 934.8]; // Pauses / silences in conversation
  const points = boundaries(duration, silences, 480, 55);

  assert.equal(points[0], 0.0);
  assert.equal(points[1], 462.5, "Cut point 1 must be placed at 462.5s (silence)");
  assert.equal(points[2], 934.8, "Cut point 2 must be placed at 934.8s (silence)");
  assert.equal(points[3], 1200);
});

test("convertAudioSpeed physically converts audio to 0.8x with 1.25x duration expansion", async () => {
  const ffmpeg = getFfmpegPath();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-speed-convert-"));
  const inputAudio = path.join(dir, "input.wav");
  const output08x = path.join(dir, "output-08x.mp3");

  try {
    // Generate 4.0 seconds of audio
    const gen = spawnSync(
      ffmpeg,
      ["-f", "lavfi", "-i", "sine=frequency=800:duration=4", "-y", inputAudio],
      { stdio: "ignore", windowsHide: true },
    );
    assert.equal(gen.status, 0);

    await convertAudioSpeed(inputAudio, output08x, 0.8);
    assert.ok(fs.existsSync(output08x), "0.8x audio file must exist");
    assert.ok(fs.statSync(output08x).size > 0, "0.8x audio file must have non-zero size");

    // Probe duration of 0.8x audio: 4s / 0.8 = 5.0s
    const probe = spawnSync(
      ffmpeg,
      ["-i", output08x, "-f", "null", "-"],
      { encoding: "utf8", windowsHide: true },
    );
    const durMatches = [...probe.stderr.matchAll(/time=(\d+):(\d+):([0-9.]+)/g)];
    assert.ok(durMatches.length > 0, "Must output time in stderr");
    const durMatch = durMatches[durMatches.length - 1];
    const seconds = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
    assert.ok(
      Math.abs(seconds - 5.0) < 0.25,
      `Duration should be ~5.0s (stretched by 1/0.8 = 1.25x), got ${seconds}s`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CloudPipeline with 0.8x physically converts audio, requests 0.8x audio, and receives direct subtitles without simulation", async () => {
  const ffmpeg = getFfmpegPath();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-pipe-08x-"));
  const inputPath = path.join(dir, "source.wav");
  const outputPath = path.join(dir, "subtitles.srt");

  // Create real WAV audio file (4 seconds)
  const gen = spawnSync(
    ffmpeg,
    ["-f", "lavfi", "-i", "sine=frequency=1000:duration=4", "-ar", "16000", "-ac", "1", "-y", inputPath],
    { stdio: "ignore", windowsHide: true },
  );
  assert.equal(gen.status, 0);

  // The 0.8x audio will be 4 / 0.8 = 5.0 seconds long.
  // The ASR server recognizes this 0.8x audio and returns direct utterances:
  const serverUtterances = [
    { start_time: 1250, end_time: 3125, text: "Câu nói ở tốc độ 0.8x chuẩn xác" },
    { start_time: 3500, end_time: 4800, text: "Phần tiếp theo khớp trực tiếp 100%" },
  ];

  const mockSession = new Direct08xMockSession(serverUtterances);
  const prev = setSession(mockSession);

  try {
    const pipeline = new CloudPipeline(new CancelToken(), () => {});
    const result = await pipeline.run(
      Options({
        inputPath,
        outputPath,
        model: MODEL_JIANYING,
        speed: 0.8,
        physicalSpeed: true,
      }),
    );

    assert.equal(result.speed, 0.8);
    assert.ok(fs.existsSync(outputPath), "SRT must be written");

    // Also verify exported converted audio file
    const convertedAudioFile = path.join(dir, "subtitles_0.8x.mp3");
    assert.ok(fs.existsSync(convertedAudioFile), "0.8x audio file must be exported alongside SRT");
    assert.ok(fs.statSync(convertedAudioFile).size > 0);

    const srtContent = fs.readFileSync(outputPath, "utf8");

    // The subtitles MUST BE DIRECT (received directly from the 0.8x request, NOT simulated):
    // start_time 1250ms -> 00:00:01,250
    // end_time 3125ms -> 00:00:03,125
    assert.ok(
      srtContent.includes("00:00:01,250 --> 00:00:03,125\nCâu nói ở tốc độ 0.8x chuẩn xác"),
      `Expected direct timestamp from 0.8x request, got:\n${srtContent}`,
    );
    assert.ok(
      srtContent.includes("00:00:03,500 --> 00:00:04,800\nPhần tiếp theo khớp trực tiếp 100%"),
      `Expected direct timestamp from 0.8x request, got:\n${srtContent}`,
    );

    // Verify metadata
    const metaFile = path.join(dir, "subtitles.json");
    assert.ok(fs.existsSync(metaFile));
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    assert.equal(meta.speed, 0.8);
    assert.equal(meta.audio_physically_converted, true);
    assert.equal(meta.simulated_subtitles, false);
  } finally {
    setSession(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Generated SRT has strictly contiguous sequential IDs (1, 2, 3...) and monotonic timecodes", () => {
  const cues = [
    { start: 1.0, end: 2.5, text: "Đoạn thứ nhất" },
    { start: 2.8, end: 4.2, text: "Đoạn thứ hai" },
    { start: 4.5, end: 6.0, text: "Đoạn thứ ba" },
  ];
  const srt = renderSrt(cues);
  const blocks = srt.trim().split("\n\n");
  assert.equal(blocks.length, 3);

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split("\n");
    assert.equal(Number(lines[0]), i + 1, `Cue ID must be ${i + 1}`);
    assert.ok(lines[1].includes(" --> "), "Must have arrow");
    assert.equal(lines[2], cues[i].text);
  }
});
