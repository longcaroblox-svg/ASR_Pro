/** Pure-Node audio layer contracts — MP4 demux, ADTS wrap, MP3 scan, WAV split,
 * single-pass cutter, router sniffing. Fixtures are structurally valid synthetic
 * media; the code under test is the production path (no mocks). */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32 } from "../src/decode/crc32-fast.js";

const { inspectMedia } = await import("../src/audio/media.js");
const { inspectMp4, parseAsc, adtsHeader, adtsProfile } = await import("../src/audio/mp4.js");
const { inspectMp3 } = await import("../src/audio/mp3.js");
const { inspectWav, wavHeader } = await import("../src/audio/wav.js");
const { cutUnits } = await import("../src/audio/cut.js");
const { buildMp4Aac, buildMp3, buildWav } = await import("./fixtures.mjs");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "asr-audio-"));
}

test("parseAsc — known AudioSpecificConfig vectors", () => {
  const lc441stereo = parseAsc(Buffer.from([0x12, 0x10]));
  assert.deepEqual(lc441stereo, { audioObjectType: 2, freqIdx: 4, sampleRate: 44100, chanCfg: 2 });
  const heAacv2 = parseAsc(Buffer.from([0x13, 0x88])); // AOT2 fidx7(22050) chan1
  assert.equal(heAacv2.sampleRate, 22050);
  assert.equal(heAacv2.chanCfg, 1);
});

test("adtsProfile — SBR/PS collapse to LC implicit signaling", () => {
  assert.equal(adtsProfile(2), 1);
  assert.equal(adtsProfile(5), 1); // HE-AAC → LC + in-band
  assert.equal(adtsProfile(29), 1); // HE-AACv2
  assert.equal(adtsProfile(1), 0);
  assert.throws(() => adtsProfile(39), /ADTS/);
});

test("adtsHeader — exact bit layout vs reference bytes", () => {
  const h = adtsHeader(7, 1, 1, 100);
  assert.equal(h.length, 7);
  assert.equal(h[0], 0xff);
  assert.equal(h[1], 0xf1);
  assert.equal(h[2] >> 6, 1); // profile
  assert.equal((h[2] >> 2) & 0x0f, 7); // freq idx
  assert.equal(h[3] >> 6, 1); // chan cfg low bits
  const len = ((h[3] & 0x03) << 11) | (h[4] << 3) | (h[5] >> 5);
  assert.equal(len, 107); // payload + 7
  assert.throws(() => adtsHeader(7, 1, 1, 0x2000), /ADTS frame limit/);
});

