/** Synthetic media fixtures — structurally valid MP4(AAC)/MP3/WAV built from
 * raw bytes. The pipeline runs its REAL pure-Node audio layer on these; no
 * mock ever replaces the code under test. */

/** Deterministic pseudo-random byte generator (stable across runs). */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

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

/**
 * Build a minimal but fully-valid MP4 with one AAC-LC audio track.
 * AUs live in `mdatChunks` contiguous runs (default 1) to exercise stsc/stco
 * walking. Payload sizes vary so per-sample stsz is exercised.
 * @returns {Buffer}
 */
export function buildMp4Aac({ auCount = 40, sampleRate = 22050, channels = 1, mdatChunks = 1, seed = 42 } = {}) {
  const rand = lcg(seed);
  // Fast path for million-AU fixtures: contiguous blocks + flat tables instead
  // of per-AU buffers (keeps heap flat at scale). Smaller payloads keep the
  // file itself manageable — accessor math is identical.
  const big = auCount > 20000;
  const sizeOf = big ? () => 7 + (rand() % 40) : () => 7 + (rand() % 300);
  const sizes = new Uint32Array(auCount);
  for (let i = 0; i < auCount; i++) sizes[i] = sizeOf(i);

  // Split AUs into `mdatChunks` sequential runs.
  const perChunk = Math.ceil(auCount / mdatChunks);
  const chunkGroups = [];
  for (let c = 0; c < mdatChunks; c++) {
    const fromAu = c * perChunk;
    const nAus = Math.min(auCount, fromAu + perChunk) - fromAu;
    if (nAus <= 0) continue;
    let bytes = 0;
    for (let k = 0; k < nAus; k++) bytes += sizes[fromAu + k];
    const block = Buffer.allocUnsafe(bytes);
    let w = 0;
    if (big) {
      for (let k = 0; k < nAus; k++) {
        const n = sizes[fromAu + k];
        for (let j = 0; j < n; j++) block[w + j] = rand() & 0xff;
        w += n;
      }
      chunkGroups.push(block);
    } else {
      for (let k = 0; k < nAus; k++) {
        const n = sizes[fromAu + k];
        const b = Buffer.allocUnsafe(n);
        for (let j = 0; j < n; j++) b[j] = rand() & 0xff;
        b.copy(block, w);
        w += n;
      }
      chunkGroups.push(block);
    }
  }

  const timescale = sampleRate; // 1 AU = 1024 ticks
  const mediaDurTicks = auCount * 1024;
  const movieTimescale = 1000;
  const movieDurMs = Math.round((mediaDurTicks / timescale) * 1000);

  const ftyp = box("ftyp", Buffer.from("isom", "latin1"), u32(512), Buffer.from("isomiso2mp41", "latin1"));

  const mvhd = fullbox("mvhd", 0, 0,
    u32(0), u32(0), u32(movieTimescale), u32(movieDurMs),
    u32(0x00010000), Buffer.from([0x01, 0x00]), Buffer.alloc(2 + 8),
    buildMatrix(), Buffer.alloc(24), u32(2),
  );

  // AAC-LC ASC: AOT=2 · freqIdx for sampleRate · chanCfg.
  const FREQ_IDX = new Map([[96000, 0], [88200, 1], [64000, 2], [48000, 3], [44100, 4], [32000, 5], [24000, 6], [22050, 7], [16000, 8], [12000, 9], [11025, 10], [8000, 11], [7350, 12]]);
  const fidx = FREQ_IDX.get(sampleRate);
  if (fidx === undefined) throw new Error(`unsupported fixture rate ${sampleRate}`);
  const asc = Buffer.from([((2 << 3) | (fidx >> 1)) & 0xff, (((fidx & 1) << 7) | (channels << 3)) & 0xff]);

  const dsiDesc = Buffer.concat([Buffer.from([0x05]), descLen(asc.length), asc]);
  const dcdContent = Buffer.concat([
    Buffer.from([0x40, 0x15]), Buffer.alloc(3), u32(0), u32(0), dsiDesc,
  ]);
  const dcdDesc = Buffer.concat([Buffer.from([0x04]), descLen(dcdContent.length), dcdContent]);
  const esBody = Buffer.concat([u16(1), Buffer.from([0x00]), dcdDesc]);
  const esds = fullbox("esds", 0, 0, Buffer.concat([Buffer.from([0x03]), descLen(esBody.length), esBody]));

  const mp4aEntry = Buffer.concat([
    (() => { const h = Buffer.alloc(8); h.writeUInt32BE(36 + esds.length); h.write("mp4a", 4, "latin1"); return h; })(),
    Buffer.alloc(6), u16(1), // reserved + data_reference_index
    u16(0), u16(0), u32(0), // version rev vendor
    u16(channels), u16(16),
    Buffer.from([0xff, 0xff]), u16(0), // compression id (-1 as u16? use 0xffff) + packet size
    u32(sampleRate << 16),
    esds,
  ]);
  const stsd = fullbox("stsd", 0, 0, u32(1), mp4aEntry);

  const stts = fullbox("stts", 0, 0, u32(1), u32(auCount), u32(1024));

  // stsc: one row per chunk group (samplesPerChunk varies by construction).
  const stscRows = chunkGroups.map((_, ci) => {
    const startAu = ci * perChunk;
    const n = Math.min(perChunk, auCount - startAu);
    return Buffer.concat([u32(ci + 1), u32(n), u32(1)]);
  });
  const stsc = fullbox("stsc", 0, 0, u32(stscRows.length), Buffer.concat(stscRows));

  const stszTable = Buffer.allocUnsafe(auCount * 4);
  for (let i = 0; i < auCount; i++) stszTable.writeUInt32BE(sizes[i], i * 4);
  const stsz = fullbox("stsz", 0, 0, u32(0), u32(auCount), stszTable);

  const stcoPlaceholder = fullbox("stco", 0, 0, u32(chunkGroups.length), Buffer.alloc(4 * chunkGroups.length));
  const stbl = box("stbl", stsd, stts, stsc, stsz, stcoPlaceholder);
  const dinf = box("dinf", fullbox("dref", 0, 0, u32(1), fullbox("url ", 0, 1)));
  const smhd = fullbox("smhd", 0, 0, u16(0), u16(0));
  const mdhd = fullbox("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(mediaDurTicks), u16(0x55c4), u16(0));
  const hdlr = fullbox("hdlr", 0, 0, u32(0), Buffer.from("soun", "latin1"), Buffer.alloc(12), Buffer.from([0]));
  const minf = box("minf", smhd, dinf, stbl);
  const tkhd = fullbox("tkhd", 0, 3,
    u32(0), u32(0), u32(1), u32(0), u32(movieDurMs),
    Buffer.alloc(8), u16(0), u16(0),
    buildMatrix(), u32(0), u32(0),
  );
  const mdia = box("mdia", mdhd, hdlr, minf);
  const trak = box("trak", tkhd, mdia);
  const moov = box("moov", mvhd, trak);

  // Layout: ftyp | moov | mdat chunks → patch real stco offsets in place.
  const ftypLen = ftyp.length;
  const moovLen = moov.length;
  const mdatHeaderLen = 8;
  const baseOffset = ftypLen + moovLen;
  const offsets = [];
  let cursor = baseOffset;
  for (const g of chunkGroups) {
    offsets.push(cursor + mdatHeaderLen);
    cursor += mdatHeaderLen + g.length;
  }
  // Patch stco entries inside moov buffer.
  const stcoPos = moov.indexOf(Buffer.from("stco", "latin1"));
  if (stcoPos < 0) throw new Error("stco missing");
  const entryBase = stcoPos + 4 + 4 + 4; // past type + version/flags + entryCount
  offsets.forEach((off, i) => off && moov.writeUInt32BE(off, entryBase + i * 4));

  const mdatParts = chunkGroups.map((g, i) => {
    const h = Buffer.alloc(8);
    h.writeUInt32BE(g.length + 8);
    h.write("mdat", 4, "latin1");
    return i === 0 ? Buffer.concat([h, g]) : Buffer.concat([h, g]);
  });

  return Buffer.concat([ftyp, moov, ...mdatParts]);

  function u16(n) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n);
    return b;
  }
  function buildMatrix() {
    const m = Buffer.alloc(36);
    m.writeUInt32BE(0x00010000, 0);
    m.writeUInt32BE(0x00010000, 20);
    m.writeUInt32BE(0x40000000, 28);
    return m;
  }
  function descLen(n) {
    if (n < 0x80) return Buffer.from([n]);
    if (n < 0x4000) return Buffer.from([0x80 | (n >> 8), n & 0xff]);
    return Buffer.from([0x80 | (n >> 21), 0x80 | ((n >> 14) & 0x7f), 0x80 | ((n >> 7) & 0x7f), n & 0x7f]);
  }
}

