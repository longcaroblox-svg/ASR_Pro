/** Live atomic SRT publisher — contiguous completed prefix only.
 * EXACT mode: raw server rows flow to disk VERBATIM (rawSrtRows) — the output
 * path never constructs Segments, converts floats, or touches a single field.
 * Composed branch emits sentence-accurate cues; warnings counted, never hidden. */

import { SPEED_DEFAULT, normalizeSpeed } from "../core/domain.js";
import { METRICS } from "../core/metrics.js";
import { NETFLIX, buildCues } from "./netflix.js";
import { atomicWrite, rawSrtRows, renderSrt } from "./srt.js";
import { scaleRangeMs } from "./timestamp-guard.js";
import { createIncrementalMerger } from "../pipeline/merge.js";

export class LiveSRTPublisher {
  #output;
  #options;
  #exact;
  #completed = new Map();
  #warnings = 0;
  #lastWarningCount = 0;
  #merger = null;
  #mergedUpTo = 0;

  constructor(output, options, { exact }) {
    this.#output = output;
    this.#options = options;
    this.#exact = exact;
    this.published = [];
  }

  get warnings() {
    return this.#warnings;
  }

  /**
   * @param {number} index chunk index
   * @param {Array} payload AUTO: Segment[] · EXACT: raw server rows {startMs,endMs,text}
   */
  onChunkDone(index, payload) {
    this.#completed.set(index, payload);
    // Contiguous-prefix drain: key must be captured BEFORE push (Python pop-then-append).
    while (this.#completed.has(this.published.length)) {
      const key = this.published.length;
      this.published.push(this.#completed.get(key));
      this.#completed.delete(key);
    }
    return this.flush();
  }

  flush() {
    const speed = normalizeSpeed(this.#options?.speed ?? SPEED_DEFAULT);
    if (this.#exact) {
      // ZERO-TOUCH when speed === 1.0: raw rows → bytes. Nothing in between.
      // When speed !== 1.0 (0.5x–1.5x), integer ms are projected via t' = round(t / speed).
      const scaleTime = Math.abs(speed - 1.0) > 1e-9;
      const rows = this.published.flat().map((r) => {
        const baseStart = r.startMs ?? (Number.isFinite(r.start) ? Math.round(r.start * 1000) : r.startMs);
        const baseEnd = r.endMs ?? (Number.isFinite(r.end) ? Math.round(r.end * 1000) : r.endMs);
        const [startMs, endMs] = scaleTime ? scaleRangeMs(baseStart, baseEnd, speed) : [baseStart, baseEnd];
        return {
          startMs,
          endMs,
          text: r.text,
        };
      });
      if (rows.length > 0) atomicWrite(this.#output, rawSrtRows(rows));
      return rows;
    }
    // Incremental merge: only parts appended since the last flush touch the
    // SequenceMatcher (overlap-frontier window); the stable prefix is reused.
    // This keeps per-flush cost O(new × window) instead of O(prefix × window).
    if (!this.#merger) this.#merger = createIncrementalMerger();
    for (let p = this.#mergedUpTo; p < this.published.length; p++) {
      this.#merger.pushPart(this.published[p]);
    }
    this.#mergedUpTo = this.published.length;
    const merged = [...this.#merger.merged].sort((a, b) => a.start - b.start || a.end - b.end);
    const { cues, warnings } = buildCues(merged, {
      softMaxChars: this.#options.softMaxChars ?? NETFLIX.SOFT_MAX_CHARS,
      maxS: this.#options.maxDuration ?? NETFLIX.MAX_DURATION_S,
      minS: this.#options.minDuration ?? NETFLIX.MIN_DURATION_S,
      cps: this.#options.cps ?? NETFLIX.CPS,
      gapMs: this.#options.gapMs ?? NETFLIX.GAP_MS,
      mergeGapS: this.#options.mergeGapS ?? NETFLIX.MERGE_GAP_S,
      speed,
    });
    // Recomputed from scratch each flush — last flush wins (no += accumulation).
    this.#warnings = warnings.length;
    // Signed delta (shrink decrements): positive-only accumulation double-counts
    // warnings that disappear in one flush and reappear in the next.
    const delta = warnings.length - this.#lastWarningCount;
    if (delta !== 0) METRICS.incr("netflix_warning", delta);
    this.#lastWarningCount = warnings.length;
    if (cues.length > 0) atomicWrite(this.#output, renderSrt(cues));
    return cues;
  }
}
