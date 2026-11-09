/** Pure-Node MP4/MOV/M4A demuxer — audio track only, zero dependency.
 * Byte surgery instead of transcode: parse boxes → sample table → ranged reads.
 * Memory law: NO per-sample arrays. Sample tables stay run-length encoded and
 * every lookup walks the RLE tables — O(table entries), not O(sample count),
 * so a 100-hour track (≈17M AAC access units) costs kilobytes, not gigabytes.
 * NO-FALLBACK: unsupported codecs are hard errors naming the codec, never guessed. */

import fs from "node:fs";
import { ASRError } from "../core/errors.js";

export const AAC_FREQ_TABLE = Object.freeze([
  96000, 88200, 64000, 48000, 44100, 32000,
  24000, 22050, 16000, 12000, 11025, 8000, 7350,
]);

/** Tiny MSB-first bit reader for AudioSpecificConfig. */
class BitReader {
  #buf;
  #bit = 0;
  constructor(buf) {
    this.#buf = buf;
  }
  take(n) {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.#buf[this.#bit >> 3];
      if (byte === undefined) throw new ASRError("ASC kết thúc sớm — DecoderSpecificInfo hỏng");
      value = (value << 1) | ((byte >> (7 - (this.#bit & 7))) & 1);
      this.#bit += 1;
    }
    return value;
  }
}

/** Metadata reader — small positional reads over one open fd. */
class MetaReader {
  #fd;
  constructor(fd) {
    this.#fd = fd;
  }
  read(pos, len) {
    const buf = Buffer.allocUnsafe(len);
    let off = 0;
    while (off < len) {
      const n = fs.readSync(this.#fd, buf, off, len - off, Number(pos) + off);
      if (n <= 0) throw new ASRError(`MP4 đọc hụt ${len - off}B tại offset ${Number(pos) + off}`);
      off += n;
    }
    return buf;
  }
  u32(pos) {
    return this.read(pos, 4).readUInt32BE(0);
  }
  u64(pos) {
    return this.read(pos, 8).readBigUInt64BE(0);
  }
  type(pos) {
    return this.read(pos, 4).toString("latin1");
  }
}

function* iterBoxes(reader, start, end, context) {
  let pos = BigInt(start);
  const limit = BigInt(end);
  while (pos < limit) {
    if (pos + 8n > limit) throw new ASRError(`${context}: box header vượt ranh giới`);
    let size = reader.u32(Number(pos));
    let headerLen = 8;
    if (size === 1) {
      const large = reader.u64(Number(pos) + 8);
      // Allow >2GiB boxes when skipping (e.g. multi-GB mdat); EOF check below still guards.
      if (large < 16n) throw new ASRError(`${context}: box largesize ${large} < header`);
      size = Number(large);
      if (!Number.isSafeInteger(size)) throw new ASRError(`${context}: box quá lớn vượt giới hạn JS`);
      headerLen = 16;
    } else if (size === 0) {
      size = Number(limit - pos);
    }
    if (size < headerLen) throw new ASRError(`${context}: box size ${size} < header`);
    if (pos + BigInt(size) > limit) throw new ASRError(`${context}: box vượt EOF`);
    const type = reader.type(Number(pos) + 4);
    yield { type, start: pos, dataStart: pos + BigInt(headerLen), size };
    pos += BigInt(size);
  }
}

/** Box end offset as Number (boxes are ≤2GiB by iterBoxes contract). */
const endOf = (box) => Number(box.start + BigInt(box.size));

/** Length-guarded scalar readers over already-loaded bodies.
 * Every direct readUInt32BE/readBigUInt64BE in this file goes through these so
 * truncated boxes surface as ASRError, never native RangeError. */
function need(buf, off, len, context) {
  if (!Number.isInteger(off) || !Number.isInteger(len) || off < 0 || len < 0 || off + len > buf.length) {
    throw new ASRError(`${context}: box cụt (cần [${off},${off + len}) trong ${buf.length}B)`);
  }
}
function u32b(buf, off, context) {
  need(buf, off, 4, context);
  return buf.readUInt32BE(off);
}
function u64b(buf, off, context) {
  need(buf, off, 8, context);
  return buf.readBigUInt64BE(off);
}

function findBox(reader, start, end, wanted, context) {
  for (const box of iterBoxes(reader, start, end, context)) {
    if (box.type === wanted) return box;
  }
  return null;
}

/** Variable-length MPEG-4 descriptor length (0x80 continuation bytes). */
function readDescriptor(buf, pos) {
  if (pos >= buf.length) throw new ASRError("esds: descriptor thiếu tag");
  const tag = buf[pos++];
  let len = 0;
  for (let i = 0; i < 4; i++) {
    if (pos >= buf.length) throw new ASRError("esds: descriptor thiếu length");
    const b = buf[pos++];
    len = (len << 7) | (b & 0x7f);
    if (!(b & 0x80)) break;
  }
  if (pos + len > buf.length) throw new ASRError("esds: descriptor vượt payload");
  return { tag, start: pos, len };
}

/** Parse AudioSpecificConfig → {audioObjectType, freqIdx, sampleRate, chanCfg}. */
export function parseAsc(asc) {
  if (!asc || asc.length < 2) throw new ASRError("ASC rỗng/hỏng");
  const br = new BitReader(asc);
  let aot = br.take(5);
  if (aot === 31) aot = 32 + br.take(6);
  const freqIdx = br.take(4);
  const chanCfg = br.take(4);
  if (freqIdx === 15) {
    const hz = br.take(24);
    const idx = AAC_FREQ_TABLE.indexOf(hz);
    if (idx < 0) {
      throw new ASRError(`AAC sample rate ${hz}Hz không biểu diễn được trong ADTS`);
    }
    return finish(aot, idx, hz, chanCfg);
  }
  if (freqIdx >= AAC_FREQ_TABLE.length) throw new ASRError(`ASC freq index ${freqIdx} không hợp lệ`);
  return finish(aot, freqIdx, AAC_FREQ_TABLE[freqIdx], chanCfg);

  function finish(audioObjectType, freqIdx2, sampleRate, chanCfg2) {
    if (chanCfg2 === 0 || chanCfg2 > 7) {
      throw new ASRError(`ASC channel config ${chanCfg2} không hỗ trợ (cần 1–7)`);
    }
    return { audioObjectType, freqIdx: freqIdx2, sampleRate, chanCfg: chanCfg2 };
  }
}

/** esds fullbox body → DecoderSpecificInfo (ASC) bytes. Throws on non-AAC OTI. */
function parseEsdsPayload(payload, context) {
  const es = readDescriptor(payload, 0);
  if (es.tag !== 0x03) throw new ASRError(`${context}: esds thiếu ES_Descriptor (tag ${es.tag})`);
  let p = es.start;
  p += 2; // ES_ID
  if (p >= payload.length) throw new ASRError(`${context}: esds ES_Descriptor cụt`);
  const flags = payload[p++];
  if (flags & 0x80) p += 2; // streamDependenceFlag → dependsOn_ES_ID
  if (flags & 0x40) {
    if (p >= payload.length) throw new ASRError(`${context}: esds URL_Flag cụt`);
    p += 1 + payload[p]; // urlstring length byte + string
  }
  if (flags & 0x20) p += 2; // OCRstreamFlag → OCR_ES_Id
  const dc = readDescriptor(payload, p);
  if (dc.tag !== 0x04) throw new ASRError(`${context}: esds thiếu DecoderConfigDescriptor (tag ${dc.tag})`);
  if (dc.start >= payload.length) throw new ASRError(`${context}: DecoderConfigDescriptor cụt`);
  const oti = payload[dc.start];
  if (oti !== 0x40 && !(oti >= 0x66 && oti <= 0x68)) {
    throw new ASRError(
      `${context}: audio object type 0x${oti.toString(16)} không phải AAC — NO-FALLBACK`,
    );
  }
  const dsiAt = dc.start + 13; // oti(1)+streamType(1)+bufferSizeDB(3)+maxBitrate(4)+avgBitrate(4)
  if (dsiAt >= payload.length) throw new ASRError(`${context}: mp4a thiếu DecoderSpecificInfo (ASC)`);
  const dsi = readDescriptor(payload, dsiAt);
  if (dsi.tag !== 0x05) throw new ASRError(`${context}: esds thiếu DecoderSpecificInfo (tag ${dsi.tag})`);
  return payload.subarray(dsi.start, dsi.start + dsi.len);
}

/** Scan sample-entry child boxes (recursing into wave) for esds → ASC. */
function findAscInEntry(reader, from, to, ctx) {
  for (const box of iterBoxes(reader, from, to, ctx)) {
    if (box.type === "esds") {
      const payload = reader.read(Number(box.dataStart) + 4, endOf(box) - (Number(box.dataStart) + 4));
      return parseEsdsPayload(payload, ctx);
    }
    if (box.type === "wave") {
      const found = findAscInEntry(reader, Number(box.dataStart), endOf(box), `${ctx}/wave`);
      if (found) return found;
    }
  }
  return null;
}

function requireChild(reader, stblBox, type, ctx) {
  const box = findBox(reader, Number(stblBox.dataStart), endOf(stblBox), type, ctx);
  if (!box) throw new ASRError(`${ctx}: thiếu ${type}`);
  return box;
}

/**
 * Parse one audio trak → track description with RLE sample tables.
 * Returns null when handler isn't sound; throws on structural damage or
 * unsupported codecs (caller aggregates per-track messages).
 */
function parseAudioTrak(reader, trakBox, context) {
  const mdia = findBox(reader, Number(trakBox.dataStart), endOf(trakBox), "mdia", context);
  if (!mdia) return null;
  const hdlr = findBox(reader, Number(mdia.dataStart), endOf(mdia), "hdlr", context);
  if (!hdlr) return null;
  const handler = reader.type(Number(hdlr.dataStart) + 8);
  if (handler !== "soun") return null;

  const mdhd = requireChild(reader, mdia, "mdhd", context);
  const mv = reader.read(Number(mdhd.dataStart), 1)[0];
  let timescale;
  let mediaDurationRaw;
  if (mv === 1) {
    timescale = reader.u32(Number(mdhd.dataStart) + 20);
    mediaDurationRaw = reader.u64(Number(mdhd.dataStart) + 24);
  } else if (mv === 0) {
    timescale = reader.u32(Number(mdhd.dataStart) + 12);
    mediaDurationRaw = reader.u32(Number(mdhd.dataStart) + 16);
  } else {
    throw new ASRError(`${context}: mdhd version ${mv} không hỗ trợ (cần 0/1)`);
  }
  if (!timescale) throw new ASRError(`${context}: timescale 0 — timeline hỏng`);

  const stblCtx = `${context}/stbl`;
  const minf = requireChild(reader, mdia, "minf", context);
  const stbl = requireChild(reader, minf, "stbl", stblCtx);

  const stsd = requireChild(reader, stbl, "stsd", stblCtx);
  const entryCount = reader.u32(Number(stsd.dataStart) + 4);
  if (entryCount < 1) throw new ASRError(`${stblCtx}: stsd rỗng`);
  const entryDataStart = Number(stsd.dataStart) + 8;
  const stsdEnd = endOf(stsd);
  if (entryDataStart + 8 > stsdEnd) throw new ASRError(`${stblCtx}: stsd cụt trước sample entry`);
  const entrySize = reader.u32(entryDataStart);
  if (!Number.isSafeInteger(entrySize) || entrySize < 8) {
    throw new ASRError(`${stblCtx}: sample entry size ${entrySize} vô lý`);
  }
  // Declared size governs, but clamp to stsd so an overstated size (seen in
  // the wild and in synthetic fixtures) cannot pull reads into the next box.
  const entryEnd = Math.min(entryDataStart + entrySize, stsdEnd);
  const format = reader.type(entryDataStart + 4);

  let codec;
  let asc = null;
  if (format === "enca") {
    throw new ASRError(`${stblCtx}: audio track bị mã hóa DRM — không xử lý được`);
  } else if (format === "mp4a") {
    const specBase = entryDataStart + 8; // past size+format
    const ver = reader.read(specBase + 8, 2).readUInt16BE(0);
    if (ver !== 0 && ver !== 1 && ver !== 2)
      throw new ASRError(`${stblCtx}: mp4a version ${ver} không hỗ trợ (cần 0/1/2)`);
    const extLen = ver === 2 ? 36 : ver === 1 ? 16 : 0;
    const childrenFrom = specBase + 28 + extLen;
    if (childrenFrom > entryEnd) {
      throw new ASRError(`${stblCtx}: mp4a entry size ${entrySize} quá nhỏ cho version ${ver}`);
    }
    asc = findAscInEntry(reader, childrenFrom, entryEnd, stblCtx);
    if (!asc || asc.length === 0) throw new ASRError(`${stblCtx}: mp4a thiếu DecoderSpecificInfo`);
    codec = "aac";
  } else if (format === ".mp3" || format === "mp3 ") {
    codec = "mp3";
  } else {
    throw new ASRError(
      `${stblCtx}: codec audio '${format}' không hỗ trợ passthrough (hỗ trợ: mp4a/AAC, .mp3) — NO-FALLBACK`,
    );
  }

  const stts = requireChild(reader, stbl, "stts", stblCtx);
  const stsc = requireChild(reader, stbl, "stsc", stblCtx);
  const stsz = requireChild(reader, stbl, "stsz", stblCtx);
  const stco =
    findBox(reader, Number(stbl.dataStart), endOf(stbl), "stco", stblCtx) ??
    findBox(reader, Number(stbl.dataStart), endOf(stbl), "co64", stblCtx);
  if (!stco) throw new ASRError(`${stblCtx}: thiếu stco/co64`);

  const body = (box) => reader.read(Number(box.dataStart) + 4, endOf(box) - (Number(box.dataStart) + 4));
  const track = {
    codec,
    ...(codec === "aac" ? { ...parseAsc(asc), ascBytes: Buffer.from(asc) } : {}),
    timescale,
    mediaDurationRaw,
  };
  attachSampleTable(track, {
    sttsBody: body(stts),
    stscBody: body(stsc),
    stszBody: body(stsz),
    stcoKind: stco.type,
    stcoBody: body(stco),
  });
  return track;
}

/**
 * Attach RLE sample-table accessors onto a track object:
 *   auCount · durationS · auDtsS(i) · auIndexAtS(s) · iterateAus(from,to)
 * The cursor inside auLocation only ever moves FORWARD across ascending
 * queries — cut planning asks ~2×chunks indices in order, so total walk cost
 * is O(chunks + chunks) regardless of how many millions of AUs exist.
 */
function attachSampleTable(track, t) {
  const stts = t.sttsBody;
  need(stts, 0, 4, "stts");
  const sttsEntries = u32b(stts, 0, "stts");
  if (sttsEntries === 0) throw new ASRError("stts rỗng — timeline rỗng");
  need(stts, 0, 4 + sttsEntries * 8, "stts");
  const pairs = [];
  for (let e = 0, off = 4; e < sttsEntries; e++, off += 8) {
    const count = u32b(stts, off, "stts");
    const delta = u32b(stts, off + 4, "stts");
    if (!(count >= 1)) throw new ASRError(`stts hàng ${e} count ${count} vô lý (cần ≥1)`);
    if (!(delta >= 1)) throw new ASRError(`stts hàng ${e} delta ${delta} vô lý (cần ≥1)`);
    pairs.push([count, delta]);
  }
  const cumCounts = new Float64Array(sttsEntries);
  const cumTicks = new Float64Array(sttsEntries);
  let accCount = 0;
  let accTicks = 0;
  for (let e = 0; e < sttsEntries; e++) {
    accCount += pairs[e][0];
    accTicks += pairs[e][0] * pairs[e][1];
    cumCounts[e] = accCount;
    cumTicks[e] = accTicks;
  }
  const auCount = accCount;
  const ts = track.timescale || 1;

  track.auCount = auCount;

  /** Decode time of AU index (seconds) — O(1) cursor hint + binary search over RLE entries. */
  let dtsHint = 0;
  track.auDtsS = function auDtsS(index) {
    if (!Number.isInteger(index) || index < 0 || index >= auCount) {
      throw new ASRError(`AU index ${index} ngoài [0,${auCount})`);
    }
    let e = dtsHint;
    const prevHint = e > 0 ? cumCounts[e - 1] : 0;
    if (index < prevHint || index >= cumCounts[e]) {
      if (e + 1 < sttsEntries && index >= cumCounts[e] && index < cumCounts[e + 1]) {
        e += 1;
      } else {
        let lo = 0;
        let hi = sttsEntries - 1;
        e = 0;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (index < cumCounts[mid]) {
            e = mid;
            hi = mid - 1;
          } else {
            lo = mid + 1;
          }
        }
      }
      dtsHint = e;
    }
    const prevSamples = e > 0 ? cumCounts[e - 1] : 0;
    const prevTicks = e > 0 ? cumTicks[e - 1] : 0;
    return (prevTicks + (index - prevSamples) * pairs[e][1]) / ts;
  };

  const lastTick = sttsEntries > 0 ? cumTicks[sttsEntries - 1] : 0;
  const declared = Number(track.mediaDurationRaw) / ts;
  track.durationS = Math.max(lastTick / ts, declared > 0 ? declared : 0);

  /** First AU whose decode time ≥ seconds — binary search on cumulative ticks. */
  track.auIndexAtS = function auIndexAtS(seconds) {
    if (!(seconds > 0)) return 0;
    const target = seconds * ts;
    let lo = 0;
    let hi = sttsEntries - 1;
    let entry = sttsEntries - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cumTicks[mid] > target) {
        entry = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    const prevSamples = entry > 0 ? cumCounts[entry - 1] : 0;
    const prevTicks = entry > 0 ? cumTicks[entry - 1] : 0;
    const delta = pairs[entry][1];
    if (delta <= 0) return Math.min(auCount - 1, prevSamples);
    const into = Math.floor((target - prevTicks) / delta);
    return Math.max(0, Math.min(auCount - 1, prevSamples + into));
  };

  // --- stsz ---
  // NOTE: stsz is the one sanctioned O(N)-bytes table (4B/sample VBR sizes).
  // MP4 offers no RLE for sizes, so a 17M-AU track legitimately carries ~68MB
  // here. We keep it as a flat Buffer (not per-sample objects) and guard its
  // length strictly; uniform-size tracks carry only the 8B header.
  const stsz = t.stszBody;
  need(stsz, 0, 8, "stsz");
  const uniformSize = u32b(stsz, 0, "stsz");
  const stszCount = u32b(stsz, 4, "stsz");
  if (uniformSize !== 0 && stszCount !== auCount) {
    throw new ASRError(`stsz count ${stszCount} ≠ stts count ${auCount}`);
  }
  if (uniformSize === 0) {
    if (stszCount !== auCount) {
      throw new ASRError(`stsz count ${stszCount} ≠ stts count ${auCount}`);
    }
    need(stsz, 0, 8 + stszCount * 4, "stsz");
  } else {
    if (stsz.length < 8) throw new ASRError("stsz uniform header cụt");
  }

  // --- stsc rows: [firstChunk1based, samplesPerChunk] ---
  const stsc = t.stscBody;
  need(stsc, 0, 4, "stsc");
  const stscEntries = u32b(stsc, 0, "stsc");
  if (stscEntries === 0) throw new ASRError("stsc rỗng — chunk map rỗng");
  need(stsc, 0, 4 + stscEntries * 12, "stsc");
  const rows = [];
  for (let e = 0, off = 4; e < stscEntries; e++, off += 12) {
    const first = u32b(stsc, off, "stsc");
    const per = u32b(stsc, off + 4, "stsc");
    const descIdx = u32b(stsc, off + 8, "stsc");
    if (e === 0 && first < 1) throw new ASRError(`stsc hàng 0 firstChunk ${first} vô lý (cần ≥1)`);
    if (e > 0 && !(first > rows[e - 1][0])) {
      throw new ASRError(`stsc hàng ${e} firstChunk ${first} không tăng đơn điệu (trước ${rows[e - 1][0]})`);
    }
    if (!(per >= 1)) throw new ASRError(`stsc hàng ${e} samplesPerChunk ${per} vô lý (cần ≥1)`);
    if (!(descIdx >= 1)) throw new ASRError(`stsc hàng ${e} sampleDescIndex ${descIdx} vô lý (cần ≥1)`);
    rows.push([first, per]);
  }

  // --- chunk offsets ---
  const stco = t.stcoBody;
  need(stco, 0, 4, "stco/co64");
  const chunkCount = u32b(stco, 0, "stco/co64");
  if (chunkCount === 0) throw new ASRError("stco/co64 rỗng — không có chunk nào");
  const co64 = t.stcoKind === "co64";
  need(stco, 0, 4 + chunkCount * (co64 ? 8 : 4), "stco/co64");
  if (rows[rows.length - 1][0] > chunkCount) {
    throw new ASRError(`stsc firstChunk ${rows[rows.length - 1][0]} vượt chunkCount ${chunkCount}`);
  }
  const chunkOffset = (ci) =>
    co64 ? Number(u64b(stco, 4 + ci * 8, "co64")) : u32b(stco, 4 + ci * 4, "stco");

  // Zero-alloc chunk→firstAU: rows (R ≤ dozens) carry prefix sums, chunkCount
  // (possibly millions) never materializes as an array. O(R) memory, O(log R) lookup.
  const rowFirstAu = new Array(rows.length);
  {
    let acc = 0;
    for (let e = 0; e < rows.length; e++) {
      rowFirstAu[e] = acc;
      const curStart = rows[e][0] - 1;
      const nextStart = e + 1 < rows.length ? rows[e + 1][0] - 1 : chunkCount;
      const spanChunks = nextStart - curStart;
      if (!(spanChunks >= 0)) throw new ASRError(`stsc hàng ${e} phủ chunk âm`);
      acc += spanChunks * rows[e][1];
    }
  }
  const rowIndexForChunk = (ci) => {
    let lo = 0;
    let hi = rows.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid][0] - 1 <= ci) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (ans < 0) throw new ASRError(`stsc không phủ chunk ${ci}`);
    return ans;
  };
  const chunkFirstAu = (ci) => {
    if (ci < 0 || ci >= chunkCount) throw new ASRError(`chunk ${ci} ngoài stsc`);
    const e = rowIndexForChunk(ci);
    return rowFirstAu[e] + (ci - (rows[e][0] - 1)) * rows[e][1];
  };
  const rowIndexForAu = (au) => {
    let lo = 0;
    let hi = rowFirstAu.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rowFirstAu[mid] <= au) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  };
  const chunkForAu = (au) => {
    let e = rowIndexForAu(au);
    // Adjust for boundary exactness (cheap, ≤1 step in valid files).
    while (e + 1 < rows.length && rowFirstAu[e + 1] <= au) e++;
    while (e > 0 && rowFirstAu[e] > au) e--;
    const per = rows[e][1];
    if (!(per > 0)) throw new ASRError(`stsc hàng ${e} samplesPerChunk vô lý`);
    let ci = rows[e][0] - 1 + Math.floor((au - rowFirstAu[e]) / per);
    // Clamp forward if arithmetic lands past the row span (malformed tables).
    while (e + 1 < rows.length && ci >= rows[e + 1][0] - 1) {
      e++;
      const per2 = rows[e][1];
      ci = rows[e][0] - 1 + Math.floor((au - rowFirstAu[e]) / per2);
    }
    if (ci < 0) ci = 0;
    if (ci >= chunkCount) ci = chunkCount - 1;
    return ci;
  };

