/** Timeline compose + validation — delegates to the sentence-accurate engine.
 * Kept as the stable import surface for pipeline consumers and legacy tests. */

import { NETFLIX, buildCues, validateNetflix } from "./netflix.js";

/**
 * Composes broadcast-ready cues from merged segments.
 * Signature preserved: compose(segments, maxChars, maxDuration, minDuration, opts?).
 * maxChars is a SOFT target — sentence accuracy always wins over it.
 * Extra presentation knobs (cps, gapMs, softMaxChars, mergeGapS) pass through
 * to buildCues via the trailing opts object; when the 2nd argument is an
 * object it is treated as opts directly.
 * Returns the cues ARRAY for backward compatibility (tests + renderSrt map
 * over it); the engine warnings are attached as `cues.warnings` and also
 * available via composeWithWarnings().
 */
export function compose(segments, maxChars = NETFLIX.MAX_CHARS, maxDuration = NETFLIX.MAX_DURATION_S, minDuration = NETFLIX.MIN_DURATION_S, opts = {}) {
  let extra = opts;
  let maxS = maxDuration;
  let minS = minDuration;
  if (maxChars !== null && typeof maxChars === "object") {
    extra = maxChars;
    maxS = NETFLIX.MAX_DURATION_S;
    minS = NETFLIX.MIN_DURATION_S;
  }
  // NOTE: maxChars stays a SOFT target only — sentence accuracy wins, so it is
  // intentionally not forwarded as a hard split threshold (softMaxChars is).
  const softMax = extra?.softMaxChars ?? extra?.softMax ?? NETFLIX.SOFT_MAX_CHARS;
  const { cues, warnings } = buildCues(segments, {
    softMaxChars: softMax,
    maxS,
    minS,
    cps: extra?.cps ?? NETFLIX.CPS,
    gapMs: extra?.gapMs ?? NETFLIX.GAP_MS,
    mergeGapS: extra?.mergeGapS ?? NETFLIX.MERGE_GAP_S,
    speed: extra?.speed ?? 1.0,
  });
  cues.warnings = warnings;
  return cues;
}

/** Compose variant returning {cues, warnings} for callers that count warnings. */
export function composeWithWarnings(segments, maxChars = NETFLIX.MAX_CHARS, maxDuration = NETFLIX.MAX_DURATION_S, minDuration = NETFLIX.MIN_DURATION_S, opts = {}) {
  const cues = compose(segments, maxChars, maxDuration, minDuration, opts);
  return { cues, warnings: cues.warnings ?? [] };
}

/** Structural errors only (empty/overlap/multi-line). */
export function validate(cues) {
  return validateNetflix(cues);
}
