/** ASR Studio UltraX v9.0.0 Public Library Barrel Export. */

export {
  CloudPipeline,
  MODEL_AUTO,
  MODEL_JIANYING,
  MODELS,
  VERSION,
} from "./pipeline/orchestrator.js";
export {
  resolveEngine,
  resolveProvider,
  validateModel,
} from "./pipeline/load-balance.js";
export { mapAsCompleted } from "./pipeline/work-queue.js";
export {
  createIncrementalMerger,
  mergeParts,
  myersEditDistance,
  normalize,
  sequenceRatio,
  similarity,
  trySplicePartialOverlap,
} from "./pipeline/merge.js";

export { CancelToken } from "./core/cancel.js";
export { PERF, httpTimeout } from "./core/config.js";
export {
  Chunk,
  Options,
  Result,
  Segment,
  SPEED_DEFAULT,
  SPEED_MAX,
  SPEED_MIN,
  Word,
  isValidCue,
  normalizeSpeed,
} from "./core/domain.js";
export {
  AppError,
  ASRError,
  CancelledError,
  CircuitOpenError,
  ConnectTimeoutError,
  ExportError,
  NetworkError,
  ProviderError,
  ReadTimeoutError,
  isCancelled,
} from "./core/errors.js";
export { METRICS, MetricsRegistry } from "./core/metrics.js";

export { AdaptiveChunker } from "./audio/chunker.js";
export { cutAll, cutUnits } from "./audio/cut.js";
export { extractAudio } from "./audio/extract.js";
export { inspectMedia } from "./audio/media.js";
export { inspectAac, parseAdtsHeaderInto } from "./audio/aac.js";
export { inspectMp3 } from "./audio/mp3.js";
export { AAC_FREQ_TABLE, adtsHeader, adtsProfile, inspectMp4, parseAsc } from "./audio/mp4.js";
export { planOverlap } from "./audio/overlap.js";
export {
  boundaries,
  detectSilenceMidpoints,
  detectSilenceWithFfmpeg,
  detectWavSilenceRMS,
} from "./audio/silence.js";
export { convertAudioSpeed, getFfmpegPath, isFfmpegAvailable } from "./audio/speed.js";
export { CAPCUT_VOICES, textToSpeech } from "./audio/tts.js";
export { inspectWav, wavHeader } from "./audio/wav.js";

export {
  aws4VodSignature,
  buildApplyUploadAuthHeaders,
  buildApplyUploadQuery,
} from "./decode/aws4.js";
export { Deadline, fullJitterSleep } from "./decode/backoff.js";
export { CircuitBreaker } from "./decode/circuit-breaker.js";
export { crc32, crc32Fallback, crc32FileHex, crc32Hex } from "./decode/crc32-fast.js";
export {
  Session,
  buildSession,
  getSession,
  setSession,
  NetworkError as PoolNetworkError,
  ConnectTimeoutError as PoolConnectTimeoutError,
  ReadTimeoutError as PoolReadTimeoutError,
} from "./decode/http-pool.js";
export { jianying } from "./decode/jianying.js";
export { jyHeaders, tdid } from "./decode/jy-sign.js";
export { TokenBucket } from "./decode/rate-governor.js";
export { parseJianyingUtterances } from "./decode/result-parser.js";

export { LiveSRTPublisher } from "./export/live-publisher.js";
export { atomicWriteLrc, renderLrc } from "./export/lrc.js";
export { buildRunMetadata, writeMetadata } from "./export/metadata.js";
export {
  NETFLIX,
  buildCues,
  chooseOptimalBreaksDP,
  collapse,
  endsSentence,
  splitSentences,
  validateNetflix,
  visualLen,
} from "./export/netflix.js";
export { writeRawUtterances } from "./export/raw-json.js";
export { atomicWrite, cleanSubtitleText, rawSrt, rawSrtRows, renderSrt } from "./export/srt.js";
export { compose, composeWithWarnings, validate } from "./export/timeline.js";
export {
  detectInversion,
  exactMsToSrt,
  scaleRangeMs,
  srtTimeFloat,
} from "./export/timestamp-guard.js";
export { atomicWriteTxt, renderTxt } from "./export/txt.js";
export { atomicWriteVtt, renderVtt } from "./export/vtt.js";

export { formatEta, formatThroughput, progressSmooth } from "./ui/telemetry.js";
export { atomicWriteText, readBytes } from "./util/io-fast.js";
export { monotonicS, sleep } from "./util/time.js";
