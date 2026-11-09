/**
 * Test Suite: ASR Studio UltraX v9.0.0 Algorithmic & Architectural Primitives
 *
 * Direct unit tests for:
 * 1. Pure-Node ADTS AAC Frame Scanner (src/audio/aac.js)
 * 2. Myers 32-bit Bit-Parallel Edit Distance & Sequence Matcher (src/pipeline/merge.js)
 * 3. Word-Timestamped Suffix-Prefix Seam Splicer (src/pipeline/merge.js)
 * 4. Knuth-Plass / Viterbi Dynamic Programming Subtitle Partitioning (src/export/netflix.js)
 * 5. GCRA Virtual-Time Rate Governor (src/decode/rate-governor.js)
 * 6. Slice-by-16 Vectorized CRC32 pure-JS fallback vs Native zlib (src/decode/crc32-fast.js)
 * 7. Fragmented MP4 (moof/traf/trun) demuxing (src/audio/mp4.js)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import {
  parseAdtsHeaderInto,
  inspectAac,
} from "../src/audio/aac.js";
import {
  myersEditDistance,
  sequenceRatio,
  similarity,
  trySplicePartialOverlap,
} from "../src/pipeline/merge.js";
import {
  chooseOptimalBreaksDP,
  visualLen,
  NETFLIX,
} from "../src/export/netflix.js";
import { TokenBucket } from "../src/decode/rate-governor.js";
import { crc32, crc32Fallback, crc32Hex } from "../src/decode/crc32-fast.js";
import { inspectMp4, inspectMedia } from "../src/index.js";
import { Segment, Word } from "../src/core/domain.js";
import { ASRError } from "../src/core/errors.js";

// Helper to construct synthetic ADTS frame bytes
function buildSyntheticAdtsFrame({ sampleRateIdx = 4, channelCfg = 2, payloadLen = 100 } = {}) {
  const frameLen = 7 + payloadLen;
  const b = Buffer.alloc(frameLen);
  // Byte 0: 0xFF
  b[0] = 0xff;
  // Byte 1: 0xF1 (MPEG-4, Layer 00, Protection Absent = 1)
  b[1] = 0xf1;
  // Byte 2: profile=01 (AAC LC) << 6 | freqIdx << 2 | chanCfg >> 2
  b[2] = ((1 << 6) | ((sampleRateIdx & 0x0f) << 2) | ((channelCfg >> 2) & 0x01)) & 0xff;
  // Byte 3: chanCfg low 2 bits << 6 | frameLen >> 11
  b[3] = (((channelCfg & 0x03) << 6) | ((frameLen >> 11) & 0x03)) & 0xff;
  // Byte 4: frameLen middle 8 bits
  b[4] = (frameLen >> 3) & 0xff;
  // Byte 5: frameLen low 3 bits << 5 | 0x1f (buffer fullness top 5 bits)
  b[5] = (((frameLen & 0x07) << 5) | 0x1f) & 0xff;
  // Byte 6: buffer fullness low 6 bits | raw blocks = 0
  b[6] = 0xfc;
  // Payload (fill with deterministic pseudo-audio)
  for (let i = 7; i < frameLen; i++) {
    b[i] = (i * 37) & 0xff;
  }
  return b;
}

test("v9 AAC ADTS — parseAdtsHeaderInto parses bit-exact ADTS headers and rejects bad sync", () => {
  const scratch = {
    profile: 0,
    freqIdx: 0,
    sampleRate: 0,
    chanCfg: 0,
    frameLength: 0,
    headerLen: 0,
    samplesPerFrame: 0,
  };

  // Valid 44100Hz stereo frame with 100-byte payload (total length 107)
  const validFrame = buildSyntheticAdtsFrame({ sampleRateIdx: 4, channelCfg: 2, payloadLen: 100 });
  const ok = parseAdtsHeaderInto(validFrame, scratch);
  assert.equal(ok, true);
  assert.equal(scratch.profile, 1); // AAC-LC
  assert.equal(scratch.freqIdx, 4);
  assert.equal(scratch.sampleRate, 44100);
  assert.equal(scratch.chanCfg, 2);
  assert.equal(scratch.frameLength, 107);
  assert.equal(scratch.headerLen, 7);
  assert.equal(scratch.samplesPerFrame, 1024);

  // Corrupted sync word byte 0
  const badSync = Buffer.from(validFrame);
  badSync[0] = 0xfe;
  assert.equal(parseAdtsHeaderInto(badSync, scratch), false);

  // Corrupted sync word byte 1
  const badSync2 = Buffer.from(validFrame);
  badSync2[1] = 0x00;
  assert.equal(parseAdtsHeaderInto(badSync2, scratch), false);

  // Invalid frequency index (13 >= table length)
  const badFreq = Buffer.from(validFrame);
  badFreq[2] = ((1 << 6) | (13 << 2) | 0) & 0xff;
  assert.equal(parseAdtsHeaderInto(badFreq, scratch), false);
});

test("v9 AAC ADTS — inspectAac accurately demuxes raw ADTS stream and supports random-access unit iteration", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-v9-aac-"));
  const aacPath = path.join(tmpDir, "stream.aac");
  try {
    const frameCount = 30;
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      // Alternate frame sizes to test VBR run collapsing and index resolution
      const payloadLen = 60 + (i % 5) * 10;
      frames.push(buildSyntheticAdtsFrame({ sampleRateIdx: 4, channelCfg: 2, payloadLen }));
    }
    const fullStream = Buffer.concat(frames);
    fs.writeFileSync(aacPath, fullStream);

    const aacMeta = inspectAac(aacPath);
    assert.equal(aacMeta.kind, "aac");
    assert.equal(aacMeta.track.sampleRate, 44100);
    assert.equal(aacMeta.track.auCount, frameCount);
    // 30 frames * 1024 / 44100 = ~0.696598s
    assert.ok(Math.abs(aacMeta.durationS - (frameCount * 1024) / 44100) < 1e-4);

    // Verify auDtsS progression
    assert.equal(aacMeta.track.auDtsS(0), 0);
    assert.ok(Math.abs(aacMeta.track.auDtsS(1) - 1024 / 44100) < 1e-6);

    // Verify auLocation
    const loc0 = aacMeta.track.auLocation(0);
    assert.equal(loc0.pos, 0);
    assert.equal(loc0.size, frames[0].length);

    // Iterate Aus
    const aus = [...aacMeta.track.iterateAus(0, frameCount)];
    assert.equal(aus.length, frameCount);
    assert.equal(aus[0].pos, 0);

    // Verify inspectMedia routes raw .aac to inspectAac
    const genericMeta = inspectMedia(aacPath);
    assert.equal(genericMeta.kind, "aac");
    assert.equal(genericMeta.track.auCount, frameCount);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("v9 Myers Edit Distance — bit-parallel 32-bit computation and difflib sequenceRatio parity", () => {
  // Identical strings
  assert.equal(myersEditDistance("", ""), 0);
  assert.equal(myersEditDistance("hello", "hello"), 0);

  // Classic Levenshtein vectors
  assert.equal(myersEditDistance("kitten", "sitting"), 3);
  assert.equal(myersEditDistance("flaw", "lawn"), 2);
  assert.equal(myersEditDistance("gumbo", "gambol"), 2);
  assert.equal(myersEditDistance("vietnam", "vietnamese"), 3);

  // Insertion, deletion, substitution
  assert.equal(myersEditDistance("abc", "ab"), 1);
  assert.equal(myersEditDistance("ab", "abc"), 1);
  assert.equal(myersEditDistance("abc", "adc"), 1);

  // Large strings (> 32 chars) exercising Wagner-Fischer fallback
  const s1 = "the quick brown fox jumps over the lazy dog today";
  const s2 = "that quick brown fox jumps over the lazy cat today";
  const d = myersEditDistance(s1, s2);
  assert.ok(d > 0 && d <= 5);

  // Difflib sequenceRatio
  assert.equal(sequenceRatio("abc", "abc"), 1.0);
  assert.equal(sequenceRatio("", "abc"), 0.0);
  assert.equal(sequenceRatio("abcde", "abfde"), 0.8);
  assert.equal(sequenceRatio("vietnam", "vietnam"), 1.0);

  // High-level similarity helper
  assert.equal(similarity("Hà Nội mùa thu", "Hà Nội mùa thu"), 1.0);
  assert.ok(similarity("Hà Nội mùa thu", "Hà Nội mùa đông") > 0.6);
});

test("v9 Word Seam Splicer — trySplicePartialOverlap merges boundary sentences without duplicate words", () => {
  // Chunk 1 tail: "chúng ta sẽ bắt đầu dự án vào sáng mai"
  const wordsA = [
    Word({ start: 10.0, end: 10.3, text: "chúng" }),
    Word({ start: 10.3, end: 10.5, text: "ta" }),
    Word({ start: 10.5, end: 10.7, text: "sẽ" }),
    Word({ start: 10.7, end: 11.0, text: "bắt" }),
    Word({ start: 11.0, end: 11.2, text: "đầu" }),
    Word({ start: 11.2, end: 11.5, text: "dự" }),
    Word({ start: 11.5, end: 11.8, text: "án" }),
    Word({ start: 11.8, end: 12.0, text: "vào" }),
    Word({ start: 12.0, end: 12.3, text: "sáng" }),
    Word({ start: 12.3, end: 12.6, text: "mai" }),
  ];
  const segA = Segment({
    start: 10.0,
    end: 12.6,
    text: "chúng ta sẽ bắt đầu dự án vào sáng mai",
    words: wordsA,
  });

  // Chunk 2 head (overlaps in "vào sáng mai", continues: "khi thời tiết thuận lợi"):
  const wordsB = [
    Word({ start: 11.8, end: 12.0, text: "vào" }),
    Word({ start: 12.0, end: 12.3, text: "sáng" }),
    Word({ start: 12.3, end: 12.6, text: "mai" }),
    Word({ start: 12.6, end: 12.9, text: "khi" }),
    Word({ start: 12.9, end: 13.2, text: "thời" }),
    Word({ start: 13.2, end: 13.5, text: "tiết" }),
    Word({ start: 13.5, end: 13.8, text: "thuận" }),
    Word({ start: 13.8, end: 14.1, text: "lợi" }),
  ];
  const segB = Segment({
    start: 11.8,
    end: 14.1,
    text: "vào sáng mai khi thời tiết thuận lợi",
    words: wordsB,
  });

  const normCache = (s) => s.toLowerCase().trim();
  const spliced = trySplicePartialOverlap(segA, segB, normCache);

  assert.ok(spliced !== null, "Should detect suffix-prefix overlap seam");
  assert.equal(spliced.start, 10.0);
  assert.equal(spliced.end, 14.1);
  assert.equal(
    spliced.text,
    "chúng ta sẽ bắt đầu dự án vào sáng mai khi thời tiết thuận lợi",
  );
  // Total words: 10 from A + 5 from B (skipping 3 overlap words) = 15 words
  assert.equal(spliced.words.length, 15);
  assert.equal(spliced.words[0].text, "chúng");
  assert.equal(spliced.words[14].text, "lợi");
});

test("v9 Knuth-Plass / Viterbi DP — chooseOptimalBreaksDP selects optimal syntactic and balanced break points", () => {
  // Test words with clause punctuation and syntactic markers
  const words = [
    Word({ start: 1.0, end: 1.3, text: "trong" }),
    Word({ start: 1.3, end: 1.6, text: "chuyến" }),
    Word({ start: 1.6, end: 1.9, text: "đi," }), // clause break opportunity
    Word({ start: 1.9, end: 2.2, text: "chúng" }),
    Word({ start: 2.2, end: 2.5, text: "tôi" }),
    Word({ start: 2.5, end: 2.8, text: "đã" }),
    Word({ start: 2.8, end: 3.1, text: "khám" }),
    Word({ start: 3.1, end: 3.4, text: "phá" }),
    Word({ start: 3.4, end: 3.7, text: "nhiều" }),
    Word({ start: 3.7, end: 4.0, text: "nơi." }),
  ];

  // Request partition into 2 segments (1 break point)
  const breaks = chooseOptimalBreaksDP(words, 2, { clauseOnly: false });
  assert.equal(breaks.length, 1);
  // Break should favor punctuation word index 2 ("đi,") rather than splitting "trong chuyến" or "chúng tôi"
  assert.equal(breaks[0], 2);

  // Visual length calculation for CJK characters vs Latin
  assert.equal(visualLen("Hello"), 5);
  assert.equal(visualLen("你好"), 4); // 2 Hanzi * 2 = 4 visual columns
  assert.equal(visualLen("Xin chào 🇻🇳"), 11);
});

test("v9 GCRA Rate Governor — TokenBucket schedules requests smoothly using Virtual-Time", async () => {
  // 100 requests per second, capacity 10
  const bucket = new TokenBucket(100, 10);
  assert.equal(bucket.rate, 100);
  assert.equal(bucket.capacity, 10);

  // Initial acquire should take 0ms delay
  const t0 = Date.now();
  await bucket.acquire(1);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 25, "First acquire should be immediate");

  // Reset bucket and acquire
  bucket.reset();
  const ok = await bucket.acquire(1.0, 1);
  assert.equal(ok, true);
});

test("v9 Vectorized CRC32 — Slice-by-16 pure-JS fallback matches native zlib exactly across buffer sizes", () => {
  // Known vectors
  const empty = Buffer.alloc(0);
  assert.equal(crc32(empty), 0);
  assert.equal(crc32Fallback(empty), 0);

  const testStr = Buffer.from("123456789", "latin1");
  const expectedCrc = 0xcbf43926;
  assert.equal(crc32(testStr), expectedCrc);
  assert.equal(crc32Fallback(testStr), expectedCrc);
  assert.equal(crc32Hex(testStr), "cbf43926");

  // Compare across varied random buffer sizes up to 128KB
  for (const size of [1, 7, 15, 16, 17, 31, 32, 64, 127, 256, 1024, 65536, 131072]) {
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) buf[i] = (i * 13 + 7) & 0xff;
    const nativeVal = zlib.crc32(buf);
    const pureJsVal = crc32Fallback(buf);
    assert.equal(
      pureJsVal,
      nativeVal,
      `CRC32 mismatch on buffer size ${size}: pureJs=${pureJsVal.toString(16)} native=${nativeVal.toString(16)}`,
    );
  }
});

test("v9 Fragmented MP4 — inspectMp4 parses moof/traf/trun audio samples into seamless track", () => {
  // Construct minimal valid fMP4 in-memory fixture:
  // ftyp + moov (with mvhd, trak [tkhd, mdia {mdhd, hdlr, minf {smhd, dinf, stbl {stsd, stts, stsc, stsz, stco}}}], mvex {trex})
  // + moof (with mfhd, traf {tfhd, trun}) + mdat
  function u32(n) {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n >>> 0);
    return b;
  }
  function box(type, ...parts) {
    const body = Buffer.concat(parts);
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length + 8);
    head.write(type, 4, "latin1");
    return Buffer.concat([head, body]);
  }
  function fullbox(type, version, flags, ...parts) {
    const vf = Buffer.alloc(4);
    vf[0] = version;
    vf.writeUIntBE(flags & 0xffffff, 1, 3);
    return box(type, vf, ...parts);
  }

  const ftyp = box("ftyp", Buffer.from("isom", "latin1"), u32(512), Buffer.from("isomiso2mp41", "latin1"));
  const mvhd = fullbox("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(0), u32(0x00010000), Buffer.alloc(10), Buffer.alloc(36), Buffer.alloc(24), u32(2));

  // AAC ASC
  const asc = Buffer.from([0x12, 0x10]); // AAC-LC, 44100Hz, stereo
  const dsiDesc = Buffer.concat([Buffer.from([0x05, asc.length]), asc]);
  const dcdContent = Buffer.concat([Buffer.from([0x40, 0x15]), Buffer.alloc(3), u32(0), u32(0), dsiDesc]);
  const dcdDesc = Buffer.concat([Buffer.from([0x04, dcdContent.length]), dcdContent]);
  const esBody = Buffer.concat([Buffer.from([0x00, 0x01, 0x00]), dcdDesc]);
  const esds = fullbox("esds", 0, 0, Buffer.concat([Buffer.from([0x03, esBody.length]), esBody]));

  const mp4aEntry = Buffer.concat([
    box("mp4a", Buffer.alloc(6), Buffer.from([0x00, 0x01]), Buffer.alloc(8), Buffer.from([0x00, 0x02, 0x00, 0x10]), Buffer.from([0xff, 0xff, 0x00, 0x00]), u32(44100 << 16), esds),
  ]);
  const stsd = fullbox("stsd", 0, 0, u32(1), mp4aEntry);
  const stts = fullbox("stts", 0, 0, u32(0));
  const stsc = fullbox("stsc", 0, 0, u32(0));
  const stsz = fullbox("stsz", 0, 0, u32(0), u32(0));
  const stco = fullbox("stco", 0, 0, u32(0));
  const stbl = box("stbl", stsd, stts, stsc, stsz, stco);
  const dinf = box("dinf", fullbox("dref", 0, 0, u32(1), fullbox("url ", 0, 1)));
  const smhd = fullbox("smhd", 0, 0, Buffer.alloc(4));
  const mdhd = fullbox("mdhd", 0, 0, u32(0), u32(0), u32(44100), u32(0), Buffer.alloc(4));
  const hdlr = fullbox("hdlr", 0, 0, u32(0), Buffer.from("soun", "latin1"), Buffer.alloc(12), Buffer.from([0]));
  const minf = box("minf", smhd, dinf, stbl);
  const tkhd = fullbox("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(0), Buffer.alloc(8), Buffer.alloc(4), Buffer.alloc(36), Buffer.alloc(8));
  const mdia = box("mdia", mdhd, hdlr, minf);
  const trak = box("trak", tkhd, mdia);

  // mvex with trex (default duration 1024, default size 120)
  const trex = fullbox("trex", 0, 0, u32(1), u32(1), u32(1024), u32(120), u32(0));
  const mvex = box("mvex", trex);
  const moov = box("moov", mvhd, trak, mvex);

  // moof
  const mfhd = fullbox("mfhd", 0, 0, u32(1));
  // tfhd (default base is moof)
  const tfhd = fullbox("tfhd", 0, 0, u32(1));
  // trun with 4 samples, flags: 0x000001 (data-offset present), 0x000200 (sample-size present)
  const sampleSizes = [120, 130, 110, 140];
  const trunEntries = [];
  for (const sz of sampleSizes) {
    trunEntries.push(u32(sz));
  }
  // Data offset points to beginning of mdat payload
  const trun = fullbox(
    "trun",
    0,
    0x000201,
    u32(sampleSizes.length),
    u32(0), // data-offset (will patch after calculating header length)
    Buffer.concat(trunEntries),
  );
  const traf = box("traf", tfhd, trun);
  const moofWithoutPatch = box("moof", mfhd, traf);

  // mdat
  const mdatTotal = sampleSizes.reduce((a, b) => a + b, 0);
  const mdatPayload = Buffer.alloc(mdatTotal);
  const mdat = box("mdat", mdatPayload);

  // Patch dataOffset inside trun: offset from moof start to mdat payload
  const moofLen = moofWithoutPatch.length;
  const mdatPayloadOffset = moofLen + 8; // moof + mdat header
  const trunPos = moofWithoutPatch.indexOf(Buffer.from("trun", "latin1"));
  // trunPos + 4(type) + 4(ver/flags) + 4(sample_count) = data_offset position
  moofWithoutPatch.writeUInt32BE(mdatPayloadOffset, trunPos + 12);

  const fmp4Buffer = Buffer.concat([ftyp, moov, moofWithoutPatch, mdat]);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-v9-fmp4-"));
  const fmp4Path = path.join(tmpDir, "sample.mp4");
  try {
    fs.writeFileSync(fmp4Path, fmp4Buffer);
    const meta = inspectMp4(fmp4Path);
    assert.equal(meta.kind, "mp4-aac");
    assert.equal(meta.track.auCount, 4);
    assert.equal(meta.track.sampleRate, 44100);
    // 4 samples * 1024 / 44100
    assert.ok(Math.abs(meta.durationS - (4 * 1024) / 44100) < 1e-4);

    // Verify sample locations
    const loc0 = meta.track.auLocation(0);
    assert.equal(loc0.size, 120);
    const loc1 = meta.track.auLocation(1);
    assert.equal(loc1.size, 130);
    assert.equal(loc1.pos, loc0.pos + 120);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
