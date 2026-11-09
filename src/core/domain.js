/** Domain models — UltraX (immutable, frozen).
 * Shape-only factories with lightweight edge hygiene:
 * - start/end must be finite numbers (TypeError otherwise)
 * - ordering (start < end) is intentionally NOT thrown here: inverted cues must
 *   remain constructible so timeline/netflix validators can report them
 *   structurally (see validate(), validateNetflix()); use isValidCue() to pre-check
 * - text is trimmed; empty-after-trim throws (filter empty rows before constructing)
 */

import path from "node:path";
import { ASRError } from "./errors.js";

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 1.5;
export const SPEED_DEFAULT = 1.0;
const SPEED_FLOAT_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/**
 * Validate and normalize playback/subtitle speed factor in [0.5, 1.5].
 * Accepts numbers (e.g. 1.25) or strings with optional trailing "x" (e.g. "1.25x").
 */
export function normalizeSpeed(speed = SPEED_DEFAULT) {
  if (speed === undefined || speed === null) return SPEED_DEFAULT;
  let n;
  if (typeof speed === "number") {
    n = speed;
  } else if (typeof speed === "string") {
    const clean = speed.trim().replace(/[x×]$/i, "").trim();
    if (!clean || !SPEED_FLOAT_RE.test(clean)) {
      throw new ASRError(`Tốc độ video không hợp lệ: ${JSON.stringify(speed)} (cần ${SPEED_MIN}x – ${SPEED_MAX}x)`);
    }
    n = Number(clean);
  } else {
    throw new ASRError(`Tốc độ video không hợp lệ: ${JSON.stringify(speed)} (cần ${SPEED_MIN}x – ${SPEED_MAX}x)`);
  }
  if (!Number.isFinite(n) || n < SPEED_MIN - 1e-9 || n > SPEED_MAX + 1e-9) {
    throw new ASRError(`Tốc độ video phải nằm trong khoảng ${SPEED_MIN}x – ${SPEED_MAX}x (nhận: ${speed})`);
  }
  const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, n));
  return Math.round(clamped * 1_000_000) / 1_000_000;
}

function assertFinite(start, end, label) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new TypeError(`${label}: start/end must be finite numbers (got ${start}, ${end})`);
  }
}

function cleanText(text, label) {
  const clean = String(text ?? "").trim();
  if (!clean) throw new TypeError(`${label}: text must be non-empty after trim`);
  return clean;
}

/** True when a {start,end,text} triple is structurally sound (finite, ordered, non-blank). */
export function isValidCue({ start, end, text } = {}) {
  return Number.isFinite(start) && Number.isFinite(end) && start < end && String(text ?? "").trim().length > 0;
}

export function Word({ start, end, text, probability = null }) {
  assertFinite(start, end, "Word");
  return Object.freeze({ start, end, text: cleanText(text, "Word"), probability });
}

export function Segment({
  start,
  end,
  text,
  words = [],
  rawStartMs = null,
  rawEndMs = null,
}) {
  assertFinite(start, end, "Segment");
  return Object.freeze({
    start,
    end,
    text: cleanText(text, "Segment"),
    words: Object.freeze([...(words ?? [])]),
    rawStartMs,
    rawEndMs,
  });
}

export function Chunk({ index, start, end, coreStart, coreEnd, path: chunkPath, crcHex = null, bytes = 0 }) {
  return Object.freeze({ index, start, end, coreStart, coreEnd, path: chunkPath, crcHex, bytes });
}

export function Options({
  inputPath,
  outputPath,
  model = "JianYing ORIGINAL 1:1 · client 10.9",
  language = null,
  maxChars = 42, // SOFT target — sentence accuracy always wins over it
  softMaxChars = 56, // complete sentences longer than this get clause-split
  mergeGapS = 1.5,
  maxDuration = 7.0,
  minDuration = 5 / 6,
  cps = 20,
  gapMs = 84,
  jianyingAppVersion = "10.9.0",
  maxWorkers = null,
  speed = SPEED_DEFAULT,
  formats = ["srt"],
  physicalSpeed = null,
  srtOnly = false,
  noJunk = false,
}) {
  const normalizedSpeed = normalizeSpeed(speed);
  return Object.freeze({
    inputPath: path.resolve(String(inputPath)),
    outputPath: path.resolve(String(outputPath)),
    model,
    language,
    maxChars,
    softMaxChars,
    mergeGapS,
    maxDuration,
    minDuration,
    cps,
    gapMs,
    jianyingAppVersion,
    maxWorkers,
    speed: normalizedSpeed,
    formats: Array.isArray(formats) ? Object.freeze([...formats]) : Object.freeze(["srt"]),
    physicalSpeed: physicalSpeed === null ? null : Boolean(physicalSpeed),
    srtOnly: Boolean(srtOnly || noJunk),
    noJunk: Boolean(srtOnly || noJunk),
  });
}

export function Result({
  outputPath,
  segments,
  language,
  languageProbability,
  elapsed,
  speed = SPEED_DEFAULT,
}) {
  return Object.freeze({
    outputPath,
    segments: Object.freeze([...segments]),
    language,
    languageProbability,
    elapsed,
    speed: normalizeSpeed(speed),
  });
}