  let curRow = 0;
  let curChunk = 0;
  let curChunkFirstAu = 0;
  let curAu = 0;
  let curPos = chunkCount > 0 ? chunkOffset(0) : 0;
  const resetCursor = () => {
    curRow = 0;
    curChunk = 0;
    curChunkFirstAu = 0;
    curAu = 0;
    curPos = chunkCount > 0 ? chunkOffset(0) : 0;
    dtsHint = 0;
  };
  const auSizeAt = (i) =>
    uniformSize !== 0 ? uniformSize : stsz.readUInt32BE(8 + i * 4);

  /** Direct O(log R + perChunk) locate — no cursor, no O(N) rewalk. */
  const auLocationDirect = (index) => {
    const ci = chunkForAu(index);
    const rIdx = rowIndexForChunk(ci);
    const firstAu = rowFirstAu[rIdx] + (ci - (rows[rIdx][0] - 1)) * rows[rIdx][1];
    const off = index - firstAu;
    const base = chunkOffset(ci);
    let pos;
    if (uniformSize !== 0) {
      pos = base + off * uniformSize;
    } else {
      pos = base;
      for (let k = 0; k < off; k++) pos += auSizeAt(firstAu + k);
    }
    // Sync cursor so subsequent sequential walks stay true O(1).
    curRow = rIdx;
    curChunk = ci;
    curChunkFirstAu = firstAu;
    curAu = index;
    curPos = pos;
    return { pos, size: auSizeAt(index) };
  };

