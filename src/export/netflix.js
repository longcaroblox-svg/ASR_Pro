/** Knuth-Plass / Viterbi Dynamic Programming Subtitle Composition Engine.
 *
 * 1. TIMING SOURCE OF TRUTH: 100% real server utterance/word timestamps.
 *    Zero fabricated intermediate timestamps.
 * 2. GLOBAL OPTIMAL SEGMENTATION: Uses Viterbi / Knuth-Plass Dynamic Programming
 *    over word boundaries to jointly optimize visual width balance, reading speed (CPS),
 *    acoustic pause alignment, and Netflix TTSG syntactic-bond rules (breaking after
 *    clause punctuation and before conjunctions/prepositions; never splitting determiners,
 *    auxiliaries, or negations from their head words).
 * 3. CJK & SURROGATE AWARE: Proper code-point iteration and visual width accounting. */

import { Segment, SPEED_DEFAULT, normalizeSpeed } from "../core/domain.js";

export const NETFLIX = Object.freeze({
  MAX_CHARS: 42,
  SOFT_MAX_CHARS: 56,
  MIN_DURATION_S: 5 / 6,
  MAX_DURATION_S: 7.0,
  CPS: 20,
  GAP_MS: 84,
  MERGE_GAP_S: 1.5,
});

const TERMINAL_RE = /[.!?…。！？]["»”')\]]?$/;
const CLAUSE_RE = /[,;:、，；：—]["»”')\]]?$/;
const CJK_CHAR_RE = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const CJK_EDGE_RE = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef。！？，、；：“”‘’（）《》【】]/;

const ABBR_DOT = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc",
  "no", "fig", "approx", "dept", "est", "min", "max", "inc", "ltd",
  "co", "corp", "vol", "ch", "sec", "tp", "ths", "ts", "pgs", "gs",
  "ks", "bs", "cn", "jan", "feb", "mar", "apr", "jun", "jul", "aug",
  "sep", "sept", "oct", "nov", "dec",
]);

/** Words that strongly bind to the FOLLOWING word (Netflix TTSG: do not break after these). */
const NO_BREAK_AFTER = new Set([
  // English determiners, articles, auxiliaries, prepositions, pronouns
  "a", "an", "the", "this", "that", "these", "those", "my", "your", "his",
  "her", "its", "our", "their", "some", "any", "no", "every", "each",
  "is", "am", "are", "was", "were", "be", "been", "being", "have", "has",
  "had", "do", "does", "did", "will", "would", "shall", "should", "can",
  "could", "may", "might", "must", "not", "don't", "doesn't", "didn't",
  "won't", "wouldn't", "can't", "cannot", "couldn't", "shouldn't", "isn't",
  "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't", "to", "of",
  "in", "on", "at", "by", "for", "with", "from", "into", "onto", "very",
  // Vietnamese determiners, quantifiers, tense/aspect/negation markers, prepositions
  "các", "những", "mọi", "mỗi", "một", "đang", "sẽ", "đã", "vừa", "mới",
  "không", "chẳng", "chưa", "đừng", "chớ", "rất", "quá", "hơi", "cực",
  "của", "trong", "trên", "dưới", "với", "bằng", "tại", "về", "cho",
]);

/** Conjunctions & clause starters where breaking BEFORE them is natural. */
const GOOD_BREAK_BEFORE = new Set([
  "and", "but", "or", "nor", "so", "yet", "because", "although", "though",
  "while", "whereas", "since", "unless", "until", "when", "whenever", "where",
  "nhưng", "mà", "hoặc", "hay", "vì", "bởi", "do", "nên", "nếu", "khi",
  "tuy", "dù", "để", "rằng", "là", "còn", "thì",
]);

function charLen(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

function isCjkCodePoint(cp) {
  return (
    (cp >= 0x3000 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xffef) ||
    (cp >= 0x20000 && cp <= 0x2fa1f)
  );
}

/** Surrogate-safe CJK-weighted visual length (CJK = 2, Latin/VI = 1). */
export function visualLen(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    let cp = code;
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    count += isCjkCodePoint(cp) ? 2 : 1;
  }
  return count;
}

