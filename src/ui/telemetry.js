/** UI telemetry helpers. */

export function formatEta(elapsedS, fraction) {
  if (!Number.isFinite(elapsedS) || !Number.isFinite(fraction) || fraction <= 0.01) return "--:--";
  const clamped = Math.min(1, Math.max(0, fraction));
  if (clamped <= 0.01) return "--:--";
  const total = Math.max(0, elapsedS) / clamped;
  if (!Number.isFinite(total)) return "--:--";
  const remain = Math.max(0, total - Math.max(0, elapsedS));
  const totalSeconds = Math.trunc(remain);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatThroughput(cues, elapsedS) {
  if (!Number.isFinite(cues) || !Number.isFinite(elapsedS) || elapsedS <= 0) return "0 cue/min";
  const rate = (Math.max(0, cues) / elapsedS) * 60;
  if (!Number.isFinite(rate)) return "0 cue/min";
  return `${rate.toFixed(1)} cue/min`;
}

/** Monotonic progress — never jumps backward. NaN-safe. */
export function progressSmooth(last, target) {
  const l = Number.isFinite(last) ? last : 0;
  const t = Number.isFinite(target) ? target : l;
  return Math.max(l, Math.min(100, t));
}
