/** Engine selection — JianYing ONLY.
 * Two modes share the single best engine:
 *   • AUTO TURBO        → chunked media, composed timeline
 *   • JianYing ORIGINAL → whole file, server timestamps verbatim
 * NO-FALLBACK doctrine: unknown models are hard errors; there is no second
 * engine to degrade to — by design. */

import { AppError } from "../core/errors.js";

export const MODEL_AUTO = "AUTO TURBO · JianYing";
export const MODEL_JIANYING = "JianYing ORIGINAL 1:1 · client 10.9";
export const MODELS = Object.freeze([MODEL_AUTO, MODEL_JIANYING]);

/** Resolves the engine for a model. Unknown models are hard errors. */
export function resolveProvider(model) {
  if (model === MODEL_JIANYING || model === MODEL_AUTO) return "JianYing";
  throw new AppError(`Model không hợp lệ: ${model}`);
}

export function validateModel(model) {
  if (!MODELS.includes(model)) {
    throw new AppError(`Model không hợp lệ: ${model} · hợp lệ: ${MODELS.join(" | ")}`);
  }
  return model;
}

/** Single-pass validate + resolve: one membership check yields both the model
 * and its engine, so per-run setup never pays validateModel + resolveProvider
 * as two separate scans (callers should prefer this over the pair). */
export function resolveEngine(model) {
  if (model === MODEL_JIANYING || model === MODEL_AUTO) return { model, provider: "JianYing" };
  throw new AppError(`Model không hợp lệ: ${model} · hợp lệ: ${MODELS.join(" | ")}`);
}
