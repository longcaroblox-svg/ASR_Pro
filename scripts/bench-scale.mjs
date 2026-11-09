/** SCALE STRESS — prove the pure-Node audio layer at hundreds-of-hours scale.
 * 1) MP4 fixture with ~16.8M AUs (≈100h @ 48kHz): inspect + full AU walk +
 *    cut planning must stay flat-memory and finish in seconds.
 * 2) 60-minute WAV: real chunker.split() end-to-end prep (no upload).
 *
 * Usage: node scripts/bench-scale.mjs [--hours 100] [--wav-minutes 60] */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const { buildMp4Aac, buildWav } = await import("../tests/fixtures.mjs");
const { inspectMedia } = await import("../src/audio/media.js");
const { AdaptiveChunker } = await import("../src/audio/chunker.js");
const { CancelToken } = await import("../src/core/cancel.js");

function rssMb() {
  return Math.round(process.memoryUsage().rss / 1048576);
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const hours = opt("hours", 100);
const wavMinutes = opt("wav-minutes", 60);

console.log("=".repeat(72));
console.log(`SCALE TEST · ${hours}h AAC accessor · ${wavMinutes}min WAV full prep`);
console.log("=".repeat(72));

// ---------- 1) Hundred-hour AAC accessor stress ----------
const auCount = Math.round(hours * 3600 * (48000 / 1024)); // 48kHz AAC-LC
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-scale-"));
const mp4Path = path.join(dir, `huge.mp4`);
process.stdout.write(`[1] building ${hours}h MP4 (${auCount.toLocaleString()} AUs) … `);
let t0 = performance.now();
fs.writeFileSync(mp4Path, buildMp4Aac({ auCount, mdatChunks: 64, sampleRate: 48000 }));
const buildS = ((performance.now() - t0) / 1000).toFixed(1);
const fileMb = Math.round(fs.statSync(mp4Path).size / 1048576);
console.log(`${buildS}s · ${fileMb}MB · RSS ${rssMb()}MB`);

t0 = performance.now();
const meta = inspectMedia(mp4Path);
const inspectMs = (performance.now() - t0).toFixed(1);
console.log(`    inspect  : ${inspectMs}ms · dur=${meta.durationS.toFixed(1)}s`);

t0 = performance.now();
let count = 0;
for (const _ of meta.track.iterateAus()) count += 1;
const walkS = ((performance.now() - t0) / 1000).toFixed(2);
console.log(`    walk     : ${count.toLocaleString()} AUs in ${walkS}s`);

t0 = performance.now();
const cuts = [];
for (let s = 0; s < meta.durationS; s += 480) cuts.push(meta.track.auIndexAtS(s));
const planMs = (performance.now() - t0).toFixed(1);
console.log(`    plan     : ${cuts.length} cut points in ${planMs}ms`);
console.log(`    RSS peak : ${rssMb()}MB`);

// ---------- 2) Real chunker on long WAV ----------
const wavSec = wavMinutes * 60;
const wavPath = path.join(dir, "long.wav");
process.stdout.write(`[2] building ${wavMinutes}min WAV (${(wavSec * 8000 * 2 / 1048576).toFixed(0)}MB PCM) … `);
t0 = performance.now();
fs.writeFileSync(wavPath, buildWav({ seconds: wavSec, sampleRate: 8000, toneBursts: [{ from: 8000, to: 16000, freq: 330 }, { from: 160000, to: 168000, freq: 550 }] }));
console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s`);

const wMeta = inspectMedia(wavPath);
const chunker = new AdaptiveChunker(new CancelToken(), () => {});
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "asr-scale-cut-"));
t0 = performance.now();
const chunks = await chunker.split(wMeta, temp);
const prepS = ((performance.now() - t0) / 1000).toFixed(2);

let bytes = 0;
const sizesOk = chunks.every((c) => {
  const st = fs.statSync(c.path);
  bytes += st.size;
  return st.size > 44; // wav header + payload
});
console.log(`    split    : ${chunks.length} chunks in ${prepS}s · all valid=${sizesOk} · ${(bytes / 1048576).toFixed(0)}MB out`);
console.log(`    RSS      : ${rssMb()}MB`);

// Cleanup the multi-GB artifacts.
for (const p of [mp4Path, wavPath, ...chunks.map((c) => c.path)]) {
  try {
    fs.rmSync(p, { force: true });
  } catch {}
}
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(temp, { recursive: true, force: true });
console.log("DONE");
