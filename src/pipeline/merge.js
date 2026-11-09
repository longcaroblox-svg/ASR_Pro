/** Fuzzy overlap merger — keep longer transcript, widest timing.
 * SequenceMatcher ratio is a faithful difflib port (longest matching blocks). */

import { PERF } from "../core/config.js";
import { Segment } from "../core/domain.js";

const NON_ALNUM_RE = /[^\p{L}\p{N}]+/gu;
const MERGE_THRESHOLD = 0.78;
// Short normalized strings reach high ratios on 1-char edits — demand near-identity.
const SHORT_NORM_LEN = 8;
const SHORT_THRESHOLD = 0.92;
const TERMINAL_PUNCT_RE = /[.!?…。！？]["»”')\]]?$/;

export function normalize(text) {
  // NFKC + casefold parity (JS lacks native casefold — apply full-fold expansions).
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ς/g, "σ")
    .replace(/ẛ/g, "ṡ")
    .replace(NON_ALNUM_RE, "");
}

function buildB2J(b) {
  const b2j = new Map();
  for (let j = 0; j < b.length; j++) {
    const list = b2j.get(b[j]);
    if (list) list.push(j);
    else b2j.set(b[j], [j]);
  }
  // difflib autojunk: popular elements in long sequences are excluded from matching.
  const autojunk = new Set();
  if (b.length >= 200) {
    const threshold = Math.floor(b.length / 100) + 1;
    for (const [elem, indices] of b2j) {
      if (indices.length > threshold) {
        autojunk.add(elem);
        b2j.delete(elem);
      }
    }
  }
  return { b2j, autojunk };
}

function findLongestMatch(a, aLo, aHi, b, bLo, bHi, b2j, autojunk) {
  let j2len = new Map();
  let newJ2 = new Map();
  let bestI = aLo;
  let bestJ = bLo;
  let bestSize = 0;

  for (let i = aLo; i < aHi; i++) {
    if (autojunk.has(a[i])) {
      if (j2len.size > 0) j2len.clear();
      continue;
    }
    const indices = b2j.get(a[i]);
    if (indices !== undefined) {
      for (const j of indices) {
        if (j < bLo) continue;
        if (j >= bHi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newJ2.set(j, k);
        if (k > bestSize) {
          bestI = i - k + 1;
          bestJ = j - k + 1;
          bestSize = k;
        }
      }
    }
    const tmp = j2len;
    j2len = newJ2;
    newJ2 = tmp;
    if (newJ2.size > 0) newJ2.clear();
  }
  return [bestI, bestJ, bestSize];
}

function matchingBlocks(a, b) {
  const { b2j, autojunk } = buildB2J(b);
  const blocks = [];
  const queue = [[0, a.length, 0, b.length]];
  while (queue.length > 0) {
    const [aLo, aHi, bLo, bHi] = queue.pop();
    const [i, j, k] = findLongestMatch(a, aLo, aHi, b, bLo, bHi, b2j, autojunk);
    if (k > 0) {
      blocks.push([i, j, k]);
      if (aLo < i && bLo < j) queue.push([aLo, i, bLo, j]);
      if (i + k < aHi && j + k < bHi) queue.push([i + k, aHi, j + k, bHi]);
    }
  }
  blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  // Merge adjacent blocks (difflib behaviour).
  const merged = [];
  for (const block of blocks) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev[0] + prev[2] === block[0] &&
      prev[1] + prev[2] === block[1]
    ) {
      prev[2] += block[2];
    } else {
      merged.push([...block]);
    }
  }
  return merged;
}

/** difflib.SequenceMatcher(None, a, b).ratio() equivalent. */
export function sequenceRatio(a, b) {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;
  const matches = matchingBlocks(a, b).reduce((sum, [, , size]) => sum + size, 0);
  return (2 * matches) / (a.length + b.length);
}

export function similarity(left, right, normA = null, normB = null) {
  const a = normA ?? normalize(left);
  const b = normB ?? normalize(right);
  if (!a || !b) return 0.0;
  if (a === b) return 1.0;
  // Math short-circuit: even a perfect overlap of the shorter string cannot
  // reach the merge threshold when lengths diverge too far.
  const maxPossible = (2 * Math.min(a.length, b.length)) / (a.length + b.length);
  if (maxPossible < MERGE_THRESHOLD) return 0.0;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  return sequenceRatio(a, b);
}

