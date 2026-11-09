/** Sentence-accurate subtitle engine contracts — accuracy over character counts. */

import { test } from "node:test";
import assert from "node:assert/strict";

const {
  NETFLIX,
  splitSentences,
  buildCues,
  validateNetflix,
  collapse,
  endsSentence,
} = await import("../src/export/netflix.js");
const { Segment } = await import("../src/core/domain.js");

const OPTS = {
  softMaxChars: NETFLIX.SOFT_MAX_CHARS,
  maxS: NETFLIX.MAX_DURATION_S,
  minS: NETFLIX.MIN_DURATION_S,
  cps: NETFLIX.CPS,
  gapMs: NETFLIX.GAP_MS,
  mergeGapS: NETFLIX.MERGE_GAP_S,
};

test("splitSentences — catches individual complete sentences", () => {
  assert.deepEqual(splitSentences("Xin chào. Bạn khỏe không? Rất tốt!"), [
    "Xin chào.",
    "Bạn khỏe không?",
    "Rất tốt!",
  ]);
});

test("splitSentences — protects decimal numbers", () => {
  assert.deepEqual(splitSentences("Giá là 3.5 nghìn. Hết."), ["Giá là 3.5 nghìn.", "Hết."]);
});

test("splitSentences — trailing fragment without punctuation stays one piece", () => {
  assert.deepEqual(splitSentences("Nói giữa chừng"), ["Nói giữa chừng"]);
});

test("endsSentence detects terminal punctuation", () => {
  assert.ok(endsSentence("Kết thúc đây."));
  assert.ok(endsSentence("Hỏi vậy hả?"));
  assert.ok(!endsSentence("chưa xong,"));
  assert.ok(!endsSentence("đang nói"));
});

test("MERGE — unfinished fragment merges with the next segment into a full sentence", () => {
  const segs = [
    Segment({ start: 0, end: 1.0, text: "Tôi nghĩ rằng" }),
    Segment({ start: 1.05, end: 2.2, text: "chúng ta nên bắt đầu ngay bây giờ." }),
  ];
  const { cues } = buildCues(segs, OPTS);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, "Tôi nghĩ rằng chúng ta nên bắt đầu ngay bây giờ.");
  assert.equal(cues[0].start, 0);
  // Merged span preserved; CPS may extend the end toward reading speed.
  assert.ok(cues[0].end >= 2.2 && cues[0].end <= NETFLIX.MAX_DURATION_S + 1e-9);
});

test("MERGE — silence gap blocks merging unrelated speech", () => {
  const segs = [
    Segment({ start: 0, end: 1.0, text: "một mảnh rời" }),
    Segment({ start: 4.0, end: 5.2, text: "câu khác hoàn toàn." }),
  ];
  const { cues } = buildCues(segs, OPTS);
  assert.equal(cues.length, 2);
});

test("MERGE — boundary: 1.4s silence merges, 1.6s silence blocks", () => {
  const mk = (silenceS) => [
    Segment({ start: 0, end: 1.0, text: "đang nói dở" }),
    Segment({ start: 1.0 + silenceS, end: 1.0 + silenceS + 1.2, text: "rồi nói tiếp đây." }),
  ];
  const merged = buildCues(mk(1.4), OPTS).cues;
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "đang nói dở rồi nói tiếp đây.");
  const blocked = buildCues(mk(1.6), OPTS).cues;
  assert.equal(blocked.length, 2);
});

test("MERGE — chains across three fragments until sentence completes", () => {
  const segs = [
    Segment({ start: 0, end: 0.8, text: "hôm nay" }),
    Segment({ start: 0.9, end: 1.6, text: "chúng ta" }),
    Segment({ start: 1.7, end: 3.0, text: "học bài." }),
  ];
  const { cues } = buildCues(segs, OPTS);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, "hôm nay chúng ta học bài.");
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 3.0);
});

test("NO-FABRICATION — multi-sentence segment WITHOUT word times stays one cue", () => {
  // Without server word timestamps, splitting time would be guessing.
  // The engine refuses: one cue, exact utterance span.
  const segs = [Segment({ start: 0, end: 6, text: "Chào buổi sáng. Hôm nay trời đẹp. Hẹn gặp lại." })];
  const { cues } = buildCues(segs, OPTS);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 6);
});

test("SPLIT — WITH server word timings: exact per-sentence bounds", () => {
  const words = [
    { start: 0.0, end: 0.5, text: "Chào" },
    { start: 0.5, end: 1.0, text: "buổi" },
    { start: 1.0, end: 1.5, text: "sáng." },
    { start: 2.0, end: 2.8, text: "Hôm" },
    { start: 2.8, end: 3.4, text: "nay" },
    { start: 3.4, end: 4.2, text: "trời" },
    { start: 4.2, end: 4.6, text: "đẹp." },
    { start: 5.0, end: 5.6, text: "Hẹn" },
    { start: 5.6, end: 6.0, text: "gặp lại." },
  ];
  const segs = [
    Segment({ start: 0, end: 6, text: "Chào buổi sáng. Hôm nay trời đẹp. Hẹn gặp lại.", words }),
  ];
  const { cues } = buildCues(segs, OPTS);
  assert.equal(cues.length, 3);
  assert.equal(cues[0].text, "Chào buổi sáng.");
  assert.equal(cues[0].start, 0.0);
  assert.equal(cues[0].end, 1.5); // EXACT server word time — no estimation
  assert.equal(cues[1].text, "Hôm nay trời đẹp.");
  assert.equal(cues[1].start, 2.0);
  assert.equal(cues[1].end, 4.6);
  assert.equal(cues[2].text, "Hẹn gặp lại.");
  assert.equal(cues[2].start, 5.0);
  assert.equal(cues[2].end, 6.0);
});

