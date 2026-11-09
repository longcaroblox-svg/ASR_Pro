/** UltraX locked protocol probe — verifies JianYing accepts a passthrough clip. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cutUnits } from "./audio/cut.js";
import { inspectMedia } from "./audio/media.js";
import { PERF } from "./core/config.js";
import { jianying } from "./decode/jianying.js";
import { atomicWrite } from "./export/srt.js";

const noopProgress = () => {};

async function timedProbe(fn) {
  const started = performance.now();
  try {
    const rows = await fn();
    return { accepted: true, utterances: rows.length, seconds: round3((performance.now() - started) / 1000) };
  } catch (exc) {
    return { accepted: false, error: String(exc?.message ?? exc), seconds: round3((performance.now() - started) / 1000) };
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

const EXT_BY_KIND = new Map([
  ["mp4-aac", "aac"],
  ["mp4-mp3", "mp3"],
  ["mp3", "mp3"],
  ["wav", "wav"],
]);

const WRAP_BY_KIND = new Map([
  ["mp4-aac", "adts"],
  ["mp4-mp3", "raw"],
  ["mp3", "raw"],
  ["wav", "wav"],
]);

export async function probeAll(audioPath, seconds = 20) {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) {
    throw new RangeError(`probe seconds phải là số nguyên 1–300 (got ${seconds})`);
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "asr-probe-"));
  try {
    const meta = inspectMedia(audioPath);
    const wrap = WRAP_BY_KIND.get(meta.kind);
    if (!wrap) throw new Error(`probe: kind ${meta.kind} chưa hỗ trợ`);
    const ext = EXT_BY_KIND.get(meta.kind);
    if (!ext) throw new Error(`probe: kind ${meta.kind} thiếu ext`);
    const sample = path.join(temp, `sample.${ext}`);
    const toAuExcl = Math.min(meta.track.auCount, meta.track.auIndexAtS(seconds));
    const [cut] = await cutUnits(meta, [{ fromAu: 0, toAuExcl, outPath: sample, wrap }]);
    const jianyingReport = {
      client_version: PERF.JY_APPVR,
      format: `${meta.kind} · ${wrap}`,
      bytes: cut.size,
      ...(await timedProbe(() => jianying(sample, (seconds * 1000) | 0, noopProgress, { crcHex: cut.crcHex, audioSize: cut.size }))),
    };
    return {
      sample: String(audioPath),
      sample_seconds: seconds,
      jianying: [jianyingReport],
      warning:
        "Accepted protocol is not a mathematical WER certificate. " +
        "UltraX locks Jianying 10.9.0 for fidelity.",
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    let audioPath = null;
    let seconds = 20;
    let output = "model-probe-report.json";
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--seconds") {
        const raw = argv[++i];
        seconds = Number.parseInt(String(raw ?? "").trim(), 10);
      } else if (argv[i] === "--output") {
        const raw = argv[++i];
        output = String(raw ?? "").trim();
      } else if (argv[i].startsWith("-")) {
        process.stderr.write(`Flag không hợp lệ: ${argv[i]}\n`);
        process.stderr.write("Usage: node src/model-probe.js <audio> [--seconds 20] [--output report.json]\n");
        return 2;
      } else if (audioPath === null) {
        audioPath = argv[i];
      } else {
        process.stderr.write(`Thừa đối số: ${argv[i]}\n`);
        return 2;
      }
    }
    // Bounds: probe clip 1–300s; output must be non-empty and stay a .json file.
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) {
      process.stderr.write("--seconds phải là số nguyên 1–300\n");
      return 2;
    }
    if (!output) {
      process.stderr.write("--output không được rỗng\n");
      return 2;
    }
    const resolvedOutput = path.resolve(output);
    if (path.extname(resolvedOutput).toLowerCase() !== ".json") {
      process.stderr.write("--output phải là file .json\n");
      return 2;
    }
    let audioStat = null;
    try {
      audioStat = audioPath ? fs.statSync(audioPath) : null;
    } catch {
      audioStat = null;
    }
    if (!audioPath || !audioStat || !audioStat.isFile()) {
      process.stderr.write("Usage: node src/model-probe.js <audio> [--seconds 20] [--output report.json]\n");
      return 2;
    }
    const report = await probeAll(path.resolve(audioPath), seconds);
    atomicWrite(resolvedOutput, JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return 0;
  } catch (exc) {
    process.stderr.write(`probe thất bại: ${exc?.stack ?? String(exc)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((exc) => {
    process.stderr.write(`probe thất bại: ${exc?.stack ?? String(exc)}\n`);
    process.exit(1);
  });
}
