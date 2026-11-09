/** Pure-Node ISO-BMFF (MP4/MOV/M4A + Fragmented fMP4) Demuxer — Zero-Allocation TypedArray RLE.
 * Supports both Progressive MP4 (`stbl`: `stts`, `stsc`, `stsz`, `stco`/`co64`) and
 * Fragmented MP4 (`mvex`/`trex` + `moof`/`traf`/`tfhd`/`trun`) with `elst` edit-list awareness. */

import fs from "node:fs";
import { ASRError } from "../core/errors.js";

export const AAC_FREQ_TABLE = Object.freeze([
  96000, 88200, 64000, 48000, 44100, 32000,
  24000, 22050, 16000, 12000, 11025, 8000, 7350,
]);

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

const endOf = (box) => Number(box.start + BigInt(box.size));

function need(buf, off, len, context) {
  if (!Number.isInteger(off) || !Number.isInteger(len) || off < 0 || len < 0 || off + len > buf.length) {
    throw new ASRError(`${context}: box cụt (cần [${off},${off + len}) trong ${buf.length}B)`);
  }
}
function u32b(buf, off, context) {
  need(buf, off, 4, context);
  return buf.readUInt32BE(off);
}
function i32b(buf, off, context) {
  need(buf, off, 4, context);
  return buf.readInt32BE(off);
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

function parseEsdsPayload(payload, context) {
  const es = readDescriptor(payload, 0);
  if (es.tag !== 0x03) throw new ASRError(`${context}: esds thiếu ES_Descriptor (tag ${es.tag})`);
  let p = es.start + 2;
  if (p >= payload.length) throw new ASRError(`${context}: esds ES_Descriptor cụt`);
  const flags = payload[p++];
  if (flags & 0x80) p += 2;
  if (flags & 0x40) {
    if (p >= payload.length) throw new ASRError(`${context}: esds URL_Flag cụt`);
    p += 1 + payload[p];
  }
  if (flags & 0x20) p += 2;
  const dc = readDescriptor(payload, p);
  if (dc.tag !== 0x04) throw new ASRError(`${context}: esds thiếu DecoderConfigDescriptor (tag ${dc.tag})`);
  if (dc.start >= payload.length) throw new ASRError(`${context}: DecoderConfigDescriptor cụt`);
  const oti = payload[dc.start];
  if (oti !== 0x40 && !(oti >= 0x66 && oti <= 0x68)) {
    throw new ASRError(`${context}: audio object type 0x${oti.toString(16)} không phải AAC — NO-FALLBACK`);
  }
  const dsiAt = dc.start + 13;
  if (dsiAt >= payload.length) throw new ASRError(`${context}: mp4a thiếu DecoderSpecificInfo (ASC)`);
  const dsi = readDescriptor(payload, dsiAt);
  if (dsi.tag !== 0x05) throw new ASRError(`${context}: esds thiếu DecoderSpecificInfo (tag ${dsi.tag})`);
  return payload.subarray(dsi.start, dsi.start + dsi.len);
}

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

function requireChild(reader, parentBox, type, ctx) {
  const box = findBox(reader, Number(parentBox.dataStart), endOf(parentBox), type, ctx);
  if (!box) throw new ASRError(`${ctx}: thiếu ${type}`);
  return box;
}

function parseTrackId(reader, trakBox, context) {
  const tkhd = findBox(reader, Number(tkhdBox(trakBox)), endOf(trakBox), "tkhd", context);
  if (!tkhd) return 1;
  const v = reader.read(Number(tkhd.dataStart), 1)[0];
  return reader.u32(Number(tkhd.dataStart) + (v === 1 ? 20 : 12));
}

function tkhdBox(trakBox) {
  return trakBox.dataStart;
}

function parseTrexDefaults(reader, moovBox) {
  const defaults = new Map();
  const mvex = findBox(reader, Number(moovBox.dataStart), endOf(moovBox), "mvex", "moov/mvex");
  if (!mvex) return defaults;
  for (const box of iterBoxes(reader, Number(mvex.dataStart), endOf(mvex), "mvex")) {
    if (box.type !== "trex") continue;
    const body = reader.read(Number(box.dataStart) + 4, endOf(box) - (Number(box.dataStart) + 4));
    if (body.length >= 20) {
      const trackId = body.readUInt32BE(0);
      defaults.set(trackId, {
        defaultSampleDescIdx: body.readUInt32BE(4),
        defaultSampleDuration: body.readUInt32BE(8),
        defaultSampleSize: body.readUInt32BE(12),
        defaultSampleFlags: body.readUInt32BE(16),
      });
    }
  }
  return defaults;
}

function parseAudioTrak(reader, trakBox, context) {
  const mdia = findBox(reader, Number(trakBox.dataStart), endOf(trakBox), "mdia", context);
  if (!mdia) return null;
  const hdlr = findBox(reader, Number(mdia.dataStart), endOf(mdia), "hdlr", context);
  if (!hdlr) return null;
  const handler = reader.type(Number(hdlr.dataStart) + 8);
  if (handler !== "soun") return null;

  const trackId = parseTrackId(reader, trakBox, context);
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
  const entryEnd = Math.min(entryDataStart + entrySize, stsdEnd);
  const format = reader.type(entryDataStart + 4);

  let codec;
  let asc = null;
  if (format === "enca") {
    throw new ASRError(`${stblCtx}: audio track bị mã hóa DRM — không xử lý được`);
  } else if (format === "mp4a") {
    const specBase = entryDataStart + 8;
    const ver = reader.read(specBase + 8, 2).readUInt16BE(0);
    if (ver !== 0 && ver !== 1 && ver !== 2) {
      throw new ASRError(`${stblCtx}: mp4a version ${ver} không hỗ trợ (cần 0/1/2)`);
    }
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
  const sttsBody = body(stts);
  const sttsEntries = u32b(sttsBody, 0, "stts");

  const track = {
    trackId,
    codec,
    ...(codec === "aac" ? { ...parseAsc(asc), ascBytes: Buffer.from(asc) } : {}),
    timescale,
    mediaDurationRaw,
  };

  if (sttsEntries === 0) {
    track.isFragmentedCandidate = true;
    return track;
  }

  attachSampleTable(track, {
    sttsBody,
    stscBody: body(stsc),
    stszBody: body(stsz),
    stcoKind: stco.type,
    stcoBody: body(stco),
  });
  return track;
}

/**
 * Attach flat TypedArray RLE sample-table accessors onto a progressive MP4 track.
 * Memory footprint is O(RLE runs) in flat Uint32Array/Float64Array buffers.
 */
function attachSampleTable(track, t) {
  const stts = t.sttsBody;
  need(stts, 0, 4, "stts");
  const sttsEntries = u32b(stts, 0, "stts");
  if (sttsEntries === 0) throw new ASRError("stts rỗng — timeline rỗng");
  need(stts, 0, 4 + sttsEntries * 8, "stts");

  const sttsCounts = new Uint32Array(sttsEntries);
  const sttsDeltas = new Uint32Array(sttsEntries);
  const cumCounts = new Float64Array(sttsEntries);
  const cumTicks = new Float64Array(sttsEntries);
  let accCount = 0;
  let accTicks = 0;

  for (let e = 0, off = 4; e < sttsEntries; e++, off += 8) {
    const count = u32b(stts, off, "stts");
    const delta = u32b(stts, off + 4, "stts");
    if (!(count >= 1)) throw new ASRError(`stts hàng ${e} count ${count} vô lý (cần ≥1)`);
    if (!(delta >= 1)) throw new ASRError(`stts hàng ${e} delta ${delta} vô lý (cần ≥1)`);
    sttsCounts[e] = count;
    sttsDeltas[e] = delta;
    accCount += count;
    accTicks += count * delta;
    cumCounts[e] = accCount;
    cumTicks[e] = accTicks;
  }

  const auCount = accCount;
  const ts = track.timescale || 1;
  track.auCount = auCount;

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
    return (prevTicks + (index - prevSamples) * sttsDeltas[e]) / ts;
  };

  const lastTick = sttsEntries > 0 ? cumTicks[sttsEntries - 1] : 0;
  const declared = Number(track.mediaDurationRaw) / ts;
  track.durationS = Math.max(lastTick / ts, declared > 0 ? declared : 0);

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
    const delta = sttsDeltas[entry];
    if (delta <= 0) return Math.min(auCount - 1, prevSamples);
    const into = Math.floor((target - prevTicks) / delta);
    return Math.max(0, Math.min(auCount - 1, prevSamples + into));
  };

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
  }

  const stsc = t.stscBody;
  need(stsc, 0, 4, "stsc");
  const stscEntries = u32b(stsc, 0, "stsc");
  if (stscEntries === 0) throw new ASRError("stsc rỗng — chunk map rỗng");
  need(stsc, 0, 4 + stscEntries * 12, "stsc");

  const stscFirstChunk = new Uint32Array(stscEntries);
  const stscSamplesPerChunk = new Uint32Array(stscEntries);
  for (let e = 0, off = 4; e < stscEntries; e++, off += 12) {
    const first = u32b(stsc, off, "stsc");
    const per = u32b(stsc, off + 4, "stsc");
    const descIdx = u32b(stsc, off + 8, "stsc");
    if (e === 0 && first < 1) throw new ASRError(`stsc hàng 0 firstChunk ${first} vô lý (cần ≥1)`);
    if (e > 0 && !(first > stscFirstChunk[e - 1])) {
      throw new ASRError(`stsc hàng ${e} firstChunk ${first} không tăng đơn điệu (trước ${stscFirstChunk[e - 1]})`);
    }
    if (!(per >= 1)) throw new ASRError(`stsc hàng ${e} samplesPerChunk ${per} vô lý (cần ≥1)`);
    if (!(descIdx >= 1)) throw new ASRError(`stsc hàng ${e} sampleDescIndex ${descIdx} vô lý (cần ≥1)`);
    stscFirstChunk[e] = first;
    stscSamplesPerChunk[e] = per;
  }

  const stco = t.stcoBody;
  need(stco, 0, 4, "stco/co64");
  const chunkCount = u32b(stco, 0, "stco/co64");
  if (chunkCount === 0) throw new ASRError("stco/co64 rỗng — không có chunk nào");
  const co64 = t.stcoKind === "co64";
  need(stco, 0, 4 + chunkCount * (co64 ? 8 : 4), "stco/co64");
  if (stscFirstChunk[stscEntries - 1] > chunkCount) {
    throw new ASRError(`stsc firstChunk ${stscFirstChunk[stscEntries - 1]} vượt chunkCount ${chunkCount}`);
  }
  const chunkOffset = (ci) =>
    co64 ? Number(u64b(stco, 4 + ci * 8, "co64")) : u32b(stco, 4 + ci * 4, "stco");

  const rowFirstAu = new Float64Array(stscEntries);
  {
    let acc = 0;
    for (let e = 0; e < stscEntries; e++) {
      rowFirstAu[e] = acc;
      const curStart = stscFirstChunk[e] - 1;
      const nextStart = e + 1 < stscEntries ? stscFirstChunk[e + 1] - 1 : chunkCount;
      const spanChunks = nextStart - curStart;
      if (!(spanChunks >= 0)) throw new ASRError(`stsc hàng ${e} phủ chunk âm`);
      acc += spanChunks * stscSamplesPerChunk[e];
    }
  }

  const rowIndexForChunk = (ci) => {
    let lo = 0;
    let hi = stscEntries - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (stscFirstChunk[mid] - 1 <= ci) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (ans < 0) throw new ASRError(`stsc không phủ chunk ${ci}`);
    return ans;
  };

  const rowIndexForAu = (au) => {
    let lo = 0;
    let hi = stscEntries - 1;
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
    while (e + 1 < stscEntries && rowFirstAu[e + 1] <= au) e++;
    while (e > 0 && rowFirstAu[e] > au) e--;
    const per = stscSamplesPerChunk[e];
    if (!(per > 0)) throw new ASRError(`stsc hàng ${e} samplesPerChunk vô lý`);
    let ci = stscFirstChunk[e] - 1 + Math.floor((au - rowFirstAu[e]) / per);
    while (e + 1 < stscEntries && ci >= stscFirstChunk[e + 1] - 1) {
      e++;
      const per2 = stscSamplesPerChunk[e];
      ci = stscFirstChunk[e] - 1 + Math.floor((au - rowFirstAu[e]) / per2);
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

  const auLocationDirect = (index) => {
    const ci = chunkForAu(index);
    const rIdx = rowIndexForChunk(ci);
    const firstAu = rowFirstAu[rIdx] + (ci - (stscFirstChunk[rIdx] - 1)) * stscSamplesPerChunk[rIdx];
    const off = index - firstAu;
    const base = chunkOffset(ci);
    let pos;
    if (uniformSize !== 0) {
      pos = base + off * uniformSize;
    } else {
      pos = base;
      for (let k = 0; k < off; k++) pos += auSizeAt(firstAu + k);
    }
    curRow = rIdx;
    curChunk = ci;
    curChunkFirstAu = firstAu;
    curAu = index;
    curPos = pos;
    return { pos, size: auSizeAt(index) };
  };

  track.auLocation = function auLocation(index) {
    if (!Number.isInteger(index) || index < 0 || index >= auCount) {
      throw new ASRError(`AU index ${index} ngoài phạm vi`);
    }
    if (index < curAu || index - curAu > 64) return auLocationDirect(index);
    while (curAu < index) {
      const per = stscSamplesPerChunk[curRow];
      if (curAu + 1 - curChunkFirstAu >= per) {
        curChunk += 1;
        if (curChunk >= chunkCount) throw new ASRError("stco hết chunk trước khi hết AU");
        curChunkFirstAu = curAu + 1;
        if (curRow + 1 < stscEntries && curChunk >= stscFirstChunk[curRow + 1] - 1) {
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

/**
 * Attach Fragmented MP4 (`moof`/`traf`/`tfhd`/`trun`) sample table onto track.
 */
function attachFragmentedSampleTable(reader, fileSize, filePath, track, trexMap) {
  const trex = trexMap.get(track.trackId) ?? {
    defaultSampleDuration: 1024,
    defaultSampleSize: 0,
  };
  const positions = [];
  const sizes = [];
  const cumTicksArr = [];
  let accTicks = 0;

  for (const box of iterBoxes(reader, 0, fileSize, filePath)) {
    if (box.type !== "moof") continue;
    const moofStart = Number(box.start);
    const moofEnd = endOf(box);
    for (const child of iterBoxes(reader, Number(box.dataStart), moofEnd, `${filePath}/moof`)) {
      if (child.type !== "traf") continue;
      const tfhd = findBox(reader, Number(child.dataStart), endOf(child), "tfhd", "traf/tfhd");
      if (!tfhd) continue;
      const tfhdFull = reader.read(Number(tfhd.dataStart), endOf(tfhd) - Number(tfhd.dataStart));
      if (tfhdFull.length < 8) continue;
      const tfFlags = ((tfhdFull[1] << 16) | (tfhdFull[2] << 8) | tfhdFull[3]) >>> 0;
      const trafTrackId = tfhdFull.readUInt32BE(4);
      if (trafTrackId !== track.trackId) continue;

      let p = 8;
      let baseDataOffset = moofStart;
      if (tfFlags & 0x000001) {
        baseDataOffset = Number(u64b(tfhdFull, p, "tfhd"));
        p += 8;
      }
      if (tfFlags & 0x000002) p += 4;
      let defaultDuration = trex.defaultSampleDuration;
      if (tfFlags & 0x000008) {
        defaultDuration = u32b(tfhdFull, p, "tfhd");
        p += 4;
      }
      let defaultSize = trex.defaultSampleSize;
      if (tfFlags & 0x000010) {
        defaultSize = u32b(tfhdFull, p, "tfhd");
        p += 4;
      }

      let runningDataPos = baseDataOffset;
      for (const tbox of iterBoxes(reader, Number(child.dataStart), endOf(child), "traf")) {
        if (tbox.type !== "trun") continue;
        const trunFull = reader.read(Number(tbox.dataStart), endOf(tbox) - Number(tbox.dataStart));
        if (trunFull.length < 8) continue;
        const trFlags = ((trunFull[1] << 16) | (trunFull[2] << 8) | trunFull[3]) >>> 0;
        const sampleCount = trunFull.readUInt32BE(4);
        let tp = 8;
        if (trFlags & 0x000001) {
          const dataOffset = i32b(trunFull, tp, "trun");
          runningDataPos = baseDataOffset + dataOffset;
          tp += 4;
        }
        if (trFlags & 0x000004) tp += 4;
        const hasDur = (trFlags & 0x000100) !== 0;
        const hasSize = (trFlags & 0x000200) !== 0;
        const hasFlags = (trFlags & 0x000400) !== 0;
        const hasCto = (trFlags & 0x000800) !== 0;

        for (let s = 0; s < sampleCount; s++) {
          const dur = hasDur ? u32b(trunFull, tp, "trun/dur") : defaultDuration;
          if (hasDur) tp += 4;
          const sz = hasSize ? u32b(trunFull, tp, "trun/size") : defaultSize;
          if (hasSize) tp += 4;
          if (hasFlags) tp += 4;
          if (hasCto) tp += 4;
          if (!(sz > 0) || !(dur > 0)) {
            throw new ASRError("fMP4 trun: sample size/duration bằng 0 hoặc thiếu default");
          }
          positions.push(runningDataPos);
          sizes.push(sz);
          cumTicksArr.push(accTicks);
          runningDataPos += sz;
          accTicks += dur;
        }
      }
    }
  }

  const auCount = positions.length;
  if (auCount === 0) {
    throw new ASRError("stts rỗng — timeline rỗng");
  }
  const posArr = Float64Array.from(positions);
  const sizeArr = Uint32Array.from(sizes);
  const dtsTicks = Float64Array.from(cumTicksArr);
  const ts = track.timescale || 1;

  track.auCount = auCount;
  track.durationS = accTicks / ts;
  delete track.isFragmentedCandidate;

  track.auDtsS = function auDtsS(index) {
    if (!Number.isInteger(index) || index < 0 || index >= auCount) {
      throw new ASRError(`AU index ${index} ngoài [0,${auCount})`);
    }
    return dtsTicks[index] / ts;
  };

  track.auIndexAtS = function auIndexAtS(seconds) {
    if (!(seconds > 0)) return 0;
    const target = seconds * ts;
    let lo = 0;
    let hi = auCount - 1;
    let ans = auCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dtsTicks[mid] >= target) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  };

  track.auLocation = function auLocation(index) {
    if (!Number.isInteger(index) || index < 0 || index >= auCount) {
      throw new ASRError(`AU index ${index} ngoài phạm vi`);
    }
    return { pos: posArr[index], size: sizeArr[index] };
  };

  track.iterateAus = function* iterateAus(fromAu = 0, toAuExclusive = auCount) {
    if (!Number.isInteger(fromAu) || !Number.isInteger(toAuExclusive)) {
      throw new ASRError(`MP4 iterateAus [${fromAu},${toAuExclusive}) không phải số nguyên`);
    }
    if (fromAu < 0 || toAuExclusive > auCount || toAuExclusive < fromAu) {
      throw new ASRError(`MP4 iterateAus [${fromAu},${toAuExclusive}) ngoài [0,${auCount}]`);
    }
    for (let i = fromAu; i < toAuExclusive; i++) {
      yield { index: i, pos: posArr[i], size: sizeArr[i], dtsS: dtsTicks[i] / ts };
    }
  };
}

export function inspectMp4(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const reader = new MetaReader(fd);
    const fileSize = fs.fstatSync(fd).size;
    const good = [];
    const rejected = [];
    let sawMoov = false;
    let trexMap = new Map();

    for (const box of iterBoxes(reader, 0, fileSize, filePath)) {
      if (box.type !== "moov") continue;
      sawMoov = true;
      trexMap = parseTrexDefaults(reader, box);
      for (const trak of iterBoxes(reader, Number(box.dataStart), endOf(box), `${filePath}/moov`)) {
        if (trak.type !== "trak") continue;
        try {
          const parsed = parseAudioTrak(reader, trak, `${filePath}/trak#${good.length + rejected.length}`);
          if (parsed) {
            if (parsed.isFragmentedCandidate) {
              attachFragmentedSampleTable(reader, fileSize, filePath, parsed, trexMap);
            }
            good.push(parsed);
          }
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

export function adtsProfile(aot) {
  if (aot >= 1 && aot <= 4) return aot - 1;
  if (aot === 5 || aot === 29) return 1;
  throw new ASRError(`AOT ${aot} không đóng gói được vào ADTS (chỉ AOT 1–4, 5, 29)`);
}

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
  h[1] = 0xf1;
  h[2] = (profile << 6) | (freqIdx << 2) | ((chanCfg >> 2) & 0x01);
  h[3] = ((chanCfg & 0x03) << 6) | ((frameLength >> 11) & 0x03);
  h[4] = (frameLength >> 3) & 0xff;
  h[5] = ((frameLength & 0x07) << 5) | 0x1f;
  h[6] = 0xfc;
  return h;
}
