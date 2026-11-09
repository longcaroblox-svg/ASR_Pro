/** CloudPipeline UltraX — Jianying-first, 10h+, anti-stall, live atomic SRT.
 * Audio layer is pure-NodeJS container passthrough — no external binary.
 * NO-FALLBACK doctrine: one model = one engine. Provider errors abort the job. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AdaptiveChunker } from "../audio/chunker.js";
import { inspectMedia } from "../audio/media.js";
import { convertAudioSpeed, isFfmpegAvailable } from "../audio/speed.js";
import { CancelToken } from "../core/cancel.js";
import { PERF } from "../core/config.js";
import { Options, Result, Segment, Word } from "../core/domain.js";
import { AppError, ASRError, CancelledError, CircuitOpenError, ProviderError, isCancelled } from "../core/errors.js";
import { METRICS } from "../core/metrics.js";
import { sleep } from "../util/time.js";
import { formatEta } from "../ui/telemetry.js";
import { CircuitBreaker } from "../decode/circuit-breaker.js";
import { jianying } from "../decode/jianying.js";
import { TokenBucket } from "../decode/rate-governor.js";
import { LiveSRTPublisher } from "../export/live-publisher.js";
import { buildRunMetadata, writeMetadata } from "../export/metadata.js";
import { writeRawUtterances } from "../export/raw-json.js";
import { renderVtt, atomicWriteVtt } from "../export/vtt.js";
import { renderLrc, atomicWriteLrc } from "../export/lrc.js";
import { renderTxt, atomicWriteTxt } from "../export/txt.js";
import { rawSrt } from "../export/srt.js";
import {
  MODEL_JIANYING,
  MODELS,
  MODEL_AUTO,
  resolveEngine,
  resolveProvider,
  validateModel,
} from "./load-balance.js";
import { mapAsCompleted } from "./work-queue.js";

export { MODEL_AUTO, MODEL_JIANYING, MODELS };

export const VERSION = "8.4.0";

export class CloudPipeline {
  // NOTE — single-use w.r.t. cancellation: the constructor CancelToken stays
  // cancelled once cancelled, so a cancelled run must be retried with a NEW
  // pipeline + token. Breaker/rate-governor state IS reset fresh per run()
  // (below), so consecutive successful runs on one instance are safe.
  #token;
  #progress;
  #chunkProgress = new Map();
  #chunkWeights = new Map();
  #startedAtMs = 0;
  #lastProgress = 0;
  #jyBreaker = new CircuitBreaker("jianying");
  #rate = new TokenBucket();

  // Progress bands: 0–26 audio prep (chunker), 26–94 ASR, 94–100 export.
  static ASR_BASE = 26;
  static ASR_SPAN = 68;

  /** Duration-weighted mean of chunk progress percentages. */
  static weightedAverage(progressMap, weightMap) {
    let weighted = 0;
    let totalWeight = 0;
    for (const [i, p] of progressMap) {
      const w = weightMap.get(i) ?? 1;
      weighted += w * p;
      totalWeight += w;
    }
    return totalWeight > 0 ? weighted / totalWeight : 0;
  }

  constructor(token = new CancelToken(), progress = () => {}) {
    this.#token = token;
    this.#progress = progress;
  }

  /**
   * Duration-weighted chunk progress: a 480s chunk counts 48× more than a
   * 10s chunk — the percentage now reflects real media processed, not chunk count.
   */
  #providerProgress(index, total, value, message) {
    const previous = this.#chunkProgress.get(index) ?? 0;
    this.#chunkProgress.set(index, Math.max(previous, value));

    const avg = CloudPipeline.weightedAverage(this.#chunkProgress, this.#chunkWeights);
    const overall = Math.max(
      this.#lastProgress,
      Math.min(94, CloudPipeline.ASR_BASE + Math.round((CloudPipeline.ASR_SPAN * avg) / 100)),
    );
    this.#lastProgress = overall;

    let eta = "";
    if (this.#startedAtMs > 0 && avg > 1 && avg < 100) {
      const elapsedS = (performance.now() - this.#startedAtMs) / 1000;
      const fraction = Math.min(1, avg / 100);
      eta = ` · ETA ${formatEta(elapsedS, fraction)}`;
    }
    this.#progress(overall, `Đoạn ${index + 1}/${total} · ${message}${eta}`);
  }

  /** Calls the ONE engine — JianYing. No secondary exists, no downgrade. */
  async #callProvider(provider, chunk, total, jianyingAppVersion) {
    const callback = (p, m) => this.#providerProgress(chunk.index, total, p, `${provider} · ${m}`);
    const attemptCall = () =>
      this.#jyBreaker.call(async () => {
        const acquired = await this.#rate.acquire(60.0);
        if (!acquired) {
          throw new ProviderError("rate limited locally", {
            provider: "JianYing",
            phase: "rate",
            retryable: true,
          });
        }
        return jianying(
          chunk.path,
          Math.round((chunk.end - chunk.start) * 1000),
          callback,
          { appVersion: jianyingAppVersion, token: this.#token, crcHex: chunk.crcHex, audioSize: chunk.bytes },
        );
      });
    try {
      return await attemptCall();
    } catch (exc) {
      if (exc instanceof CircuitOpenError) {
        // A transient open must not abort a 10h job harshly: wait out one
        // cooldown, then retry once. Persistent failure still aborts below.
        this.#token.check();
        await sleep(PERF.CIRCUIT_RESET_S * 1000);
        this.#token.check();
        return await attemptCall();
      }
      if (isLocalRateLimit(exc)) {
        // Local backpressure is transient — exponential backoff retry (3×)
        // instead of failing the whole job on one hot burst.
        let last = exc;
        for (let attempt = 1; attempt <= 3; attempt++) {
          this.#token.check();
          await sleep(Math.min(5000, 500 * 2 ** attempt));
          this.#token.check();
          try {
            return await attemptCall();
          } catch (retryExc) {
            last = retryExc;
            if (!isLocalRateLimit(retryExc)) throw retryExc;
          }
        }
        throw last;
      }
      throw exc;
    }
  }

  async #recognize(chunk, total, model, jianyingAppVersion, providerOverride = null) {
    this.#token.check();
    // Provider resolved once per run and passed down — avoids re-validating
    // the model string on every chunk (validateModel + resolveProvider double).
    const provider = providerOverride ?? resolveProvider(model); // hard error on unknown model
    let rows;
    try {
      rows = await METRICS.time(`recognize_${provider.toLowerCase()}_ms`, () =>
        this.#callProvider(provider, chunk, total, jianyingAppVersion),
      );
    } catch (exc) {
      // Cancel surfaces unwrapped and is never counted as a provider failure.
      if (isCancelled(exc)) throw exc;
      METRICS.incr("provider_errors");
      METRICS.incr("chunks_fail");
      // Lỗi là lỗi — không đổi engine, không thử lại bằng engine yếu hơn.
      throw new AppError(
        `Đoạn ${chunk.index + 1} thất bại · ${provider}: ${exc instanceof ASRError ? exc.describe() : String(exc?.message ?? exc)}`,
        { cause: exc },
      );
    }

    if (model === MODEL_JIANYING) {
      // ORIGINAL 1:1 — ZERO-TOUCH: server rows flow onward exactly as parsed.
      // No Segment objects, no float conversion, no field renamed or dropped.
      if (rows.length === 0) {
        METRICS.incr("chunks_fail");
        throw new AppError(`Đoạn ${chunk.index + 1} thất bại · ${provider}: kết quả rỗng`);
      }
      METRICS.incr("chunks_ok");
      return [chunk.index, rows, provider];
    }
    const segments = rows
      .filter((row) => {
        const keep = row.text.trim() && row.endMs > row.startMs;
        if (!keep) METRICS.incr("rows_dropped");
        return keep;
      })
      .map((row) =>
        Segment({
          start: chunk.start + row.startMs / 1000,
          end: chunk.start + row.endMs / 1000,
          text: row.text.trim(),
          words: toShiftedWordTimeline(row.words, chunk.start),
        }),
      );

    if (segments.length === 0) {
      METRICS.incr("chunks_fail");
      throw new AppError(`Đoạn ${chunk.index + 1} thất bại · ${provider}: kết quả rỗng`);
    }
    METRICS.incr("chunks_ok");
    return [chunk.index, segments, provider];
  }

  async run(options) {
    const baseline = METRICS.snapshot();
    const started = performance.now() / 1000;
    const source = options.inputPath;
    const output = options.outputPath;
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new AppError(`Không tìm thấy file: ${source}`);
    }

    const { model, provider: providerForChunks } = resolveEngine(options.model); // unknown model = hard error, single pass
    const jianyingAppVersion = options.jianyingAppVersion || PERF.JY_APPVR;

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "asr-ultrax-"));
    let mediaMeta = inspectMedia(source); // pure-Node container inspection
    let mediaDuration = mediaMeta.durationS;
    let physicalAudioConverted = false;

    const speed = options.speed ?? 1.0;
    const isSpeed08 = Math.abs(speed - 0.8) < 1e-4;
    const wantPhysicalSpeed =
      options.physicalSpeed === true ||
      (isSpeed08 && options.physicalSpeed !== false);

    if (Math.abs(speed - 1.0) > 1e-6 && wantPhysicalSpeed && isFfmpegAvailable()) {
      try {
        const speedStr = speed.toFixed(2).replace(/\.?0+$/, "");
        const convertedAudioPath = path.join(tempRoot, `converted-${speedStr}x.mp3`);
        this.#progress(4, `Chuyển đổi âm thanh chuẩn ${speedStr}x (không mô phỏng) bằng FFmpeg…`);
        await convertAudioSpeed(source, convertedAudioPath, speed, { token: this.#token });
        if (fs.existsSync(convertedAudioPath) && fs.statSync(convertedAudioPath).size > 0) {
          mediaMeta = inspectMedia(convertedAudioPath);
          mediaDuration = mediaMeta.durationS;
          physicalAudioConverted = true;
          this.#progress(7, `Đã chuyển đổi âm thanh ${speedStr}x thành công · request ASR trực tiếp…`);

          // Xuất file âm thanh kèm theo nếu không ở chế độ srtOnly
          if (!options.srtOnly && !options.noJunk) {
            try {
              const outAudio = replaceSuffix(output, `_${speedStr}x.mp3`);
              fs.copyFileSync(convertedAudioPath, outAudio);
            } catch {
              /* ignore optional audio export */
            }
          }
        }
      } catch (err) {
        if (options.physicalSpeed === true) {
          throw err;
        }
        // Fallback sang mô phỏng timestamp nếu là test fixture giả lập không chứa audio stream thật
      }
    }

    // Fresh per-run progress accounting (instance reuse safety).
    this.#chunkProgress = new Map();
    this.#chunkWeights = new Map();
    this.#lastProgress = 0;
    this.#startedAtMs = performance.now();
    // Fresh breaker + rate governor per run: a previous run's failures must
    // not leave the circuit open for the next run on a reused instance.
    this.#jyBreaker = new CircuitBreaker("jianying");
    this.#rate = new TokenBucket();

    const exact = model === MODEL_JIANYING;
    // Khi âm thanh đã được chuyển đổi vật lý (ví dụ 0.8x), server ASR nhận dạng trực tiếp file 0.8x đó.
    // Kết quả trả về đã khớp 1:1 với âm thanh 0.8x, nhận ngay phụ đề đó mà không cần mô phỏng co dãn timestamp!
    const publisherOptions = physicalAudioConverted ? { ...options, speed: 1.0 } : options;
    const publisher = new LiveSRTPublisher(output, publisherOptions, { exact });
    const providers = new Map();
    let workers = 1;
    let finalCues = [];

    try {
      const chunker = new AdaptiveChunker(this.#token, this.#progress);
      const chunks = exact
        ? await chunker.singleOriginal(mediaMeta, tempRoot)
        : await chunker.split(mediaMeta, tempRoot);
      const total = chunks.length;
      workers = Math.min(PERF.maxWorkers(options.maxWorkers), total);

      // Weight each chunk by its media duration for true weighted progress.
      let totalWeight = 0;
      for (const chunk of chunks) {
        const w = Math.max(0.001, chunk.end - chunk.start);
        this.#chunkWeights.set(chunk.index, w);
        totalWeight += w;
      }
      let completedWeight = 0;

      this.#progress(CloudPipeline.ASR_BASE, `UltraX ${workers} luồng · ${total} đoạn · ${model}…`);

      // Engine resolved once in run() via resolveEngine — passed down so
      // per-chunk work skips any second validation.
      const job = (chunk) => this.#recognize(chunk, total, model, jianyingAppVersion, providerForChunks);

      for await (const [chunk, outcome] of mapAsCompleted(job, chunks, {
        maxWorkers: workers,
        token: this.#token,
      })) {
        this.#token.check();
        if (outcome instanceof Error) {
          try {
            this.#token.cancel();
          } catch {
            /* cancel must never mask the original error */
          }
          throw outcome;
        }
        if (!Array.isArray(outcome)) {
          try {
            this.#token.cancel();
          } catch {
            /* ignore */
          }
          // A non-Array success value is a pipeline bug — wrap it so callers
          // always see an Error (never a raw undefined/object thrown).
          throw new AppError(
            `Đoạn ${chunk.index + 1} thất bại · ${providerForChunks}: kết quả không hợp lệ (${typeof outcome})`,
            { cause: outcome instanceof Error ? outcome : undefined },
          );
        }
        const [index, segments, provider] = outcome;
        providers.set(index, provider);
        const cues = publisher.onChunkDone(index, segments);
        // Duration-weighted completion bar: completed media fraction maps onto
        // ASR_BASE..94 (capped). The old max(last,94) pinned the bar at 94
        // after the very first chunk regardless of remaining work.
        completedWeight += this.#chunkWeights.get(index) ?? 1;
        const doneFrac = totalWeight > 0 ? completedWeight / totalWeight : 0;
        const doneBar =
          CloudPipeline.ASR_BASE + Math.round((CloudPipeline.ASR_SPAN * doneFrac));
        const overall = Math.min(94, Math.max(this.#lastProgress, doneBar));
        this.#lastProgress = overall;
        this.#progress(
          overall,
          `Live SRT · ${publisher.published.length}/${total} đoạn · ${cues.length} cue · ${provider}`,
        );
      }

      const flushed = publisher.flush();
      if (flushed.length === 0) {
        throw new AppError("ASR hoàn tất nhưng không trả phụ đề.");
      }
      finalCues = flushed;
    } finally {
      // Windows EBUSY: abandoned in-flight uploads may still hold chunk file
      // handles right after abort — yield a tick, then retry removal so
      // cleanup wins the race without masking the job error.
      await sleep(0);
      for (let attempt = 0; ; attempt++) {
        try {
          fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          break;
        } catch (exc) {
          const code = exc?.code;
          if ((code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY") && attempt < 8) {
            await sleep(120);
            continue;
          }
          break; /* cleanup must never mask the job error */
        }
      }
    }

    // Elapsed measured after teardown — parity with Python's with-block exit.
    const elapsed = performance.now() / 1000 - started;
    const providersByChunk = [...providers.keys()].sort((a, b) => a - b).map((k) => providers.get(k));
    const metadata = buildRunMetadata({
      product: "ASRStudio UltraX (NodeJS)",
      version: VERSION,
      input: String(source),
      output: String(output),
      model,
      jianying_app_version: jianyingAppVersion,
      providers_by_chunk: providersByChunk,
      duration_seconds: mediaDuration,
      speed,
      scaled_duration_seconds: physicalAudioConverted ? mediaDuration : Math.round((mediaDuration / speed) * 1000) / 1000,
      audio_physically_converted: physicalAudioConverted,
      simulated_subtitles: !physicalAudioConverted && Math.abs(speed - 1.0) > 1e-6,
      audio_speed: speed,
      chunk_seconds: PERF.CHUNK_CORE_S,
      overlap_seconds: PERF.OVERLAP_S,
      audio_kind: mediaMeta.kind,
      audio_codec: mediaMeta.track.codec ?? null,
      audio_passthrough: true,
      chunks: publisher.published.length,
      parallel_workers: workers,
      cues: finalCues.length,
      elapsed_seconds: Math.round(elapsed * 1000) / 1000,
      live_atomic_srt: true,
      jianying_first: true,
      no_fallback: true,
      netflix_single_line: true,
      netflix_max_chars: options.maxChars ?? 42,
      netflix_cps: options.cps ?? 20,
      netflix_warnings: publisher.warnings,
      metrics: METRICS.snapshotDelta(baseline),
      fidelity_note:
        "Server text/timestamps preserved in ORIGINAL modes. " +
        "Unofficial cloud ASR cannot mathematically guarantee 99.99% WER; " +
        "UltraX maximizes fidelity and eliminates client-side corruption.",
    });
    const srtOnly = Boolean(options.srtOnly || options.noJunk);
    if (!srtOnly) {
      if (exact) {
        const providerName = providers.get(0) ?? "server";
        writeRawUtterances(replaceSuffix(output, ".raw.json"), providerName, finalCues);
      }
      writeMetadata(replaceSuffix(output, ".json"), metadata);

      // Multi-format exports (.vtt, .lrc, .txt)
      const formats = options.formats || ["srt"];
      if (formats.includes("vtt") || formats.includes("all")) {
        atomicWriteVtt(replaceSuffix(output, ".vtt"), renderVtt(finalCues));
      }
      if (formats.includes("lrc") || formats.includes("all")) {
        atomicWriteLrc(replaceSuffix(output, ".lrc"), renderLrc(finalCues));
      }
      if (formats.includes("txt") || formats.includes("all")) {
        atomicWriteTxt(replaceSuffix(output, ".txt"), renderTxt(finalCues));
      }
    }


    const speedNote = speed !== 1.0 ? ` (${speed}x)` : "";
    this.#progress(
      100,
      exact
        ? `Hoàn tất · giữ nguyên timestamp server${speedNote}`
        : `Hoàn tất · timeline đã kiểm tra${speedNote}`,
    );
    return Result({
      outputPath: output,
      segments: finalCues,
      language: options.language || "auto",
      languageProbability: 0.0,
      elapsed,
      speed,
    });
  }
}

function replaceSuffix(filePath, newSuffix) {
  const ext = path.extname(filePath);
  return ext ? filePath.slice(0, -ext.length) + newSuffix : filePath + newSuffix;
}

/** Local token-bucket backpressure (phase "rate") — transient by nature. */
function isLocalRateLimit(exc) {
  return exc instanceof ProviderError && exc.retryable && exc.phase === "rate";
}

/** Provider word timeline → domain Word objects (seconds). Null stays null. */
function toWordTimeline(words) {
  if (!Array.isArray(words)) return null;
  return words.map((w) =>
    Word({ start: w.startMs / 1000, end: w.endMs / 1000, text: w.text }),
  );
}

/** AUTO mode: shift the server word timeline into global media time. */
function toShiftedWordTimeline(words, chunkStart) {
  const local = toWordTimeline(words);
  if (!local) return null;
  return local.map((w) => Word({ start: w.start + chunkStart, end: w.end + chunkStart, text: w.text }));
}

// Re-export for pipeline consumers.
export { Options };