test("MP4 demux — AU count, duration, dts grid on multi-mdat fixture", () => {
  const dir = tmp();
  try {
    const p = path.join(dir, "a.mp4");
    fs.writeFileSync(p, buildMp4Aac({ auCount: 120, mdatChunks: 5, sampleRate: 22050, channels: 1 }));
    const meta = inspectMedia(p);
    assert.equal(meta.kind, "mp4-aac");
    assert.equal(meta.track.auCount, 120);
    assert.ok(Math.abs(meta.durationS - (120 * 1024) / 22050) < 0.002);
    // dts grid is arithmetic: dts(i) = i*1024/rate
    for (const i of [0, 1, 57, 119]) {
      assert.ok(Math.abs(meta.track.auDtsS(i) - (i * 1024) / 22050) < 1e-9);
    }
    // monotonic positions across all chunks
    let prev = -1;
    for (const au of meta.track.iterateAus()) {
      assert.ok(au.pos >= prev);
      prev = au.pos;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cutUnits — byte-exact raw passthrough and fused CRC equals whole-file zlib", async () => {
  const dir = tmp();
  try {
    const p = path.join(dir, "a.mp4");
    fs.writeFileSync(p, buildMp4Aac({ auCount: 80, mdatChunks: 3, seed: 99 }));
    const meta = inspectMedia(p);
    const [out] = await cutUnits(meta, [
      { fromAu: 0, toAuExcl: meta.track.auCount, outPath: path.join(dir, "full.raw"), wrap: "raw" },
    ]);
    const src = fs.readFileSync(p);
    const cut = fs.readFileSync(path.join(dir, "full.raw"));
    let cursor = 0;
    let ok = true;
    for (let i = 0; i < meta.track.auCount; i++) {
      const loc = meta.track.auLocation(i);
      if (!cut.subarray(cursor, cursor + loc.size).equals(src.subarray(loc.pos, loc.pos + loc.size))) {
        ok = false;
        break;
      }
      cursor += loc.size;
    }
    assert.ok(ok, "per-AU bytes must be identical");
    assert.equal(cut.length, cursor);
    assert.equal(out.crcHex, (crc32(cut) >>> 0).toString(16).padStart(8, "0"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cutUnits — overlapping windows fan out from ONE pass; every window complete", async () => {
  const dir = tmp();
  try {
    const p = path.join(dir, "a.mp4");
    fs.writeFileSync(p, buildMp4Aac({ auCount: 100, mdatChunks: 4, seed: 7 }));
    const meta = inspectMedia(p);
    const t = meta.track;
    const ranges = [
      { fromAu: 0, toAuExcl: 60, outPath: path.join(dir, "w0.bin"), wrap: "raw" },
      { fromAu: 55, toAuExcl: 100, outPath: path.join(dir, "w1.bin"), wrap: "raw" },
    ];
    const results = await cutUnits(meta, ranges);
    assert.equal(results.length, 2);
    const src = fs.readFileSync(p);
    const sliceBytes = (from, to) => {
      const parts = [];
      for (let i = from; i < to; i++) {
        const l = t.auLocation(i);
        parts.push(src.subarray(l.pos, l.pos + l.size));
      }
      return Buffer.concat(parts);
    };
    const w0 = fs.readFileSync(path.join(dir, "w0.bin"));
    const w1 = fs.readFileSync(path.join(dir, "w1.bin"));
    assert.ok(w0.equals(sliceBytes(0, 60)));
    assert.ok(w1.equals(sliceBytes(55, 100)));
    // overlap region present in BOTH outputs
    const shared = sliceBytes(55, 60);
    assert.ok(w0.includes(shared));
    assert.ok(w1.includes(shared));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cutUnits — ADTS output parses as a clean frame chain", async () => {
  const dir = tmp();
  try {
    const p = path.join(dir, "a.mp4");
    fs.writeFileSync(p, buildMp4Aac({ auCount: 50, mdatChunks: 2 }));
    const meta = inspectMedia(p);
    const [res] = await cutUnits(meta, [
      { fromAu: 10, toAuExcl: 30, outPath: path.join(dir, "clip.aac"), wrap: "adts" },
    ]);
    const buf = fs.readFileSync(path.join(dir, "clip.aac"));
    let pos = 0;
    let frames = 0;
    while (pos < buf.length) {
      assert.equal(buf[pos], 0xff);
      assert.equal(buf[pos + 1], 0xf1);
      const len = ((buf[pos + 3] & 0x03) << 11) | (buf[pos + 4] << 3) | (buf[pos + 5] >> 5);
      pos += len;
      frames += 1;
    }
    assert.equal(frames, 20);
    assert.equal(res.size, buf.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("MP3 scanner — ID3 skip, exact frame math, CBR run collapse", () => {
  const dir = tmp();
  try {
    const p = path.join(dir, "a.mp3");
    fs.writeFileSync(p, buildMp3({ frames: 300, withId3: true }));
    const meta = inspectMedia(p);
    assert.equal(meta.kind, "mp3");
    assert.equal(meta.resyncs, 0);
    assert.equal(meta.track.auCount, 300);
    assert.ok(Math.abs(meta.durationS - (300 * 1152) / 44100) < 1e-9);
    assert.equal(meta.track.auLocation(150).size, 417);
    assert.ok(Math.abs(meta.track.auDtsS(150) - (150 * 1152) / 44100) < 1e-9);
    assert.equal(meta.track.auIndexAtS(1.0), Math.floor(44100 / 1152));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("WAV passthrough — RIFF header sizes exact after cut", async () => {
  const dir = tmp();
  try {
    const p = path.join(dir, "a.wav");
    fs.writeFileSync(p, buildWav({ seconds: 4, sampleRate: 8000, channels: 1 }));
    const meta = inspectMedia(p);
    assert.equal(meta.track.auCount, 32000);
    const [res] = await cutUnits(meta, [
      { fromAu: 8000, toAuExcl: 24000, outPath: path.join(dir, "mid.wav"), wrap: "wav" },
    ]);
    const cut = fs.readFileSync(path.join(dir, "mid.wav"));
    assert.equal(cut.length, res.size); // writer size includes the 44B header
    assert.equal(cut.toString("latin1", 0, 4), "RIFF");
    assert.equal(cut.readUInt32LE(40), 16000 * 2); // data bytes
    assert.equal(cut.readUInt32LE(24), 8000); // sample rate preserved
    // PCM content matches source range exactly.
    const src = fs.readFileSync(p);
    assert.ok(cut.subarray(44).equals(src.subarray(44 + 8000 * 2, 44 + 24000 * 2)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("router — garbage input is a loud hard error naming the sniffed magic", () => {
  const dir = tmp();
  try {
    const p = path.join(dir, "junk.bin");
    fs.writeFileSync(p, Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02, 0x03]));
    assert.throws(() => inspectMedia(p), /Định dạng không nhận diện được.*deadbeef/s);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("NO-FALLBACK — encrypted audio track refuses loudly", () => {
  const dir = tmp();
  try {
    // enca entry instead of mp4a — reuse builder then patch format tag.
    const buf = buildMp4Aac({ auCount: 8 });
    const idx = buf.indexOf(Buffer.from("mp4a", "latin1"));
    buf.write("enca", idx, "latin1");
    const p = path.join(dir, "drm.mp4");
    fs.writeFileSync(p, buf);
    assert.throws(() => inspectMedia(p), /(DRM|không có audio track hỗ trợ)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("REAL TikTok file — demux invariants hold on production media", () => {
  const realPath = "D:/Hao-Pc/window/window/hao/Downloads/SaveTik.io_7674193013408681279_hd.mp4";
  if (!fs.existsSync(realPath)) return; // fixture absent on other machines
  const meta = inspectMedia(realPath);
  assert.equal(meta.kind, "mp4-aac");
  assert.ok(meta.durationS > 90 && meta.durationS < 105);
  let prevPos = -1;
  let total = 0;
  for (const au of meta.track.iterateAus()) {
    assert.ok(au.pos > prevPos);
    assert.ok(au.size > 0);
    prevPos = au.pos;
    total += au.size;
  }
  assert.ok(total > 500_000); // ~0.66MB audio track seen earlier
});
