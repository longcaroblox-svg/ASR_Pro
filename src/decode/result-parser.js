/** Zero-mutation result parsers — extract server word timestamps when present.
 * Malformed timestamps are HARD errors (NO-FALLBACK: garbage in → error out).
 * Null/undefined timestamps throw (never default to 0); text must be a string;
 * range checks (start/end >= 0, end >= start) enforced per item, causes chained. */

function toMs(value) {
  if (value === null || value === undefined) {
    throw new TypeError("timestamp thiếu (null/undefined): " + JSON.stringify(value));
  }
  if (value === "") {
    throw new TypeError("timestamp không hợp lệ: " + JSON.stringify(value));
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError("timestamp không hợp lệ: " + JSON.stringify(value));
  }
  return Math.trunc(n);
}

function toText(value) {
  if (typeof value !== "string") {
    throw new TypeError("text phải là string, got: " + JSON.stringify(value)?.slice(0, 120));
  }
  return value;
}

function checkRange(startMs, endMs, label) {
  if (startMs < 0 || endMs < 0) {
    throw new RangeError(label + ": timestamp < 0 (start=" + startMs + ", end=" + endMs + ")");
  }
  if (endMs < startMs) {
    throw new RangeError(label + ": end < start (start=" + startMs + ", end=" + endMs + ")");
  }
}

/** Server word timeline, if the provider supplied one; otherwise null. */
function toWords(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (w === null || w === undefined || typeof w !== "object") {
      throw new TypeError("word[" + i + "] null/invalid");
    }
    let text;
    try {
      text = toText(w.text);
    } catch (cause) {
      throw new TypeError("word[" + i + "] text invalid: " + cause.message, { cause });
    }
    if (!text.trim()) continue;
    let startMs, endMs;
    try {
      startMs = toMs(w.start_time);
      endMs = toMs(w.end_time);
    } catch (cause) {
      throw new TypeError("word[" + i + "] timestamp invalid: " + cause.message, { cause });
    }
    checkRange(startMs, endMs, "word[" + i + "]");
    out.push({ startMs, endMs, text });
  }
  return out.length > 0 ? out : null;
}

export function parseJianyingUtterances(payload) {
  const utterances = payload?.utterances;
  if (!Array.isArray(utterances)) {
    throw new TypeError("JianYing query thiếu utterances");
  }
  return utterances.map((item, idx) => {
    try {
      if (item === null || item === undefined || typeof item !== "object") {
        throw new TypeError("utterance[" + idx + "] null/invalid");
      }
      const startMs = toMs(item.start_time);
      const endMs = toMs(item.end_time);
      const text = toText(item.text);
      checkRange(startMs, endMs, "utterance[" + idx + "]");
      return { startMs, endMs, text, words: toWords(item.words) };
    } catch (cause) {
      if (cause instanceof TypeError || cause instanceof RangeError) {
        if (cause._jyIdx === idx) throw cause;
        // Preserve the original class (RangeError stays RangeError) and chain the cause.
        const Ctor = cause instanceof RangeError ? RangeError : TypeError;
        const wrapped = new Ctor("utterance[" + idx + "] invalid: " + cause.message, { cause });
        wrapped._jyIdx = idx;
        throw wrapped;
      }
      throw cause;
    }
  });
}
