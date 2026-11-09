/** SRT render + atomic write. */

import { ExportError } from "../core/errors.js";
import { atomicWriteText } from "../util/io-fast.js";
import { detectInversion, exactMsToSrt, srtTimeFloat } from "./timestamp-guard.js";
import { validate } from "./timeline.js";

export function renderSrt(cues) {
  const errors = validate(cues);
  if (errors.length > 0) {
    throw new ExportError("SRT không hợp lệ: " + errors.slice(0, 5).join("; "));
  }
  return (
    cues
      .map(
        (cue, i) =>
          `${i + 1}\n${srtTimeFloat(cue.start)} --> ${srtTimeFloat(cue.end)}\n${cue.text}`,
      )
      .join("\n\n") + "\n"
  );
}

/** Fallback renderer for composed cues: prefers exact server ms
 * (rawStartMs/rawEndMs) when present, else float seconds — then VALIDATES.
 * Throws ExportError on empty text, non-finite ms, or inverted ranges.
 * Use this when cues went through the sentence engine (times may be
 * extended/capped); for untouched server rows use rawSrtRows() below. */
export function rawSrt(cues) {
  const lines = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue || !String(cue.text ?? "").trim()) {
      throw new ExportError(`SRT không hợp lệ: cue ${i + 1} rỗng`);
    }
    const a = cue.rawStartMs != null ? cue.rawStartMs : Math.round(cue.start * 1000);
    const b = cue.rawEndMs != null ? cue.rawEndMs : Math.round(cue.end * 1000);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new ExportError(`SRT không hợp lệ: cue ${i + 1} timestamp không hữu hạn`);
    }
    if (detectInversion(a, b)) {
      throw new ExportError(`SRT không hợp lệ: cue ${i + 1} end <= start`);
    }
    lines.push(`${i + 1}\n${exactMsToSrt(a)} --> ${exactMsToSrt(b)}\n${cue.text}`);
  }
  return lines.join("\n\n") + "\n";
}

export function cleanSubtitleText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\t ]+/g, " ")
    .trim();
}

/** ORIGINAL 1:1 renderer — takes RAW SERVER ROWS {startMs,endMs,text} and
 * emits bytes with ZERO transformation: no float conversion, no objects built,
 * no field touched. The server's integers ARE the subtitle.
 * Verbatim path: no structural validation beyond what exactMsToSrt enforces
 * (non-finite ms throws RangeError); inversion/empty checks are deliberately
 * NOT applied here so server bytes flow untouched — callers that need guards
 * should use rawSrt()/renderSrt() instead. */
export function rawSrtRows(rows) {
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    lines.push(`${i + 1}\n${exactMsToSrt(r.startMs)} --> ${exactMsToSrt(r.endMs)}\n${r.text}`);
  }
  return lines.join("\n\n") + "\n";
}

export { atomicWriteText as atomicWrite };