export function collapse(text) {
  return String(text).split(/\s+/).filter(Boolean).join(" ");
}

export function endsSentence(text) {
  return TERMINAL_RE.test(text.trim());
}

function concatWordPair(left, right) {
  if (!left) return right;
  if (!right) return left;
  const lastL = left[left.length - 1];
  const firstR = right[0];
  if (CJK_EDGE_RE.test(lastL) || CJK_EDGE_RE.test(firstR)) {
    return `${left}${right}`;
  }
  return `${left} ${right}`;
}

export function splitSentences(text) {
  const flat = collapse(text);
  const out = [];
  let start = 0;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…" && ch !== "。" && ch !== "！" && ch !== "？")
      continue;
    if (ch === "." && /\d/.test(flat[i - 1] ?? "") && /\d/.test(flat[i + 1] ?? "")) {
      continue;
    }
    if (ch === "." && isAbbreviationDot(flat, i)) {
      continue;
    }
    let end = i + 1;
    while (end < flat.length && /[.!?…。！？]/.test(flat[end])) end++;
    while (end < flat.length && /["»”')\]]/.test(flat[end])) end++;
    if (ch === "。" || ch === "！" || ch === "？") {
      out.push(flat.slice(start, end).trim());
      start = end;
      i = end - 1;
      continue;
    }
    if (end >= flat.length || /\s/.test(flat[end])) {
      out.push(flat.slice(start, end).trim());
      start = end;
      i = end - 1;
    }
  }
  const tail = flat.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

function isAbbreviationDot(flat, i) {
  if (flat[i + 1] === ".") return false;
  const before = flat.slice(0, i);
  const token = (before.split(/\s+/).pop() ?? "").replace(/^["«“'([]+/, "");
  if (/(?:^|\s)(?:e\.g\.|i\.e\.|etc\.|v\.v\.|(?:[a-z]\.){2,})$/i.test(flat.slice(0, i + 1))) return true;
  if (/^[A-Za-z]$/.test(token)) return true;
  if (ABBR_DOT.has(token.toLowerCase())) return true;
  return false;
}

function joinWordTokens(words, referenceText = "") {
  if (words.length === 0) return "";
  if (referenceText && !referenceText.includes(" ") && CJK_CHAR_RE.test(referenceText)) {
    return words.map((w) => w.text).join("");
  }
  if (CJK_CHAR_RE.test(referenceText)) {
    let acc = "";
    for (const w of words) acc = concatWordPair(acc, w.text);
    return acc;
  }
  return words.map((w) => w.text).join(" ");
}

function pushWordSlices(raw, words, breaks, referenceText = "") {
  let s = 0;
  for (let b = 0; b < breaks.length; b++) {
    const stop = breaks[b];
    const pieceWords = words.slice(s, stop + 1);
    raw.push({
      start: pieceWords[0].start,
      end: pieceWords[pieceWords.length - 1].end,
      text: joinWordTokens(pieceWords, referenceText),
      words: pieceWords,
      sentenceFlag: undefined,
      rawStartMs: null,
      rawEndMs: null,
    });
    s = stop + 1;
  }
  const tailWords = words.slice(s);
  raw.push({
    start: tailWords[0].start,
    end: tailWords[tailWords.length - 1].end,
    text: joinWordTokens(tailWords, referenceText),
    words: tailWords,
    sentenceFlag: undefined,
    rawStartMs: null,
    rawEndMs: null,
  });
}

function squashWhitespace(v) {
  return collapse(v).replace(/\s+/g, "");
}

function wordsCoverText(words, text) {
  const joined = words.map((w) => w.text).join("");
  return joined.length > 0 && squashWhitespace(joined) === squashWhitespace(text);
}

function cleanWordToken(wText) {
  return String(wText ?? "")
    .toLowerCase()
    .replace(/^["«“'([—]+|["»”')\].,!?;:、，；：。！？…—]+$/g, "");
}

/**
 * Knuth-Plass / Viterbi Dynamic Programming Optimal Word-Boundary Partitioner.
 * Finds globally optimal k-1 break indices in `words` minimizing total linguistic,
 * visual balance, CPS, and acoustic pause penalties.
 * When `clauseOnly === true`, restricts breaks strictly to punctuation-bearing words.
 */
export function chooseOptimalBreaksDP(words, targetCount, { clauseOnly = false, softMax = 56, cps = 20 } = {}) {
  const n = words.length;
  if (!Number.isInteger(targetCount) || targetCount < 2 || n < targetCount) return [];

  const hasCjk = words.some((w) => CJK_CHAR_RE.test(w.text));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + visualLen(words[i].text) + (i > 0 && !hasCjk ? 1 : 0);
  }
  const totalLen = prefix[n];
  if (!(totalLen > 0)) return [];
  const idealLen = totalLen / targetCount;

  // Precompute per-boundary linguistic & acoustic transition scores after word i (0 <= i < n-1)
  const isPunct = new Uint8Array(n);
  const boundaryBonus = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    const wCur = words[i].text;
    const hasPunct = TERMINAL_RE.test(wCur) || CLAUSE_RE.test(wCur);
    isPunct[i] = hasPunct ? 1 : 0;

    let score = 0;
    if (hasPunct) {
      score += 12.0;
    } else {
      const cleanCur = cleanWordToken(wCur);
      const cleanNext = cleanWordToken(words[i + 1].text);
      if (NO_BREAK_AFTER.has(cleanCur)) score -= 14.0;
      if (GOOD_BREAK_BEFORE.has(cleanNext)) score += 4.5;
    }
    const pauseS = Math.max(0, (words[i + 1]?.start ?? words[i].end) - words[i].end);
    if (pauseS > 0.02) {
      score += Math.min(8.0, 14.0 * Math.log1p((pauseS - 0.02) * 10));
    }
    boundaryBonus[i] = score;
  }

  if (clauseOnly) {
    let punctCount = 0;
    for (let i = 0; i < n - 1; i++) punctCount += isPunct[i];
    if (punctCount < targetCount - 1) return [];
  }

  // DP table: dp[step * n + endIdx] = min cost to partition words[0..endIdx] into (step + 1) cues
  const dp = new Float64Array(targetCount * n).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(targetCount * n).fill(-1);

  const spanCost = (startWord, endWord) => {
    const segLen = prefix[endWord + 1] - prefix[startWord] - (startWord > 0 && !hasCjk ? 1 : 0);
    const diff = segLen - idealLen;
    let cost = (diff * diff) / Math.max(1, idealLen);
    if (segLen > softMax) {
      const over = segLen - softMax;
      cost += over * over * 1.5;
    }
    const dur = Math.max(0.2, words[endWord].end - words[startWord].start);
    const segCps = segLen / dur;
    if (segCps > cps) {
      const overCps = segCps - cps;
      cost += overCps * overCps * 0.8;
    }
    if (endWord === startWord && segLen < 4 && n >= targetCount * 2) {
      cost += 6.0; // discourage 1-word micro-orphans when avoidable
    }
    if (endWord < n - 1) {
      cost -= boundaryBonus[endWord];
    }
    return cost;
  };

  // Base case: step = 0 (first cue spans 0..j)
  const maxFirstEnd = n - targetCount;
  for (let j = 0; j <= maxFirstEnd; j++) {
    if (clauseOnly && !isPunct[j]) continue;
    dp[j] = spanCost(0, j);
  }

  // Transitions: step = 1 .. targetCount - 1
  for (let step = 1; step < targetCount; step++) {
    const isLastStep = step === targetCount - 1;
    const minEnd = step;
    const maxEnd = isLastStep ? n - 1 : n - (targetCount - step);
    const jStart = isLastStep ? n - 1 : minEnd;

    for (let j = jStart; j <= maxEnd; j++) {
      if (!isLastStep && clauseOnly && !isPunct[j]) continue;
      let bestCost = Number.POSITIVE_INFINITY;
      let bestPrev = -1;
      for (let i = step - 1; i < j; i++) {
        const prevCost = dp[(step - 1) * n + i];
        if (prevCost === Number.POSITIVE_INFINITY) continue;
        const c = prevCost + spanCost(i + 1, j);
        if (c < bestCost) {
          bestCost = c;
          bestPrev = i;
        }
      }
      dp[step * n + j] = bestCost;
      parent[step * n + j] = bestPrev;
    }
  }

  const finalCost = dp[(targetCount - 1) * n + (n - 1)];
  if (!Number.isFinite(finalCost)) return [];

  const breaks = new Array(targetCount - 1);
  let curEnd = n - 1;
  for (let step = targetCount - 1; step >= 1; step--) {
    const prevEnd = parent[step * n + curEnd];
    if (prevEnd < 0) return [];
    breaks[step - 1] = prevEnd;
    curEnd = prevEnd;
  }
  return breaks;
}

function toTimelineWords(words, speed = 1.0) {
  if (!Array.isArray(words)) return null;
  const scale = Math.abs(speed - 1.0) > 1e-9;
  const list = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    const text = collapse(w.text);
    if (!text || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end < w.start) continue;
    list.push({
      start: scale ? w.start / speed : w.start,
      end: scale ? w.end / speed : w.end,
      text,
    });
  }
  return list.length > 0 ? list : null;
}

function groupWordsIntoSentences(words, sents = null) {
  if (Array.isArray(sents) && sents.length > 1) {
    const aligned = [];
    let wIdx = 0;
    let ok = true;
    for (let sIdx = 0; sIdx < sents.length; sIdx++) {
      const targetSquashed = squashWhitespace(sents[sIdx]);
      if (!targetSquashed) continue;
      const buf = [];
      let accSquashed = "";
      while (wIdx < words.length && accSquashed.length < targetSquashed.length) {
        const w = words[wIdx++];
        buf.push(w);
        accSquashed += squashWhitespace(w.text);
      }
      if (buf.length === 0 || accSquashed !== targetSquashed) {
        ok = false;
        break;
      }
      aligned.push({ text: sents[sIdx], words: buf });
    }
    if (ok && wIdx === words.length && aligned.length === sents.length) {
      return aligned;
    }
  }
  const groups = [];
  let buf = [];
  let bufText = "";
  for (const w of words) {
    buf.push(w);
    bufText = concatWordPair(bufText, w.text);
    if (endsSentence(bufText) && splitSentences(bufText).length >= 1 && !isAbbreviationDot(bufText, bufText.length - 1)) {
      groups.push({ text: bufText, words: buf });
      buf = [];
      bufText = "";
    }
  }
  if (buf.length > 0) {
    groups.push({ text: bufText, words: buf });
  }
  return groups;
}

export function buildCues(segments, opts = {}) {
  const softMax = opts.softMaxChars ?? NETFLIX.SOFT_MAX_CHARS;
  const minS = opts.minS ?? NETFLIX.MIN_DURATION_S;
  const maxS = opts.maxS ?? NETFLIX.MAX_DURATION_S;
  const cps = opts.cps ?? NETFLIX.CPS;
  const gap = (opts.gapMs ?? NETFLIX.GAP_MS) / 1000;
  const mergeGapS = opts.mergeGapS ?? NETFLIX.MERGE_GAP_S;
  const speed = normalizeSpeed(opts.speed ?? SPEED_DEFAULT);
  const scaleTime = Math.abs(speed - 1.0) > 1e-9;
  const effectiveMergeGapS = scaleTime ? mergeGapS / speed : mergeGapS;

  if (!Number.isFinite(minS) || !Number.isFinite(maxS) || minS > maxS) {
    throw new RangeError(`buildCues: require finite minS<=maxS (got minS=${minS}, maxS=${maxS})`);
  }
  if (!Array.isArray(segments)) throw new TypeError("buildCues: segments must be an array");

  // ── Phase 1 · sentence units (word-exact whenever the server provides words)
  const units = [];
  const sorted = [...segments]
    .filter((s) => s && collapse(s.text))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  for (const seg of sorted) {
    if (!Number.isFinite(seg.start) || !Number.isFinite(seg.end)) {
      throw new RangeError(`buildCues: segment start/end must be finite (got ${seg.start}, ${seg.end})`);
    }
    const text = collapse(seg.text);
    if (!text) continue;
    const segStart = scaleTime ? seg.start / speed : seg.start;
    const segEnd = scaleTime ? seg.end / speed : seg.end;
    const words = toTimelineWords(seg.words, speed);
    const sents = splitSentences(text);
    const rawStartMs =
      seg.rawStartMs != null ? (scaleTime ? Math.round(seg.rawStartMs / speed) : seg.rawStartMs) : null;
    const rawEndMs =
      seg.rawEndMs != null ? (scaleTime ? Math.round(seg.rawEndMs / speed) : seg.rawEndMs) : null;
    if (sents.length <= 1 || !words) {
      units.push({
        start: segStart,
        end: segEnd,
        text,
        words,
        sentenceFlag: endsSentence(text),
        rawStartMs,
        rawEndMs,
      });
      continue;
    }
    const groups = groupWordsIntoSentences(words, sents);
    if (groups.length !== sents.length) {
      units.push({
        start: segStart,
        end: segEnd,
        text,
        words,
        sentenceFlag: endsSentence(text),
        rawStartMs,
        rawEndMs,
      });
      continue;
    }
    for (const g of groups) {
      units.push({
        start: g.words[0].start,
        end: g.words[g.words.length - 1].end,
        text: g.text,
        words: g.words,
        sentenceFlag: endsSentence(g.text),
        rawStartMs: null,
        rawEndMs: null,
      });
    }
  }

  // ── Phase 2 · cross-segment MERGE of unfinished sentences
  const assembled = [];
  let cur = null;
  for (const u of units) {
    if (cur === null) {
      cur = { ...u, sources: [u] };
      continue;
    }
    const isCjkPair = CJK_CHAR_RE.test(cur.text) || CJK_CHAR_RE.test(u.text);
    const silence = u.start - cur.end;
    const combinedLen = visualLen(cur.text) + (isCjkPair ? 0 : 1) + visualLen(u.text);
    const worthMerging =
      !isCjkPair &&
      !cur.sentenceFlag &&
      silence <= effectiveMergeGapS + 1e-9 &&
      silence >= -(scaleTime ? 0.05 / speed : 0.05) &&
      combinedLen <= softMax * 2;
    if (worthMerging) {
      cur.text = concatWordPair(cur.text, u.text);
      cur.end = Math.max(cur.end, u.end);
      cur.sentenceFlag = u.sentenceFlag ?? endsSentence(u.text);
      cur.words = cur.words && u.words ? [...cur.words, ...u.words] : null;
      cur.rawStartMs = cur.rawStartMs ?? u.rawStartMs ?? null;
      cur.rawEndMs = u.rawEndMs ?? cur.rawEndMs ?? null;
      cur.sources.push(u);
    } else {
      assembled.push(cur);
      cur = { ...u, sources: [u] };
    }
  }
  if (cur !== null) assembled.push(cur);

  // ── Phase 3 · Viterbi DP clause/word-exact SPLIT of overlong sentences
  const raw = [];
  for (const a of assembled) {
    const vLen = visualLen(a.text);
    if (vLen <= softMax) {
      raw.push(a);
      continue;
    }
    const tokens = a.text.split(" ");
    const k = Math.ceil(vLen / softMax);
    const wordsAligned = Array.isArray(a.words) && a.words.length > 0;
    const canCutWords = wordsAligned && (a.words.length === tokens.length || wordsCoverText(a.words, a.text));
    const breaks = canCutWords ? chooseOptimalBreaksDP(a.words, k, { clauseOnly: true, softMax, cps }) : [];
    if (breaks.length < k - 1) {
      if (a.sources && a.sources.length > 1 && a.end - a.start > maxS) {
        for (const s of a.sources) raw.push(s);
        continue;
      }
      const dpEven =
        canCutWords && wordsCoverText(a.words, a.text)
          ? chooseOptimalBreaksDP(a.words, k, { clauseOnly: false, softMax, cps })
          : [];
      if (dpEven.length === k - 1 && k > 1) {
        pushWordSlices(raw, a.words, dpEven, a.text);
        continue;
      }
      raw.push(a);
      continue;
    }
    pushWordSlices(raw, a.words, breaks, a.text);
  }

  raw.sort((a, b) => a.start - b.start || a.end - b.end);

  // ── Phase 4 · visibility timing law
  const cues = [];
  let cursorTime = -Infinity;
  const phaseWarnings = [];
  for (let idx = 0; idx < raw.length; idx++) {
    const r = raw[idx];
    const origStart = r.start;
    const start = Math.max(r.start, cursorTime);
    if (start - origStart > 0.05) phaseWarnings.push(`start-shifted:${cues.length + 1}`);
    const nextRawStart = idx + 1 < raw.length ? raw[idx + 1].start : Number.POSITIVE_INFINITY;
    const minTarget =
      nextRawStart < Number.POSITIVE_INFINITY
        ? Math.max(r.end, Math.min(start + minS, nextRawStart - gap))
        : start + minS;
    const end = Math.max(r.end, minTarget, start + 0.001);
    cues.push(
      Segment({
        start,
        end,
        text: r.text,
        words: r.words ?? [],
        rawStartMs: r.rawStartMs ?? null,
        rawEndMs: r.rawEndMs ?? null,
      }),
    );
    cursorTime = end + gap;
  }

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const needed = visualLen(cue.text) / cps;
    const limitNext =
      i + 1 < cues.length ? cues[i + 1].start - gap : Number.POSITIVE_INFINITY;
    const target = Math.min(cue.start + needed, cue.start + maxS, limitNext);
    if (target > cue.end) {
      cues[i] = Segment({
        start: cue.start,
        end: target,
        text: cue.text,
        words: cue.words,
        rawStartMs: cue.rawStartMs,
        rawEndMs: cue.rawEndMs,
      });
    }
  }

  const out = cues.map((cue, idx) => {
    const limitNext = idx + 1 < cues.length ? cues[idx + 1].start - gap : Number.POSITIVE_INFINITY;
    const capped = Math.min(cue.end, cue.start + maxS, limitNext);
    const floorEnd = Math.min(cue.start + Math.min(minS, maxS), limitNext);
    return Segment({
      start: cue.start,
      end: Math.max(capped, floorEnd, cue.start + 0.001),
      text: cue.text,
      words: cue.words,
      rawStartMs: cue.rawStartMs,
      rawEndMs: cue.rawEndMs,
    });
  });

  return { cues: out, warnings: [...phaseWarnings, ...collectWarnings(out, { cps, minS, gap, maxS })] };
}

function collectWarnings(cues, { cps, minS, gap, maxS = null }) {
  const warnings = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const dur = cue.end - cue.start;
    if (dur < minS - 1e-9) warnings.push(`duration<min: cue ${i + 1}`);
    if (maxS !== null && dur > maxS + 1e-9) warnings.push(`duration>max: cue ${i + 1}`);
    if (charLen(cue.text) / dur > cps) warnings.push(`cps>${cps}: cue ${i + 1}`);
    if (i > 0 && cue.start - cues[i - 1].end < gap - 1e-9) {
      warnings.push(`gap<${Math.round(gap * 1000)}ms: cue ${i + 1}`);
    }
  }
  return warnings;
}

export function validateNetflix(cues) {
  const errors = [];
  let prevEnd = -Infinity;
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const n = i + 1;
    if (!cue.text.trim()) errors.push(`Cue ${n}: rỗng`);
    if (cue.end <= cue.start) errors.push(`Cue ${n}: end <= start`);
    if (cue.start < prevEnd) errors.push(`Cue ${n}: chồng lấn`);
    if (cue.text.includes("\n")) errors.push(`Cue ${n}: nhiều dòng`);
    prevEnd = cue.end;
  }
  return errors;
}
