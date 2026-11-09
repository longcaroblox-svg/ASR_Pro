/** ASR Studio UltraX CLI — strict args, NO-FALLBACK defaults. */

import path from "node:path";
import { CancelToken } from "./core/cancel.js";
import { Options, SPEED_DEFAULT, SPEED_MAX, SPEED_MIN, normalizeSpeed } from "./core/domain.js";
import { ASRError, isCancelled } from "./core/errors.js";
import { CloudPipeline, MODELS, MODEL_AUTO } from "./pipeline/orchestrator.js";
import { extractAudio } from "./audio/extract.js";
import { textToSpeech } from "./audio/tts.js";

const USAGE = `ASR Studio UltraX (NodeJS) — Jianying-first media → live SRT

Usage:
  asr-ultrax <input> [options]

Options:
  -o, --output <file>          Output path (SRT for ASR, MP3 for TTS, AAC for extract)
  --model <name>               One of:
${MODELS.map((m) => `                               "${m}"`).join("\n")}
                               (default: ${MODEL_AUTO})
  --speed <0.5..1.5>           Playback speed / audio speed factor (default: 1.0, e.g. 0.8)
  --audio-speed <0.5..1.5>     Physically convert audio to speed (0.8x) before ASR request (no subtitle simulation)
  --jianying-version <ver>     JianYing appvr (default: 10.9.0)
  --workers <n>                Max parallel chunks (default: auto)
  --format <formats>           Export formats: srt, vtt, lrc, txt, all (default: srt)
  --extract                    Extract raw audio from video (<50ms) and exit
  --tts <text>                 Generate AI speech audio using CapCut Native Cloud TTS
  --tts-voice <id>             CapCut Voice (default: BV074_streaming)
                               [01] BV074_streaming           Cô Gái Hoạt Ngôn (co-gai-hoat-ngon)
                               [02] BV075_streaming           Thanh Niên Tự Tin (thanh-nien-tu-tin)
                               [03] vi_female_huong           Giọng Nữ Phổ Thông (nu-pho-thong)
                               [04] BV421_vivn_streaming      Nguồn Nhỏ Ngọt Ngào (nho-ngot-ngao)
                               [05] BV560_streaming           Anh Dũng (anh-dung)
                               [06] BV562_streaming           Chí Mai (chi-mai)
                               [07] BV075_streaming_vibrato_dsp  Việt Rung (viet-rung)
                               [08] BV075_streaming_demon_dsp Quỷ Việt (quy-viet)
                               [09] BV074_streaming_dsp       giọng bé (giong-be)
                               [10] BV075_streaming_robot_dsp Robot VN (robot-vn)
  --tts-rate <speed>           TTS speech rate (default: 1.0)
  -h, --help                   Show this help

Env: ASR_SILENCE, ASR_MAX_WORKERS,
     ASR_JY_POLL_READ, ASR_JY_POLL_ATTEMPTS (see README)
`;

function expectValue(argv, i, flag) {
  const value = argv[i];
  if (value === undefined || value.startsWith("-")) {
    throw new ASRError(`${flag} cần một giá trị`);
  }
  return value;
}

/** Thrown for -h/--help — main() renders USAGE and returns 0 (never process.exit here). */
export class HelpRequested extends ASRError {
  constructor() {
    super("__help__");
  }
}

