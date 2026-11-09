/** Pure-Node adaptive chunker — container byte surgery, ZERO transcode.
 * No ffmpeg, no PCM detour, no LAME: cut the original compressed stream at
 * exact frame boundaries (AAC access units / MP3 frames / PCM frames) with
 * overlap windows. One sequential pass feeds every chunk at memory speed.
 * `ASR_SILENCE=1` silence planning stays available for WAV PCM inputs. */

import path from "node:path";
import { cutUnits } from "./cut.js";
import { planOverlap } from "./overlap.js";
import { boundaries, detectSilenceMidpoints } from "./silence.js";
import { PERF } from "../core/config.js";
import { ASRError } from "../core/errors.js";
import { Chunk } from "../core/domain.js";
import { METRICS } from "../core/metrics.js";

const EXT_BY_KIND = new Map([
  ["mp4-aac", "aac"],
  ["mp4-mp3", "mp3"],
  ["mp3", "mp3"],
  ["wav", "wav"],
]);

const WRAP_BY_KIND = new Map([
  ["mp4-aac", "adts"],
  ["mp4-mp3", "raw"],
  ["mp3", "raw"],
  ["wav", "wav"],
]);

export class AdaptiveChunker {
  #token;
  #progress;

  constructor(token, progress = () => {}) {
    this.#token = token;
    this.#progress = progress;
  }

  /** Turbo split: passthrough-cut N overlapping chunks in ONE source pass. */
  async split(meta, folder) {
    const token = this.#token;
    const progress = this.#progress;
    if (!meta || typeof meta !== "object") throw new ASRError("chunker: meta thiếu");
    const track = meta.track;
    if (!track || !Number.isInteger(track.auCount) || track.auCount <= 0) {
      throw new ASRError("chunker: meta.track thiếu hoặc auCount vô lý");
    }
    if (!(meta.durationS > 0 && Number.isFinite(meta.durationS))) {
      throw new ASRError("chunker: meta.durationS vô lý");
    }
    if (typeof track.auIndexAtS !== "function" || typeof track.auCount !== "number") {
      throw new ASRError("chunker: track thiếu accessor auIndexAtS/auCount");
    }
    token.check();

    let silences;
    if (PERF.SILENCE_DETECT) {
      progress(12, "Quét silence & khoảng lặng giọng nói (VAD đa ngôn ngữ)…");
      silences = await METRICS.time("silence_scan_ms", () =>
        detectSilenceMidpoints(meta, { token }),
      );
      if (silences.length > 0) {
        progress(13, `Tìm thấy ${silences.length} điểm lặng âm thanh · lên lịch cắt tại vùng không có voice…`);
      }
    } else {
      progress(12, "Turbo cut · mốc cố định (bỏ silence)…");
      silences = [];
    }

    const duration = meta.durationS;
    let points = boundaries(duration, silences);
    // Tail merge (defense in depth — boundaries() already merges, but custom
    // silence arrays can still leave a sliver): a final core shorter than the
    // overlap footprint is ~100% duplicated audio, so fold it into the previous
    // chunk instead of emitting a near-empty file.
    {
      const minTail = Math.min(PERF.CHUNK_CORE_S * 0.1, PERF.SILENCE_WINDOW * 0.5);
      if (points.length > 2 && duration - points[points.length - 2] < minTail) {
        points = [...points.slice(0, -2), duration];
      }
    }
    const count = Math.max(1, points.length - 1);
    const wrapKind = WRAP_BY_KIND.get(meta.kind);
    if (!wrapKind) throw new ASRError(`chunker: kind ${meta.kind} chưa hỗ trợ wrap`);
    const ext = EXT_BY_KIND.get(meta.kind);
    if (!ext) throw new ASRError(`chunker: kind ${meta.kind} thiếu ext`);
    const ranges = [];
    const chunks = [];

    // EOF epsilon: boundaries()/planOverlap accumulate float error (~1e-12 per
    // add), so a window ending within 1ns of duration is treated as touching
    // EOF and takes every remaining unit instead of auIndexAtS(end), which
    // could otherwise drop the final AU to rounding.
    const EOF_EPS = 1e-9;
    const hasDts = typeof track.auDtsS === "function";
    for (let index = 0; index < count; index++) {
      const [coreStart, coreEnd] = [points[index], points[index + 1]];
      const startIsSilence = index > 0 && silences.some((s) => Math.abs(s - coreStart) < 0.15);
      const endIsSilence = index < count - 1 && silences.some((s) => Math.abs(s - coreEnd) < 0.15);

      let planStart, planEnd;
      if (startIsSilence && endIsSilence) {
        // Cả hai đầu mốc đều là khoảng lặng (không có giọng nói) — cắt trực tiếp tại điểm lặng, không cắt đứt câu
        planStart = coreStart;
        planEnd = coreEnd;
      } else if (startIsSilence) {
        planStart = coreStart;
        planEnd = Math.min(duration, coreEnd + (index < count - 1 ? PERF.OVERLAP_S : 0.0));
      } else if (endIsSilence) {
        planStart = Math.max(0.0, coreStart - (index ? PERF.OVERLAP_S : 0.0));
        planEnd = coreEnd;
      } else {
        [planStart, planEnd] = planOverlap(coreStart, coreEnd, duration, index, count);
      }
      const fromAu = track.auIndexAtS(planStart);
      // Windows touching EOF take every remaining unit; interior windows cut
      // at the unit containing `end` (the ±overlap absorbs boundary drift).
      const toAuExcl =
        planEnd >= duration - EOF_EPS
          ? track.auCount
          : Math.min(track.auCount, Math.max(fromAu + 1, track.auIndexAtS(planEnd)));
      // Anchor chunk start/end to the exact Access Unit DTS so global shifted
      // timestamps never suffer frame-quantization drift (~23ms on AAC/MP3).
      const start = hasDts && fromAu > 0 ? track.auDtsS(fromAu) : planStart;
      const end =
        hasDts && toAuExcl < track.auCount
          ? Math.max(start + 1e-6, track.auDtsS(toAuExcl))
          : planEnd;
      const chunkPath = path.join(
        String(folder),
        `chunk-${String(index + 1).padStart(4, "0")}.${ext}`,
      );
      ranges.push({ fromAu, toAuExcl, outPath: chunkPath, wrap: wrapKind });
      chunks.push(Chunk({ index, start, end, coreStart, coreEnd, path: chunkPath }));
    }

    progress(14, `Cắt ${count} đoạn passthrough · thuần NodeJS · 1 lượt đọc duy nhất`);
    const started = performance.now();
    const cutResults = await METRICS.time("split_passthrough_ms", () =>
      cutUnits(meta, ranges, {
        token,
        onDone: (done, total) => {
          progress(
            14 + Math.round((12 * done) / Math.max(1, total)),
            `Đoạn ${done}/${total} · byte-surgery ${((performance.now() - started) | 0)}ms`,
          );
        },
      }),
    );
    for (let i = 0; i < chunks.length; i++) {
      chunks[i] = Chunk({ ...chunks[i], crcHex: cutResults[i].crcHex, bytes: cutResults[i].size });
    }

    METRICS.incr("chunks_split", count);
    progress(26, `Tách xong ${count} đoạn · passthrough gốc, không re-encode`);
    return chunks;
  }