test("SPLIT — ellipsis and closing quotes are respected", () => {
  assert.deepEqual(splitSentences("Chờ đã… Rồi sao nữa?"), ["Chờ đã…", "Rồi sao nữa?"]);
  assert.deepEqual(splitSentences('Anh nói "dừng lại." rồi im.'), ['Anh nói "dừng lại."', "rồi im."]);
});

test("NO-FABRICATION — punctuation-starved run-on keeps its true span whole", () => {
  // No punctuation → no linguistic cut signal; without word times the engine
  // refuses to guess intermediate times and emits ONE true-span cue.
  const text = Array.from({ length: 24 }, (_, i) => `từ${i}`).join(" ");
  const { cues } = buildCues([Segment({ start: 0, end: 9, text })], OPTS);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, text);
  assert.equal(cues[0].start, 0);
  // Visibility capped at 7s (broadcast max) — content timing untouched.
  assert.equal(cues[0].end, NETFLIX.MAX_DURATION_S);
});

test("SPLIT — overlong sentence with word times: clause cuts on REAL word ends", () => {
  const text =
    "Khi chúng ta bắt đầu hành trình này, mọi thứ đều rất khó khăn, nhưng với sự kiên trì thì kết quả sẽ đến.";
  const tokens = text.split(" ");
  const words = tokens.map((t, i) => ({
    start: i * 0.3,
    end: i * 0.3 + Math.min(0.28, 0.12 + t.length * 0.02),
    text: t,
  }));
  const segs = [
    Segment({ start: words[0].start, end: words[words.length - 1].end, text, words }),
  ];
  const { cues } = buildCues(segs, OPTS);
  assert.ok(cues.length >= 2);
  // Every non-final piece ends at a clause boundary AND at a real word end time.
  for (let i = 0; i < cues.length - 1; i++) {
    assert.match(cues[i].text, /[,;:]$/, `break not at clause: "${cues[i].text}"`);
    const lastToken = cues[i].text.split(" ").pop();
    const src = words.find((w) => w.text === lastToken && Math.abs(w.end - cues[i].end) < 1e-9);
    assert.ok(src, `piece ${i} end ${cues[i].end} is not a real word boundary`);
  }
  // Lossless reconstruction.
  assert.equal(cues.map((c) => c.text).join(" "), text);
});

test("SOFT LIMIT — a 45-char complete sentence stays whole (accuracy > count)", () => {
  const text = "Đây là một câu hoàn chỉnh dài bốn mươi lăm ký tự."; // 49 chars
  const { cues } = buildCues([Segment({ start: 0, end: 3, text })], OPTS);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, text);
});

test("buildCues — never emits multi-line cues", () => {
  const segs = [
    Segment({
      start: 0,
      end: 12,
      text: "Một đoạn khá dài cần được tách thành nhiều cue liên tiếp để đảm bảo mỗi cue chỉ có một dòng theo chuẩn phát sóng.",
    }),
  ];
  const { cues } = buildCues(segs, OPTS);
  for (const cue of cues) {
    assert.ok(!cue.text.includes("\n"), "multi-line cue leaked");
  }
});

test("buildCues — monotonic, gap ≥ 84ms, no overlap", () => {
  const segs = [
    Segment({ start: 0, end: 10, text: "Câu thứ nhất kéo dài một chút để chiếm thời lượng." }),
    Segment({ start: 10.5, end: 20, text: "Câu thứ hai nối tiếp ngay sau đó." }),
  ];
  const { cues } = buildCues(segs, OPTS);
  assert.deepEqual(validateNetflix(cues), []);
  for (let i = 1; i < cues.length; i++) {
    assert.ok(cues[i].start - cues[i - 1].end >= NETFLIX.GAP_MS / 1000 - 1e-9);
  }
});

test("buildCues — extends short dense cues toward CPS target when room allows", () => {
  const segs = [
    Segment({ start: 0, end: 0.5, text: `${"x".repeat(39)}.` }), // terminal → no merge
    Segment({ start: 10, end: 11, text: "cue sau đó." }),
  ];
  const { cues } = buildCues(segs, OPTS);
  assert.equal(cues.length, 2);
  assert.ok(cues[0].end - cues[0].start >= 2.0 - 1e-9, `duration ${cues[0].end - cues[0].start}`);
  assert.deepEqual(validateNetflix(cues), []);
});

test("buildCues — caps extension at next cue minus gap", () => {
  const segs = [
    Segment({ start: 0, end: 0.5, text: `${"x".repeat(39)}.` }),
    Segment({ start: 1.0, end: 3, text: "next." }),
  ];
  const { cues } = buildCues(segs, OPTS);
  assert.equal(cues.length, 2); // terminal punctuation keeps them separate
  assert.ok(cues[0].end <= cues[1].start - NETFLIX.GAP_MS / 1000 + 1e-9);
  assert.deepEqual(validateNetflix(cues), []);
});

test("validateNetflix — structural violations only", () => {
  const bad = [
    Segment({ start: 0, end: 1, text: "a" }),
    Segment({ start: 0.5, end: 2, text: "overlap" }),   // overlaps previous
    Segment({ start: 3, end: 4, text: "two\nlines" }), // multi-line
    Segment({ start: 5, end: 3, text: "inverted" }),   // end <= start
  ];
  const errors = validateNetflix(bad);
  assert.equal(errors.length, 3);
  // A 50-char complete sentence is NOT an error anymore.
  const ok = [Segment({ start: 0, end: 4, text: "x".repeat(50) })];
  assert.deepEqual(validateNetflix(ok), []);
});

test("collapse normalizes whitespace", () => {
  assert.equal(collapse("  a   b\tc\nd "), "a b c d");
});
