/** Sentence-accurate subtitle composition — ZERO fabricated timestamps.
 *
 * TIMING SOURCE OF TRUTH: the server. Cue boundaries come exclusively from
 * real utterance/word timestamps. When the provider supplies word-level times,
 * sentence and clause splits land on EXACT word boundaries. When it does not,
 * the cue simply spans its utterance — we never invent intermediate times.
 *
 * What this module does with TEXT (linguistic accuracy, priority #1):
 *   • catches individual complete sentences (. ! ? … with decimal protection)
 *   • MERGES unfinished fragments across segments into full sentences
 *     (bounded by a silence gap so unrelated speech is never glued)
 *   • SPLITS overlong complete sentences at CLAUSE punctuation only
 *
 * Presentation-timing law (visibility only, never content timing):
 *   min duration 5/6 s · max 7 s · gap ≥ 84 ms · CPS ≤ 20 extension · monotonic.
 *
 * Length (42 chars) is a SOFT target — language is never butchered for it.
 * NO-FALLBACK: structural violations are ERRORS; unreachable ideals are counted
 * as warnings, never hidden. */

import { Segment, SPEED_DEFAULT, normalizeSpeed } from "../core/domain.js";

export const NETFLIX = Object.freeze({
  MAX_CHARS: 42, // soft target — accuracy always wins over this number
  SOFT_MAX_CHARS: 56, // complete sentences longer than this get clause-split
  MIN_DURATION_S: 5 / 6, // 0.833…
  MAX_DURATION_S: 7.0,
  CPS: 20,
  GAP_MS: 84, // ≈ 2 frames @ 24fps
  MERGE_GAP_S: 1.5, // max silence across which an unfinished sentence may merge
});

const TERMINAL_RE = /[.!?…。！？]["»”')\]]?$/;
const CLAUSE_RE = /[,;:、，；：—]["»”')\]]?$/;
const CJK_CHAR_RE = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const CJK_EDGE_RE = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef。！？，、；：“”‘’（）《》【】]/;

/** Abbreviations whose trailing dot never ends a sentence (case-insensitive).
 * Multi-dot forms (e.g./i.e./etc./v.v.) are matched as full tokens below. */
const ABBR_DOT = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc",
  "no", "fig", "approx", "dept", "est", "min", "max", "inc", "ltd",
  "co", "corp", "vol", "ch", "sec", "tp", "ths", "ts", "pgs", "gs",
  "ks", "bs", "cn", "jan", "feb", "mar", "apr", "jun", "jul", "aug",
  "sep", "sept", "oct", "nov", "dec",
]);

/** Code-point length without `[...t]` array garbage (surrogate-pair aware). */
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

/**
 * CJK-aware visual/information width: each CJK ideograph/fullwidth char counts
 * as 2 units (so 28 Hanzi == 56 Latin chars for softMaxChars, and 10 Hanzi/s ==
 * 20 CPS reading speed). Pure Latin/Vietnamese text equals charLen(text) 1:1.
 */
function visualLen(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    count += CJK_CHAR_RE.test(text[i]) ? 2 : 1;
  }
  return count;
}

export function collapse(text) {
  return String(text).split(/\s+/).filter(Boolean).join(" ");
}

export function endsSentence(text) {
  return TERMINAL_RE.test(text.trim());
}

/** Smart CJK-aware concatenation of two adjacent word tokens. */
function concatWordPair(left, right) {
  if (!left) return right;
  if (!right) return left;
  const lastL = left[left.length - 1];
  const firstR = right[0];
  if (CJK_EDGE_RE.test(lastL) && CJK_EDGE_RE.test(firstR)) {
    return `${left}${right}`;
  }
  if (CJK_EDGE_RE.test(lastL) || CJK_EDGE_RE.test(firstR)) {
    // No space between CJK punctuation and Latin, or CJK ideograph and CJK.
    if (/[，。！？、；：“”‘’（）《》【】]/.test(lastL) || /[，。！？、；：“”‘’（）《》【】]/.test(firstR)) {
      return `${left}${right}`;
    }
    return `${left}${right}`;
  }
  return `${left} ${right}`;
}

/** Splits collapsed text into complete sentences (punctuation kept attached).
 * Decimal numbers ("3.5") are protected from being cut at their dot.
 * Abbreviations ("Dr.", "e.g.", "i.e.", "etc.", "v.v.", single-letter initials)
 * never trigger a split — the dot is part of the token, not a terminal.
 * CJK terminals 。！？ plus 。-style closers are first-class citizens. */