  /** Position+size of AU index; forward-sequential stays true O(1), jumps use direct. */
  track.auLocation = function auLocation(index) {
    if (!Number.isInteger(index) || index < 0 || index >= auCount) {
      throw new ASRError(`AU index ${index} ngoài phạm vi`);
    }
    if (index < curAu || index - curAu > 64) return auLocationDirect(index);
    while (curAu < index) {
      const per = rows[curRow][1];
      if (curAu + 1 - curChunkFirstAu >= per) {
        curChunk += 1;
        if (curChunk >= chunkCount) throw new ASRError("stco hết chunk trước khi hết AU");
        curChunkFirstAu = curAu + 1;
        if (curRow + 1 < rows.length && curChunk >= rows[curRow + 1][0] - 1) {
          curRow += 1;
        }
        curPos = chunkOffset(curChunk);
      } else {
        curPos += auSizeAt(curAu);
      }
      curAu += 1;
    }
    return { pos: curPos, size: auSizeAt(curAu) };
  };

  /**
   * Sequential walker for extraction. Asserts the sane-muxer invariant:
   * file offsets non-decreasing in decode order (interleave preserves
   * intra-track order). Violation = refuse to cut rather than mis-cut.
   */
  track.iterateAus = function* iterateAus(fromAu = 0, toAuExclusive = auCount) {
    if (!Number.isInteger(fromAu) || !Number.isInteger(toAuExclusive)) {
      throw new ASRError(`MP4 iterateAus [${fromAu},${toAuExclusive}) không phải số nguyên`);
    }
    if (fromAu < 0 || toAuExclusive > auCount || toAuExclusive < fromAu) {
      throw new ASRError(`MP4 iterateAus [${fromAu},${toAuExclusive}) ngoài [0,${auCount}]`);
    }
    resetCursor();
    let lastPos = -1;
    for (let i = fromAu; i < toAuExclusive; i++) {
      const loc = track.auLocation(i);
      if (loc.pos < lastPos) {
        throw new ASRError(
          `MP4: AU ${i} nằm lùi vị trí file (${loc.pos} < ${lastPos}) — muxer bất thường, từ chối cắt`,
        );
      }
      lastPos = loc.pos;
      yield { index: i, pos: loc.pos, size: loc.size, dtsS: track.auDtsS(i) };
    }
  };
}

