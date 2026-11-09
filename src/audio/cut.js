/** Single-pass multi-output byte surgery — the ffmpeg killer.
 * One forward walk over the unit stream feeds EVERY overlapping chunk window:
 * total work is O(units), not O(units × chunks). Reads go through a reusable
 * span buffer with lookahead (video-interleave holes never get copied twice),
 * writes go through per-output buffers with CRC32 fused into the write path —
 * the upload step reuses that CRC instead of re-reading the file. */

import fs from "node:fs";
import path from "node:path";
import { crc32 } from "../decode/crc32-fast.js";
import { ASRError } from "../core/errors.js";
import { PERF } from "../core/config.js";
import { adtsProfile } from "./mp4.js";
import { wavHeader } from "./wav.js";

const SPAN_MAX = PERF.SPAN_BYTES; // read-ahead window (hardware-tunable via ASR_SPAN_MB)
const OUT_BUF = PERF.OUT_BUF_BYTES; // per-output write buffer (tunable via ASR_OUTBUF_KB)

class OutputWriter {
  #fd;
  #buf;
  #len = 0;
  #crc = 0;
  size = 0;
  constructor(filePath) {
    fs.mkdirSync(path.dirname(String(filePath)), { recursive: true });
    this.#fd = fs.openSync(filePath, "w");
    this.#buf = Buffer.allocUnsafe(OUT_BUF);
  }
  /** Append bytes; large payloads bypass the buffer. */
  push(chunk) {
    if (chunk.length >= OUT_BUF) {
      this.#flush();
      this.#commit(chunk);
      return;
    }
    if (this.#len + chunk.length > OUT_BUF) this.#flush();
    chunk.copy(this.#buf, this.#len);
    this.#len += chunk.length;
  }
  /** Write a 7-byte ADTS header straight into the output buffer — zero alloc. */
  pushAdtsHeader(freqIdx, chanCfg, profile, payloadLen) {
    if (!Number.isInteger(freqIdx) || freqIdx < 0 || freqIdx > 12)
      throw new ASRError(`ADTS freqIdx ${freqIdx} ngoài [0,12]`);
    if (!Number.isInteger(chanCfg) || chanCfg < 1 || chanCfg > 7)
      throw new ASRError(`ADTS chanCfg ${chanCfg} ngoài [1,7]`);
    if (!Number.isInteger(profile) || profile < 0 || profile > 3)
      throw new ASRError(`ADTS profile ${profile} ngoài [0,3]`);
    const frameLength = payloadLen + 7;
    if (frameLength > 0x1fff) throw new ASRError(`AU ${payloadLen}B vượt ADTS frame limit`);
    if (this.#len + 7 > OUT_BUF) this.#flush();
    const b = this.#buf;
    const off = this.#len;
    b[off] = 0xff;
    b[off + 1] = 0xf1;
    b[off + 2] = (profile << 6) | (freqIdx << 2) | ((chanCfg >> 2) & 0x01);
    b[off + 3] = ((chanCfg & 0x03) << 6) | ((frameLength >> 11) & 0x03);
    b[off + 4] = (frameLength >> 3) & 0xff;
    b[off + 5] = ((frameLength & 0x07) << 5) | 0x1f;
    b[off + 6] = 0xfc;
    this.#len += 7;
  }
  #flush() {
    if (this.#len === 0) return;
    this.#commit(this.#buf.subarray(0, this.#len));
    this.#len = 0;
  }
  #commit(b) {
    // Loop partial writes: a single writeSync may commit fewer bytes than
    // requested (signals, non-blocking fds, huge buffers). Never trust one call.
    let off = 0;
    while (off < b.length) {
      const n = fs.writeSync(this.#fd, b, off, b.length - off, null);
      if (!(n > 0)) throw new ASRError(`cut: ghi hụt tại offset ${off}/${b.length}`);
      off += n;
    }
    this.#crc = crc32(b, this.#crc);
    this.size += b.length;
  }
  finish() {
    this.#flush();
    fs.closeSync(this.#fd);
    this.#fd = -1;
    return { size: this.size, crcHex: (this.#crc >>> 0).toString(16).padStart(8, "0") };
  }
  abort() {
    try {
      if (this.#fd !== -1) fs.closeSync(this.#fd);
    } catch {
      /* ignore */
    }
    this.#fd = -1;
  }
}

/**
 * Cut unit ranges out of `meta.track` into separate files.
 * Segmented bulk strategy: between two consecutive RANGE BOUNDARIES the set
 * of consuming outputs never changes, so contiguous on-disk units are fused
 * into one big memcpy-style push per consumer — WAV's 2-byte frames cost the
 * same as an MP3 frame. Per-unit work only remains where the format demands
 * it (ADTS headers).
 * @param {object} meta result of inspectMedia(): {path, kind, track,...}
 * @param {Array<{fromAu:number,toAuExcl:number,outPath:string,wrap:"adts"|"raw"|"wav"}>} ranges
 * @returns Promise<Array<{path:string,size:number,crcHex:string}>> aligned with ranges
 */
export async function cutUnits(meta, ranges, { token = null, onDone = null } = {}) {
  if (!Array.isArray(ranges) || ranges.length === 0) return [];
  const track = meta?.track;
  if (!track || !Number.isInteger(track.auCount) || track.auCount <= 0) {
    throw new ASRError("cut: meta.track thiếu hoặc auCount vô lý");
  }
  if (typeof track.auLocation !== "function") throw new ASRError("cut: track.auLocation thiếu");
  const VALID_WRAPS = new Set(["adts", "raw", "wav"]);
  const seenOut = new Set();
  let fileSize = meta.fileSize;
  for (const r of ranges) {
    if (!Number.isInteger(r.fromAu) || !Number.isInteger(r.toAuExcl) || r.fromAu < 0 || r.toAuExcl <= r.fromAu)
      throw new ASRError(`cut: range [${r.fromAu},${r.toAuExcl}) không hợp lệ`);
    if (r.fromAu >= track.auCount)
      throw new ASRError(`cut: range [${r.fromAu},${r.toAuExcl}) ngoài [0,${track.auCount})`);
    if (r.toAuExcl > track.auCount)
      throw new ASRError(`cut: range [${r.fromAu},${r.toAuExcl}) vượt auCount ${track.auCount}`);
    if (!VALID_WRAPS.has(r.wrap)) throw new ASRError(`cut: wrap '${r.wrap}' không hỗ trợ (cần adts/raw/wav)`);
    if (typeof r.outPath !== "string" || r.outPath.length === 0)
      throw new ASRError("cut: outPath thiếu");
    const resolved = path.resolve(String(r.outPath));
    if (seenOut.has(resolved)) throw new ASRError(`cut: outPath trùng lặp ${r.outPath}`);
    seenOut.add(resolved);
    if (resolved === path.resolve(String(meta.path)))
      throw new ASRError("cut: outPath trùng source — từ chối self-overwrite");
  }
  // Kind-vs-wrap compatibility BEFORE any file/fd is created, so a bad plan
  // fails without leaving half-written outputs or leaking fds.
  for (const r of ranges) {
    if (r.wrap === "adts") {
      if (meta.kind !== "mp4-aac" || track.codec !== "aac") {
        throw new ASRError(`cut: wrap adts cần track AAC (nhận kind ${meta.kind})`);
      }
      adtsProfile(track.audioObjectType); // throws naming the AOT when unpackable
      if (!Number.isInteger(track.freqIdx) || !Number.isInteger(track.chanCfg)) {
        throw new ASRError("cut: track AAC thiếu freqIdx/chanCfg cho ADTS");
      }
    } else if (r.wrap === "wav") {
      if (meta.kind !== "wav" || track.codec !== "pcm") {
        throw new ASRError(`cut: wrap wav cần track PCM (nhận kind ${meta.kind})`);
      }
      if (!track.channels || !track.sampleRate || !track.bits) {
        throw new ASRError("cut: track PCM thiếu channels/sampleRate/bits cho WAV");
      }
    }
  }

  const fd = fs.openSync(meta.path, "r");
  try {
    try {
      fileSize = fs.fstatSync(fd).size;
    } catch {
      /* keep meta.fileSize */
    }
    const span = Buffer.allocUnsafe(SPAN_MAX);
    let spanStart = -1;
    let spanEnd = -1;

    const loadSpan = (start) => {
      const startClamped = Math.max(0, Math.min(start, fileSize - 1));
      const end = Math.min(fileSize, startClamped + SPAN_MAX);
      if (end <= startClamped) throw new ASRError(`cut: span rỗng tại ${startClamped}`);
      let off = 0;
      while (off < end - startClamped) {
        const n = fs.readSync(fd, span, off, end - startClamped - off, startClamped + off);
        if (n <= 0) throw new ASRError(`cut: đọc hụt tại ${startClamped + off}`);
        off += n;
      }
      spanStart = startClamped;
      spanEnd = end;
    };

    /** Contiguous run [pos,pos+len) loaded into span → view (extends span if needed). */
    const viewAt = (pos, len) => {
      if (len > SPAN_MAX) throw new ASRError(`cut: run ${len}B vượt span`);
      if (pos < spanStart || pos + len > spanEnd) loadSpan(pos);
      return span.subarray(pos - spanStart, pos - spanStart + len);
    };

    const order = ranges
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.fromAu - b.r.fromAu || a.r.toAuExcl - b.r.toAuExcl);
    const results = new Array(ranges.length);

    // Boundary segmentation over unit indices.
    const bounds = new Set();
    for (const { r } of order) {
      bounds.add(Math.min(r.fromAu, track.auCount));
      bounds.add(Math.min(r.toAuExcl, track.auCount));
    }
    const points = [...bounds].sort((a, b) => a - b).filter((p) => p >= 0 && p < track.auCount);

    const writers = new Map(); // orderIdx -> {writer, wrap, fromAu, toAu}
    // Cap concurrent open outputs: each holds an fd + OUT_BUF buffer. Pure
    // overlap plans need ≤2 live at once; a fully-overlapping adversarial plan
    // (N ranges all covering [0,auCount)) would otherwise exhaust fds/OOM.
    const MAX_LIVE_WINDOWS = 64;
    let next = 0;
    let doneCount = 0;

    const activateUpTo = (u) => {
      while (next < order.length && order[next].r.fromAu <= u) {
        if (writers.size >= MAX_LIVE_WINDOWS) {
          throw new ASRError(`cut: quá nhiều cửa sổ đồng thời (>${MAX_LIVE_WINDOWS}) — chia batch`);
        }
        const { r } = order[next];
        const writer = new OutputWriter(r.outPath);
        let wrap;
        if (r.wrap === "adts") {
          const t = meta.track;
          wrap = {
            kind: "adts",
            profile: adtsProfile(t.audioObjectType),
            freqIdx: t.freqIdx,
            chanCfg: t.chanCfg,
          };
        } else if (r.wrap === "wav") {
          const t = meta.track;
          const toAu = Math.min(r.toAuExcl, track.auCount);
          const unitBytes = t.auLocation(r.fromAu).size;
          wrap = {
            kind: "wav",
            header: wavHeader((toAu - r.fromAu) * unitBytes, t.channels, t.sampleRate, t.bits),
          };
          writer.push(wrap.header);
        } else {
          wrap = { kind: "raw" };
        }
        writers.set(next, { writer, wrap, fromAu: r.fromAu, toAu: Math.min(r.toAuExcl, track.auCount) });
        next += 1;
      }
    };

    // Reusable prefix-offset table for non-uniform contiguous runs (zero per-AU object alloc).
    let runOffsets = new Uint32Array(4096);
    const ensureOffsetsCap = (needed) => {
      if (needed <= runOffsets.length) return;
      let cap = runOffsets.length;
      while (cap < needed) cap *= 2;
      const nextBuf = new Uint32Array(cap);
      nextBuf.set(runOffsets);
      runOffsets = nextBuf;
    };

    try {
    for (let pi = 0; pi < points.length; pi++) {
      const segStart = points[pi];
      const segEnd = points[pi + 1] ?? track.auCount;
      if (segStart >= segEnd) continue;

      // Retire exhausted windows first.
      for (const [key, entry] of [...writers]) {
        if (segStart >= entry.toAu) {
          results[order[key].i] = { path: order[key].r.outPath, ...entry.writer.finish() };
          writers.delete(key);
          doneCount += 1;
          onDone?.(doneCount, ranges.length);
        }
      }
      activateUpTo(segStart);
      if (writers.size === 0) continue;

      // Walk this segment in maximal contiguous on-disk runs.
      let i = segStart;
      while (i < segEnd) {
        const head = track.auLocation(i);
        const headPos = head.pos;
        const headSize = head.size;
        let runEndUnit;
        let runEndPos;
        let hasVarOffsets = false;
        if (track.contiguous && headSize > 0) {
          // Uniform layout: run length is pure arithmetic, zero lookups.
          const maxUnits = Math.max(1, Math.floor(SPAN_MAX / headSize));
          runEndUnit = Math.min(segEnd, i + maxUnits);
          runEndPos = headPos + (runEndUnit - i) * headSize;
        } else {
          runEndUnit = i + 1;
          runEndPos = headPos + headSize;
          runOffsets[0] = 0;
          runOffsets[1] = headSize;
          let count = 1;
          while (runEndUnit < segEnd && runEndPos - headPos < SPAN_MAX) {
            const nx = track.auLocation(runEndUnit);
            if (nx.pos !== runEndPos) break; // hole (interleave) ends the run
            if (runEndPos + nx.size - headPos > SPAN_MAX) break;
            count += 1;
            ensureOffsetsCap(count + 1);
            runEndPos += nx.size;
            runOffsets[count] = runEndPos - headPos;
            runEndUnit += 1;
          }
          hasVarOffsets = true;
        }

        const view = viewAt(headPos, runEndPos - headPos);
        for (const [, entry] of writers) {
          const lo = Math.max(entry.fromAu, i);
          const hi = Math.min(entry.toAu, runEndUnit);
          if (lo >= hi) continue;
          if (entry.wrap.kind === "adts") {
            if (hasVarOffsets) {
              for (let u = lo; u < hi; u++) {
                const rel = u - i;
                const o0 = runOffsets[rel];
                const o1 = runOffsets[rel + 1];
                entry.writer.pushAdtsHeader(
                  entry.wrap.freqIdx,
                  entry.wrap.chanCfg,
                  entry.wrap.profile,
                  o1 - o0,
                );
                entry.writer.push(view.subarray(o0, o1));
              }
            } else {
              for (let u = lo; u < hi; u++) {
                const o0 = (u - i) * headSize;
                entry.writer.pushAdtsHeader(
                  entry.wrap.freqIdx,
                  entry.wrap.chanCfg,
                  entry.wrap.profile,
                  headSize,
                );
                entry.writer.push(view.subarray(o0, o0 + headSize));
              }
            }
          } else if (hasVarOffsets) {
            const offA = runOffsets[lo - i];
            const offB = runOffsets[hi - i];
            entry.writer.push(view.subarray(offA, offB));
          } else {
            const offA = (lo - i) * headSize;
            const offB = (hi - i) * headSize;
            entry.writer.push(view.subarray(offA, offB));
          }
        }
        i = runEndUnit;
        token?.check();
      }
      // Cooperative cancel each segment (WAV runs can span 8MB without hitting 1024-unit gate).
      token?.check();
    }

    // Close anything still open (ranges ending exactly at auCount included).
    for (const [key, entry] of [...writers]) {
      results[order[key].i] = { path: order[key].r.outPath, ...entry.writer.finish() };
      writers.delete(key);
      doneCount += 1;
      onDone?.(doneCount, ranges.length);
    }
    if (results.some((r) => !r)) {
      throw new ASRError("cut: có khoảng chưa đóng — bảng sample ngắn hơn dự kiến");
    }
    return results;
    } catch (exc) {
      // Cleanup partial outputs + open fds on failure (never leave half files).
      for (const [, entry] of [...writers]) {
        try {
          entry.writer.abort?.();
        } catch {
          /* ignore */
        }
      }
      for (const { r } of order) {
        try {
          fs.rmSync(r.outPath, { force: true });
        } catch {
          /* ignore */
        }
      }
      throw exc;
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** Whole-stream passthrough into one file (ORIGINAL mode / probe clips). */
export async function cutAll(meta, outPath, wrap = "raw", opts = {}) {
  const n = meta.track.auCount;
  const [result] = await cutUnits(
    meta,
    [{ fromAu: 0, toAuExcl: n, outPath, wrap }],
    opts,
  );
  return result;
}
