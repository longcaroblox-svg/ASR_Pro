/** Regression: unpunctuated CJK dense speech must never fuse-then-truncate.
 * Real find (Tap01 15.3s): 9 utterances 0.64–15.32s fused into ONE 7s cue,
 * silently discarding 8s of timing with zero warnings. buildCues must fall
 * back to the true source spans when no linguistic split exists. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildCues, validateNetflix } from "../src/export/netflix.js";
import { NETFLIX } from "../src/export/netflix.js";

const UTTERANCES = [
  [640, 2040, "大家好我是程秋"],
  [2080, 3040, "时代在变化"],
  [3040, 3880, "人也在变"],
  [3880, 5120, "老版程秋因为某些"],
  [5120, 6880, "事情无法再和大家见面"],
  [6880, 9320, "目前会以这个新的形象与大家见面"],
  [9360, 11040, "程风的形象目前未改风"],
  [11040, 13080, "我会尽量给大家带来高质量作品"],
  [13080, 15320, "在这里感谢大家有史以来的支持"],
];

function toSegs() {
  return UTTERANCES.map(([s, e, text]) => ({ start: s / 1000, end: e / 1000, text, words: null }));
}

test("CJK dense run: no fuse-then-truncate, full span preserved", () => {
  const { cues } = buildCues(toSegs(), {});
  assert.equal(cues.length, 9);
  assert.ok(Math.abs(cues[0].start - 0.64) < 1e-9);
  assert.ok(Math.abs(cues[cues.length - 1].end - 15.32) < 1e-9);
  // Every cue keeps its own utterance text (no fusion) and lawful timing:
  // gap-law may shift a start forward by the min-duration cascade, but never
  // backward, never past its true end, and never capped at maxS here.
  for (let i = 0; i < cues.length; i++) {
    const [s, e] = [UTTERANCES[i][0] / 1000, UTTERANCES[i][1] / 1000];
    assert.equal(cues[i].text, UTTERANCES[i][2]);
    assert.ok(cues[i].start >= s - 1e-9 && cues[i].start <= e, `cue ${i + 1} start lawful`);
    assert.ok(cues[i].end - cues[i].start <= NETFLIX.MAX_DURATION_S + 1e-9);
  }
  assert.deepEqual(validateNetflix(cues), []);
  // Text fully preserved, nothing dropped.
  const inputText = UTTERANCES.map((u) => u[2]).join(" ");
  const outputText = cues.map((c) => c.text).join(" ");
  assert.equal(outputText, inputText);
});

test("single punctuation-starved utterance keeps legacy cap behaviour", async () => {
  // One TRUE long utterance (not a fused giant) still follows the capped
  // broadcast law — this locks the pre-existing contract so the fallback
  // above cannot be mistaken for a general no-cap change.
  const { cues } = buildCues([{ start: 0, end: 20, text: "时代在变化人也在变老版程秋因为某些事情", words: null }], {});
  assert.equal(cues.length, 1);
  assert.equal(cues[0].end, NETFLIX.MAX_DURATION_S);
});

test("single giant WITH word times splits at real word edges, no truncation", () => {
  // Six contiguous words, zero punctuation, 120 chars over 0–20s.
  // k = ceil(120/56) = 3 → three cues on REAL word bounds, full 0–20s kept.
  const words = [
    { start: 0, end: 4, text: "abcdefghij0123456789" },
    { start: 4, end: 7, text: "klmnopqrst0123456789" },
    { start: 7, end: 10, text: "uvwxyzabcd0123456789" },
    { start: 10, end: 13, text: "efghijklmn0123456789" },
    { start: 13, end: 16, text: "opqrstuvwx0123456789" },
    { start: 16, end: 20, text: "yzabcdef012345678901" },
  ];
  const text = words.map((w) => w.text).join(" ");
  const { cues } = buildCues([{ start: 0, end: 20, text, words }], {});
  assert.equal(cues.length, 3);
  assert.ok(Math.abs(cues[0].start - 0) < 1e-9);
  assert.ok(Math.abs(cues[2].end - 20) < 1e-9);
  assert.deepEqual(validateNetflix(cues), []);
  for (const c of cues) assert.ok(c.end - c.start <= NETFLIX.MAX_DURATION_S + 1e-9);
});
