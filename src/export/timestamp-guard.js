/** Exact millisecond timestamp helpers — no float round-trip drift. */

const PAD2 = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const PAD3 = Array.from({ length: 1000 }, (_, i) => String(i).padStart(3, "0"));

export function exactMsToSrt(ms) {
  if (!Number.isFinite(ms)) {
    throw new RangeError(`exactMsToSrt: ms must be finite (got ${ms})`);
  }
  let value = Math.max(0, Math.trunc(ms));
  const hours = Math.floor(value / 3_600_000);
  value -= hours * 3_600_000;
  const minutes = Math.floor(value / 60_000);
  value -= minutes * 60_000;
  const seconds = Math.floor(value / 1_000);
  value -= seconds * 1_000;
  const hStr = hours < 100 ? PAD2[hours] : String(hours).padStart(2, "0");
  return `${hStr}:${PAD2[minutes]}:${PAD2[seconds]},${PAD3[value]}`;
}

export function srtTimeFloat(seconds) {
  if (!Number.isFinite(seconds)) {
    throw new RangeError(`srtTimeFloat: seconds must be finite (got ${seconds})`);
  }
  if (seconds < 0) return exactMsToSrt(0);
  return exactMsToSrt(Math.round(seconds * 1000));
}

export function detectInversion(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return true;
  return endMs <= startMs;
}

/**
 * Scale an integer [startMs, endMs] pair for playback speed `speed` (t' = t / speed).
 * Preserves 1:1 verbatim integers when speed === 1, and guarantees non-collapsed
 * positive span (endMs >= startMs + 1) whenever input had endMs > startMs.
 */
export function scaleRangeMs(startMs, endMs, speed = 1.0) {
  if (!Number.isFinite(speed) || Math.abs(speed - 1.0) <= 1e-9) {
    return [startMs, endMs];
  }
  const s = Math.max(0, Math.round(startMs / speed));
  const rawE = Math.max(0, Math.round(endMs / speed));
  const e = endMs > startMs ? Math.max(s + 1, rawE) : Math.max(s, rawE);
  return [s, e];
}