/** Top-level inspection: walk moov, collect audio traks, pick best supported. */
export function inspectMp4(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const reader = new MetaReader(fd);
    const fileSize = fs.fstatSync(fd).size;
    const good = [];
    const rejected = [];
    let sawMoov = false;
    for (const box of iterBoxes(reader, 0, fileSize, filePath)) {
      if (box.type !== "moov") continue;
      sawMoov = true;
      for (const trak of iterBoxes(reader, Number(box.dataStart), endOf(box), `${filePath}/moov`)) {
        if (trak.type !== "trak") continue;
        try {
          const parsed = parseAudioTrak(reader, trak, `${filePath}/trak#${good.length + rejected.length}`);
          if (parsed) good.push(parsed);
        } catch (exc) {
          rejected.push(exc?.message ?? String(exc));
        }
      }
    }
    if (!sawMoov) throw new ASRError("MP4 không có moov — fragmented (moof) hoặc file hỏng");
    const chosen = good.find((t) => t.codec === "aac" || t.codec.startsWith("mp3"));
    if (!chosen) {
      const why = rejected.length > 0 ? ` · lý do: ${rejected.join(" | ")}` : "";
      throw new ASRError(`MP4 không có audio track hỗ trợ passthrough${why}`);
    }
    return {
      kind: chosen.codec === "aac" ? "mp4-aac" : "mp4-mp3",
      durationS: chosen.durationS,
      track: chosen,
      rejectedTracks: rejected,
    };
  } finally {
    fs.closeSync(fd);
  }
}