export function splitSentences(text) {
  const flat = collapse(text);
  const out = [];
  let start = 0;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…" && ch !== "。" && ch !== "！" && ch !== "？")
      continue;
    if (ch === "." && /\d/.test(flat[i - 1] ?? "") && /\d/.test(flat[i + 1] ?? "")) {
      continue; // decimal point
    }
    if (ch === "." && isAbbreviationDot(flat, i)) {
      continue; // "Dr." / "e.g." / "T." — not a sentence boundary
    }
    let end = i + 1;
    // Consume consecutive terminal marks ("?!", "...") before closing quotes.
    while (end < flat.length && /[.!?…。！？]/.test(flat[end])) end++;
    while (end < flat.length && /["»”')\]]/.test(flat[end])) end++;
    // CJK: no whitespace required after 。！？ — always a boundary.
    if (ch === "。" || ch === "！" || ch === "？") {
      out.push(flat.slice(start, end).trim());
      start = end;
      i = end - 1;
      continue;
    }
    // Only cut here if the next word starts after whitespace.
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

/** True when flat[i] is a "." belonging to an abbreviation, not a terminal.
 * Checks the token ending at i: single initials ("T."), titled abbreviations
 * ("Dr."), and multi-dot forms ("e.g.", "i.e.", "etc.", "v.v."). */
function isAbbreviationDot(flat, i) {
  if (flat[i + 1] === ".") return false; // part of ellipsis "..."
  const before = flat.slice(0, i);
  const token = (before.split(/\s+/).pop() ?? "").replace(/^["«“'(\[]+/, "");
  if (/(?:^|\s)(?:e\.g\.|i\.e\.|etc\.|v\.v\.|(?:[a-z]\.){2,})$/i.test(flat.slice(0, i + 1))) return true;
  // Single-letter initial: "T." / "J." mid-sentence.
  if (/^[A-Za-z]$/.test(token)) return true;
  // Titled abbreviation: "Dr." / "Mr." / "Tp." ...
  if (ABBR_DOT.has(token.toLowerCase())) return true;
  return false;
}

/** Join word tokens preserving CJK adjacency when tokens are CJK. */
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

/** Emits k word-exact cue pieces cut after each index in `breaks` (+ tail).
 * Every boundary is a REAL server word edge — zero fabricated timestamps. */
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

/** True when the word list covers the whole cue text (whitespace-insensitive),
 * so word-edge splits lose no characters — works for unspaced CJK too. */
function wordsCoverText(words, text) {
  const joined = words.map((w) => w.text).join("");
  return joined.length > 0 && squashWhitespace(joined) === squashWhitespace(text);
}

/** Balanced word-boundary cuts with no punctuation signal: picks the k−1 word
 * edges nearest the even visual-width targets, with an acoustic pause bonus so
 * natural speech pauses between words are preferred when breaking long CJK/Latin
 * utterances. */
function chooseEvenBreaks(words, targetCount) {
  if (!Number.isInteger(targetCount) || targetCount < 2) return [];
  if (!Array.isArray(words) || words.length < targetCount) return [];
  const prefix = [];
  let acc = 0;
  const hasCjk = words.some((w) => CJK_CHAR_RE.test(w.text));
  for (let i = 0; i < words.length; i++) {
    acc += visualLen(words[i].text) + (i > 0 && !hasCjk ? 1 : 0);
    prefix.push(acc);
  }
  const total = prefix[prefix.length - 1] ?? 0;
  if (!(total > 0)) return [];
  const need = targetCount - 1;
  const breaks = [];
  let prev = -1;
  for (let t = 1; t <= need; t++) {
    const target = (total * t) / targetCount;
    const maxIdx = words.length - 1 - (need - t);
    let best = null;
    let bestScore = Infinity;
    for (let i = prev + 1; i <= maxIdx; i++) {
      const dist = Math.abs(prefix[i] - target);
      const pauseS = Math.max(0, (words[i + 1]?.start ?? words[i].end) - words[i].end);
      // Acoustic pause bonus only when a real gap (>20ms) exists between words.
      const pauseBonus = pauseS > 0.02 ? Math.min(6, pauseS * 12) : 0;
      const score = dist - pauseBonus;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === null || best <= prev) return [];
    breaks.push(best);
    prev = best;
  }
  return breaks;
}

/** Normalizes provider word entries to second-based timeline words. */
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

/** Walks timeline words and groups them into sentences aligned with `sents`.
 * Returns [{text, words:[…]}] — every group's times are REAL word times. */
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
    groups.push({ text: bufText, words: buf }); // trailing unfinished fragment
  }
  return groups;
}

/** Chooses clause break indices among punctuation-bearing words only.
 * Guarantees enough punctuation candidates remain for subsequent cuts so an
 * early break never starves the tail. Returns [] when punctuation cannot supply
 * enough cuts — callers then keep the sentence whole instead of cutting mid-clause. */
function chooseClauseBreaks(words, targetCount) {
  const prefix = [];
  let acc = 0;
  const hasCjk = words.some((w) => CJK_CHAR_RE.test(w.text));
  for (let i = 0; i < words.length; i++) {
    acc += visualLen(words[i].text) + (i > 0 && !hasCjk ? 1 : 0);
    prefix.push(acc);
  }
  const total = prefix[prefix.length - 1] ?? 0;
  const punctIdx = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (TERMINAL_RE.test(words[i].text) || CLAUSE_RE.test(words[i].text)) punctIdx.push(i);
  }
  const need = targetCount - 1;
  if (punctIdx.length < need) return []; // refuse: no linguistic signal to cut on
  const breaks = [];
  let prevCandPos = -1;
  for (let k = 1; k <= need; k++) {
    const target = (total * k) / targetCount;
    const maxCandPos = punctIdx.length - 1 - (need - k);
    let bestPos = -1;
    let bestDist = Infinity;
    for (let p = prevCandPos + 1; p <= maxCandPos; p++) {
      const i = punctIdx[p];
      const dist = Math.abs(prefix[i] - target);
      if (dist < bestDist) {
        bestDist = dist;
        bestPos = p;
      }
    }
    if (bestPos < 0 || bestPos <= prevCandPos) return [];
    breaks.push(punctIdx[bestPos]);
    prevCandPos = bestPos;
  }
  return breaks;
}

/**
 * Builds broadcast-ready cues from merged segments.
 * Supports `opts.speed` in [0.5, 1.5] (default 1.0): projects source timestamps
 * and word boundaries to the target playback timeline (t' = t / speed), scales
 * the linguistic silence merge threshold proportionally, and enforces all
 * broadcast visibility laws (minS, maxS, gapMs, cps) in viewer playback time.
 * @returns {{cues: Array<object>, warnings: string[]}}
 */
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
      // Single sentence, or no real word times → NEVER fabricate intermediate cuts.
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
      // Token/punctuation mismatch — stay honest, emit one true-span cue.
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
        rawStartMs: null, // derived sub-span: no 1:1 server ms to claim
        rawEndMs: null,
      });
    }
  }

  // ── Phase 2 · cross-segment MERGE of unfinished sentences ────────────────
  // JianYing Chinese (CJK) ASR segments speech into complete breath/clause
  // utterances without trailing periods. Never fuse distinct CJK utterances
  // across segments — each JianYing CJK utterance is already a self-contained
  // caption unit.
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
      silence >= -(scaleTime ? 0.05 / speed : 0.05) && // tolerate micro overlaps from server timestamps
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

  // ── Phase 3 · clause-SPLIT of overlong sentences — word-exact only ───────
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
    const breaks = canCutWords ? chooseClauseBreaks(a.words, k) : [];
    if (breaks.length < k - 1) {
      if (a.sources && a.sources.length > 1 && a.end - a.start > maxS) {
        for (const s of a.sources) raw.push(s);
        continue;
      }
      const even = canCutWords && wordsCoverText(a.words, a.text) ? chooseEvenBreaks(a.words, k) : [];
      if (even.length === k - 1 && k > 1) {
        pushWordSlices(raw, a.words, even, a.text);
        continue;
      }
      raw.push(a); // no safe cut at all → keep the true-span whole cue
      continue;
    }
    pushWordSlices(raw, a.words, breaks, a.text);
  }

  raw.sort((a, b) => a.start - b.start || a.end - b.end);

  // ── Phase 4 · visibility timing law (never alters content timing source) ─
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

/** Structural validation — these MUST be zero for an SRT to render. */
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