  /** ORIGINAL 1:1 — the WHOLE audio stream as one exact passthrough file. */
  async singleOriginal(meta, folder) {
    this.#token.check();
    if (!meta || typeof meta !== "object") throw new ASRError("chunker: meta thiếu");
    if (!meta.track || !Number.isInteger(meta.track.auCount) || meta.track.auCount <= 0) {
      throw new ASRError("chunker: meta.track thiếu hoặc auCount vô lý");
    }
    if (!(meta.durationS > 0 && Number.isFinite(meta.durationS))) {
      throw new ASRError("chunker: meta.durationS vô lý");
    }
    const ext = EXT_BY_KIND.get(meta.kind);
    if (!ext) throw new ASRError(`chunker: kind ${meta.kind} thiếu ext`);
    const wrap = WRAP_BY_KIND.get(meta.kind);
    if (!wrap) throw new ASRError(`chunker: kind ${meta.kind} chưa hỗ trợ wrap`);
    const chunkPath = path.join(String(folder), `original-full.${ext}`);
    this.#progress(8, "ORIGINAL 1:1 · trích audio gốc nguyên vẹn (không encode lại)…");
    const [cut] = await METRICS.time("extract_full_ms", () =>
      cutUnits(
        meta,
        [{ fromAu: 0, toAuExcl: meta.track.auCount, outPath: chunkPath, wrap }],
        { token: this.#token },
      ),
    );
    return [
      Chunk({
        index: 0,
        start: 0.0,
        end: meta.durationS,
        coreStart: 0.0,
        coreEnd: meta.durationS,
        path: chunkPath,
        crcHex: cut.crcHex,
        bytes: cut.size,
      }),
    ];
  }
}
