/** ASR Studio UltraX (NodeJS) — Jianying-first extreme cloud ASR.
 * JianYing ONLY · NO-FALLBACK: one engine, errors are surfaced, never downgraded. */

export { VERSION, CloudPipeline, MODEL_AUTO, MODEL_JIANYING, MODELS } from "./pipeline/orchestrator.js";
export { resolveEngine, resolveProvider, validateModel } from "./pipeline/load-balance.js";
export {
  Options,
  Result,
  Segment,
  Word,
  Chunk,
  isValidCue,
  SPEED_MIN,
  SPEED_MAX,
  SPEED_DEFAULT,
  normalizeSpeed,
} from "./core/domain.js";
export { CancelToken } from "./core/cancel.js";
export { PERF, httpTimeout } from "./core/config.js";
export { METRICS, MetricsRegistry } from "./core/metrics.js";
export {
  ASRError,
  AppError,
  CancelledError,
  ProviderError,
  ExportError,
  CircuitOpenError,
  NetworkError,
  ConnectTimeoutError,
  ReadTimeoutError,
  isCancelled,
} from "./core/errors.js";
export { jianying } from "./decode/jianying.js";
export {
  getSession,
  buildSession,
  setSession,
  NetworkError as PoolNetworkError,
  ConnectTimeoutError as PoolConnectTimeoutError,
  ReadTimeoutError as PoolReadTimeoutError,
} from "./decode/http-pool.js";
export { mergeParts, similarity } from "./pipeline/merge.js";
export { renderSrt, rawSrt, rawSrtRows, cleanSubtitleText, atomicWrite } from "./export/srt.js";
export { compose, validate } from "./export/timeline.js";
export { exactMsToSrt, srtTimeFloat, scaleRangeMs } from "./export/timestamp-guard.js";
export { LiveSRTPublisher } from "./export/live-publisher.js";
export { NETFLIX, buildCues, validateNetflix, splitSentences } from "./export/netflix.js";
export { formatEta, formatThroughput, progressSmooth } from "./ui/telemetry.js";
export { textToSpeech, CAPCUT_VOICES } from "./audio/tts.js";
export { extractAudio } from "./audio/extract.js";
export { convertAudioSpeed, getFfmpegPath, isFfmpegAvailable } from "./audio/speed.js";
export { detectSilenceMidpoints, detectSilenceWithFfmpeg, boundaries } from "./audio/silence.js";
export { renderVtt, atomicWriteVtt } from "./export/vtt.js";
export { renderLrc, atomicWriteLrc } from "./export/lrc.js";
export { renderTxt, atomicWriteTxt } from "./export/txt.js";