/** Thrown when <input> is missing — main() renders USAGE and returns 2. */
export class MissingInputError extends ASRError {
  constructor() {
    super("Thiếu <input> — cần đường dẫn media đầu vào");
  }
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function deriveOutput(inputPath) {
  const ext = path.extname(inputPath);
  return ext ? inputPath.slice(0, -ext.length) + ".srt" : inputPath + ".srt";
}

export function parseArgs(argv) {
  const options = {
    input: null,
    output: null,
    model: MODEL_AUTO,
    jianyingVersion: "10.9.0",
    workers: null,
    speed: SPEED_DEFAULT,
    physicalSpeed: null,
    formats: ["srt"],
    extractOnly: false,
    ttsText: null,
    ttsVoice: "BV074_streaming",
    ttsRate: "1.0",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        throw new HelpRequested();
      case "-o":
      case "--output": {
        const out = expectValue(argv, ++i, arg).trim();
        if (!out) throw new ASRError(`${arg} không được rỗng`);
        options.output = out;
        break;
      }
      case "--model": {
        const model = expectValue(argv, ++i, arg);
        if (!MODELS.includes(model)) {
          throw new ASRError(`Model không hợp lệ: ${model} · hợp lệ: ${MODELS.join(" | ")}`);
        }
        options.model = model;
        break;
      }
      case "--speed": {
        const raw = expectValue(argv, ++i, arg).trim().replace(/x$/i, "");
        if (!raw) throw new ASRError(`--speed phải nằm trong khoảng [${SPEED_MIN}, ${SPEED_MAX}]`);
        try {
          options.speed = normalizeSpeed(Number(raw));
        } catch {
          throw new ASRError(`--speed phải nằm trong khoảng [${SPEED_MIN}, ${SPEED_MAX}] (nhận: ${raw})`);
        }
        break;
      }
      case "--audio-speed": {
        const raw = expectValue(argv, ++i, arg).trim().replace(/x$/i, "");
        if (!raw) throw new ASRError(`--audio-speed phải nằm trong khoảng [${SPEED_MIN}, ${SPEED_MAX}]`);
        try {
          options.speed = normalizeSpeed(Number(raw));
          options.physicalSpeed = true;
        } catch {
          throw new ASRError(`--audio-speed phải nằm trong khoảng [${SPEED_MIN}, ${SPEED_MAX}] (nhận: ${raw})`);
        }
        break;
      }
      case "--physical-speed": {
        options.physicalSpeed = true;
        break;
      }
      case "--jianying-version": {
        const v = expectValue(argv, ++i, arg).trim();
        if (!v) throw new ASRError("--jianying-version không được rỗng");
        if (!SEMVER_RE.test(v)) {
          throw new ASRError(`--jianying-version phải là semver x.y.z (got ${JSON.stringify(v)})`);
        }
        options.jianyingVersion = v;
        break;
      }
      case "--workers": {
        const raw = expectValue(argv, ++i, arg);
        if (!/^\d+$/.test(raw)) throw new ASRError("--workers phải là số nguyên > 0");
        const n = Number.parseInt(raw, 10);
        if (n <= 0) throw new ASRError("--workers phải là số nguyên > 0");
        options.workers = Math.min(n, 16);
        break;
      }
      case "--format": {
        const val = expectValue(argv, ++i, arg).toLowerCase();
        options.formats = val.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      }
      case "--extract": {
        options.extractOnly = true;
        break;
      }
      case "--tts": {
        options.ttsText = expectValue(argv, ++i, arg);
        break;
      }
      case "--tts-voice": {
        options.ttsVoice = expectValue(argv, ++i, arg).trim();
        break;
      }
      case "--tts-rate": {
        options.ttsRate = expectValue(argv, ++i, arg).trim();
        break;
      }
      default:
        if (arg.startsWith("-")) throw new ASRError(`Flag không hợp lệ: ${arg}`);
        if (options.input !== null) throw new ASRError(`Thừa đối số: ${arg}`);
        options.input = arg;
    }
  }
  if (options.input === null && !options.ttsText) {
    throw new MissingInputError();
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (exc) {
    if (exc instanceof HelpRequested) {
      process.stdout.write(USAGE);
      return 0;
    }
    if (exc instanceof MissingInputError) {
      process.stdout.write(USAGE);
      process.stderr.write(`Lỗi: ${exc.message}\n`);
      return 2;
    }
    process.stderr.write(`Lỗi: ${exc instanceof ASRError ? exc.message : String(exc)}\n`);
    return 2;
  }

  if (parsed.ttsText) {
    const out = parsed.output ? path.resolve(parsed.output) : path.resolve("tts_output.mp3");
    try {
      await textToSpeech(parsed.ttsText, out, {
        voice: parsed.ttsVoice,
        rate: parsed.ttsRate,
        onProgress: (p, m) => process.stdout.write(`[${String(p).padStart(3, "0")}%] ${m}\n`),
      });
      return 0;
    } catch (exc) {
      process.stderr.write(`\nThất bại TTS: ${exc.message}\n`);
      return 1;
    }
  }

  const inputPath = path.resolve(parsed.input);
  if (parsed.extractOnly) {
    try {
      await extractAudio(inputPath, parsed.output, {
        onProgress: (p, m) => process.stdout.write(`[${String(p).padStart(3, "0")}%] ${m}\n`),
      });
      return 0;
    } catch (exc) {
      process.stderr.write(`\nThất bại tách âm thanh: ${exc.message}\n`);
      return 1;
    }
  }

  const outputPath = parsed.output ? path.resolve(parsed.output) : deriveOutput(inputPath);

  try {
    await new CloudPipeline(
      new CancelToken(),
      (p, m) => process.stdout.write(`[${String(p).padStart(3, "0")}%] ${m}\n`),
    ).run(
      Options({
        inputPath,
        outputPath,
        model: parsed.model,
        language: null,
        jianyingAppVersion: parsed.jianyingVersion,
        maxWorkers: parsed.workers,
        speed: parsed.speed,
        physicalSpeed: parsed.physicalSpeed,
        formats: parsed.formats,
      }),
    );
    return 0;
  } catch (exc) {
    const message = exc instanceof ASRError ? exc.describe() : (exc?.stack ?? String(exc));
    process.stderr.write(`\nThất bại: ${message}\n`);
    return isCancelled(exc) ? 130 : 1;
  }
}