export function mergeParts(parts, overlapS = null) {
  const merger = createIncrementalMerger(overlapS);
  for (const part of parts) merger.pushPart(part);
  const merged = merger.merged;
  merged.sort((x, y) => x.start - y.start || x.end - y.end);
  return merged;
}

/** Stateful incremental merger — byte-identical to mergeParts when parts are
 * pushed in order. Lets LiveSRTPublisher merge only the overlap frontier
 * (O(chunk × window)) instead of re-merging the whole prefix every flush. */
export function createIncrementalMerger(overlapS = null) {
  const ov = overlapS ?? PERF.OVERLAP_S;
  const merged = [];
  const normCache = new Map();
  const cachedNorm = (text) => {
    let v = normCache.get(text);
    if (v === undefined) {
      v = normalize(text);
      normCache.set(text, v);
    }
    return v;
  };
  return {
    merged,
    pushPart(part) {
      const sorted = isSortedByTime(part) ? part : [...part].sort((x, y) => x.start - y.start || x.end - y.end);
      for (const segment of sorted) mergeSingle(merged, segment, ov, cachedNorm);
    },
  };
}

const CJK_RE = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Visual/information length of normalized string: CJK ideographs count 2x. */
function normInfoLen(norm) {
  let len = 0;
  for (let i = 0; i < norm.length; i++) {
    len += CJK_RE.test(norm[i]) ? 2 : 1;
  }
  return len;
}

function isSortedByTime(part) {
  for (let i = 1; i < part.length; i++) {
    const p = part[i - 1];
    const c = part[i];
    if (c.start < p.start || (c.start === p.start && c.end < p.end)) return false;
  }
  return true;
}

function mergeSingle(merged, segment, ov, cachedNorm) {
  let duplicateIndex = null;
  let bestScore = 0.0;
  const normSeg = cachedNorm(segment.text);
  const segInfoLen = normInfoLen(normSeg);
  const windowStart = Math.max(0, merged.length - 20);
  for (let index = windowStart; index < merged.length; index++) {
    const previous = merged[index];
    if (Math.abs(segment.start - previous.start) > ov * 1.8) continue;
    const normPrev = cachedNorm(previous.text);
    const minLen = Math.min(normInfoLen(normPrev), segInfoLen);
    const threshold = minLen < SHORT_NORM_LEN ? SHORT_THRESHOLD : MERGE_THRESHOLD;
    const score = similarity(previous.text, segment.text, normPrev, normSeg);
    if (score < threshold || score <= bestScore) continue;
    const timeOverlap =
      Math.min(previous.end, segment.end) - Math.max(previous.start, segment.start);
    const startDiff = Math.abs(segment.start - previous.start);
    // Tight gate: true overlap merges; a gapped pair (≤1s) merges only when
    // starts are also near (≤1s). The old bare `startDiff <= 3` merged
    // 1.5s-apart distinct cues that merely shared wording.
    const timeGate = timeOverlap >= 0 || (timeOverlap >= -1.0 && startDiff <= 1.0);
    if (!timeGate) continue;
    // Anti-chain: widening must stay within one overlap window of the wider
    // input (plus a 60s absolute cap). Without this, A~B~C… transitively fuses
    // a minutes-long giant cue from pairwise-similar neighbours.
    const newStart = Math.min(previous.start, segment.start);
    const newEnd = Math.max(previous.end, segment.end);
    const mergedDur = newEnd - newStart;
    const maxInputDur = Math.max(previous.end - previous.start, segment.end - segment.start);
    if (mergedDur > 60 || mergedDur > maxInputDur + ov + 1.0) continue;
    duplicateIndex = index;
    bestScore = score;
  }
  if (duplicateIndex !== null) {
    const old = merged[duplicateIndex];
    const segLen = segment.text.trim().length;
    const oldLen = old.text.trim().length;
    const preferNew =
      segLen > oldLen ||
      (segLen === oldLen && TERMINAL_PUNCT_RE.test(segment.text.trim()) && !TERMINAL_PUNCT_RE.test(old.text.trim()));
    const text = preferNew ? segment.text : old.text;
    const words = preferNew
      ? (segment.words?.length ? segment.words : (old.words ?? []))
      : (old.words?.length ? old.words : (segment.words ?? []));
    merged[duplicateIndex] = Segment({
      start: Math.min(old.start, segment.start),
      end: Math.max(old.end, segment.end),
      text,
      words,
      rawStartMs: old.rawStartMs ?? segment.rawStartMs ?? null,
      rawEndMs: segment.rawEndMs ?? old.rawEndMs ?? null,
    });
  } else {
    merged.push(segment);
  }
}