/** CBR MPEG-1 Layer III @128kbps/44100 mono frames (payload zeros). */
export function buildMp3({ frames = 200, bitrateKbps = 128, sampleRate = 44100, withId3 = false } = {}) {
  const parts = [];
  if (withId3) {
    const pad = Buffer.alloc(64);
    const sizeBytes = Buffer.alloc(10);
    sizeBytes.write("ID3", 0, "latin1");
    sizeBytes[3] = 3;
    sizeBytes[6] = 0; // syncsafe size of 64
    sizeBytes[7] = 0;
    sizeBytes[8] = 0;
    sizeBytes[9] = 64;
    parts.push(sizeBytes, pad);
  }
  const frameLen = Math.floor((144 * bitrateKbps * 1000) / sampleRate); // no padding
  const header = Buffer.from([0xff, 0xfb, 0x90, 0xc4]); // MPEG1 L3 128k 44100 noPad stereo→mono? mode=mono(c4 low bits)
  const payload = Buffer.alloc(frameLen - 4);
  for (let i = 0; i < frames; i++) parts.push(header, payload);
  return Buffer.concat(parts);
}

/** PCM 16-bit WAV: quiet noise floor with optional tone bursts. */
export function buildWav({ seconds = 2, sampleRate = 8000, channels = 1, toneBursts = [] } = {}) {
  const total = seconds * sampleRate;
  const data = Buffer.alloc(total * channels * 2);
  for (const burst of toneBursts) {
    for (let t = burst.from; t < Math.min(burst.to, total); t++) {
      const amp = burst.amp ?? 12000;
      const v = Math.round(amp * Math.sin((2 * Math.PI * (burst.freq ?? 440) * t) / sampleRate));
      for (let c = 0; c < channels; c++) data.writeInt16LE(v, (t * channels + c) * 2);
    }
  }
  const header = Buffer.alloc(44);
  const blockAlign = channels * 2;
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "latin1");
  header.write("fmt ", 12, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Write a fixture to disk and return the absolute path. */
import fsMod from "node:fs";

export function writeFixture(dir, name, buffer) {
  const p = `${dir}/${name}`;
  fsMod.writeFileSync(p, buffer);
  return p;
}
