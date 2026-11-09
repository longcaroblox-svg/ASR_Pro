/** REAL-SERVER GATE PROBE — does JianYing accept pure-Node passthrough audio?
 * Uploads the ADTS AAC passthrough of a real media file through the exact
 * production flow and reports acceptance + latency breakdown. NO guessing:
 * this script prints what the server actually said.
 *
 * Usage: node scripts/probe-gate.mjs <media.mp4> [--seconds 20] [--wav] */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { cutUnits } = await import("../src/audio/cut.js");
const { inspectMedia } = await import("../src/audio/media.js");
const { jianying } = await import("../src/decode/jianying.js");

const args = process.argv.slice(2);
let mediaPath = null;
let seconds = 20;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--seconds") seconds = Number.parseInt(args[++i], 10);
  else mediaPath = args[i];
}
if (!mediaPath || !fs.existsSync(mediaPath)) {
  console.error("usage: node scripts/probe-gate.mjs <media> [--seconds 20]");
  process.exit(2);
}

const meta = inspectMedia(path.resolve(mediaPath));
const wrap = meta.kind === "mp4-aac" ? "adts" : meta.kind === "wav" ? "wav" : "raw";
const ext = meta.kind === "mp4-aac" ? "aac" : meta.kind === "mp3" ? "mp3" : "wav";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-gate-"));
const sample = path.join(dir, `clip.${ext}`);
const durS = Math.min(seconds, meta.durationS);
const toAuExcl =
  durS >= meta.durationS ? meta.track.auCount : Math.max(1, meta.track.auIndexAtS(durS));

console.log(`[gate] source kind=${meta.kind} trackDur=${meta.durationS.toFixed(3)}s`);
console.log(`[gate] cutting 0..${durS.toFixed(3)}s → ${wrap}:${sample}`);
const tCut = performance.now();
const [cut] = await cutUnits(meta, [{ fromAu: 0, toAuExcl, outPath: sample, wrap }]);
console.log(`[gate] cut ${cut.size}B in ${(performance.now() - tCut).toFixed(1)}ms crc=${cut.crcHex}`);

const tUp = performance.now();
try {
  const rows = await jianying(sample, Math.round(durS * 1000), (p, m) => {
    process.stdout.write(`  [${String(p).padStart(3)}%] ${m}\n`);
  }, { crcHex: cut.crcHex });
  const wall = ((performance.now() - tUp) / 1000).toFixed(2);
  console.log(`\n[gate] ACCEPTED · ${rows.length} utterances · wall=${wall}s`);
  for (const r of rows.slice(0, 8)) {
    console.log(`  ${(r.startMs / 1000).toFixed(2)}-${(r.endMs / 1000).toFixed(2)} ${r.text}`);
  }
  if (rows.length > 8) console.log(`  … +${rows.length - 8} more`);
  process.exitCode = 0;
} catch (exc) {
  const wall = ((performance.now() - tUp) / 1000).toFixed(2);
  console.log(`\n[gate] REJECTED after ${wall}s · ${exc.describe?.() ?? exc.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
