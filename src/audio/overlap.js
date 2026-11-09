/** Overlap window planner. */

import { PERF } from "../core/config.js";
import { ASRError } from "../core/errors.js";

export function planOverlap(coreStart, coreEnd, duration, index, count, overlapS = null) {
  const ov = overlapS ?? PERF.OVERLAP_S;
  if (!(duration > 0 && Number.isFinite(duration))) throw new ASRError("planOverlap: duration invalid");
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || index >= count)
    throw new ASRError("planOverlap: index/count invalid");
  if (!(coreStart >= 0 && coreEnd >= coreStart && coreEnd <= duration))
    throw new ASRError("planOverlap: core window invalid");
  if (!(ov >= 0 && Number.isFinite(ov))) throw new ASRError("planOverlap: overlap invalid");
  const start = Math.max(0.0, coreStart - (index ? ov : 0.0));
  const end = Math.min(duration, coreEnd + (index < count - 1 ? ov : 0.0));
  return [start, end];
}