/** ADTS profile field (2 bits) for an AudioObjectType.
 * AOT 1–4 map directly; SBR (5) / PS (29) stream as LC + in-band implicit
 * signaling (what every muxer does — ADTS cannot encode AOT>4). */
export function adtsProfile(aot) {
  if (aot >= 1 && aot <= 4) return aot - 1;
  if (aot === 5 || aot === 29) return 1; // HE-AAC / HE-AACv2 → LC implicit
  throw new ASRError(`AOT ${aot} không đóng gói được vào ADTS (chỉ AOT 1–4, 5, 29)`);
}

/** ADTS header (7 bytes, protection_absent=1) wrapping one AU payload. */
export function adtsHeader(freqIdx, chanCfg, profile, payloadLen) {
  if (!Number.isInteger(freqIdx) || freqIdx < 0 || freqIdx > 12) {
    throw new ASRError(`ADTS freqIdx ${freqIdx} ngoài [0,12] (15 là escape, không dùng trực tiếp)`);
  }
  if (!Number.isInteger(chanCfg) || chanCfg < 1 || chanCfg > 7) {
    throw new ASRError(`ADTS chanCfg ${chanCfg} ngoài [1,7]`);
  }
  if (!Number.isInteger(profile) || profile < 0 || profile > 3) {
    throw new ASRError(`ADTS profile ${profile} ngoài [0,3]`);
  }
  if (!Number.isInteger(payloadLen) || payloadLen < 0) {
    throw new ASRError(`ADTS payload ${payloadLen} vô lý`);
  }
  const frameLength = payloadLen + 7;
  if (frameLength > 0x1fff) throw new ASRError(`AU ${payloadLen}B vượt ADTS frame limit`);
  const h = Buffer.allocUnsafe(7);
  h[0] = 0xff;
  h[1] = 0xf1; // MPEG-4 · layer 0 · no CRC
  h[2] = (profile << 6) | (freqIdx << 2) | ((chanCfg >> 2) & 0x01);
  h[3] = ((chanCfg & 0x03) << 6) | ((frameLength >> 11) & 0x03);
  h[4] = (frameLength >> 3) & 0xff;
  h[5] = ((frameLength & 0x07) << 5) | 0x1f; // buffer fullness 0x7FF (VBR marker)
  h[6] = 0xfc; // fullness low bits · num_aac_frames_in_block − 1 = 0
  return h;
}
