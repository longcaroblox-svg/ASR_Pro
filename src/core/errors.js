/** Typed error hierarchy for ASR Studio UltraX (NodeJS port).
 * NO-FALLBACK doctrine: errors are surfaced, never swallowed into downgrades. */

function stringifyDetail(detail) {
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export class ASRError extends Error {
  constructor(message = "", { detail, cause } = {}) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = new.target.name;
    this.message = message;
    this.detail = detail;
    if (cause !== undefined) this.cause = cause;
  }
  describe() {
    if (this.message && this.detail !== undefined && this.detail !== null) {
      return `${this.message} (${stringifyDetail(this.detail)})`;
    }
    return this.message || this.name;
  }
  toString() {
    return this.describe();
  }
}

export class AppError extends ASRError {}

export class CancelledError extends ASRError {}

export class ProviderError extends ASRError {
  constructor(message = "", { provider, phase, detail, retryable = false, cause } = {}) {
    super(message, { detail, ...(cause !== undefined ? { cause } : {}) });
    this.provider = provider;
    this.phase = phase;
    this.retryable = Boolean(retryable);
    if (cause !== undefined) this.cause = cause;
  }
  describe() {
    const base = super.describe();
    const prefix = `[${this.provider}/${this.phase}]`;
    return base && base !== this.name ? `${prefix} ${base}` : prefix;
  }
}


export class ExportError extends ASRError {}

export class CircuitOpenError extends ASRError {}

/** Transport failures — single source of truth (http-pool re-exports these). */
export class NetworkError extends ASRError {
  constructor(message, { detail = null, connectPhase = false, cause } = {}) {
    super(message, { detail, ...(cause !== undefined ? { cause } : {}) });
    this.transient = true;
    this.connectPhase = connectPhase;
    if (cause !== undefined) this.cause = cause;
  }
}

export class ConnectTimeoutError extends NetworkError {
  constructor(message, opts = {}) {
    super(message, { ...opts, connectPhase: true });
  }
}

export class ReadTimeoutError extends NetworkError {
  constructor(message, opts = {}) {
    super(message, opts);
  }
}

/** Unified cancellation check — works for CancelledError instances, subclasses, or duck-typed {name}. */
export function isCancelled(exc) {
  return exc instanceof CancelledError || exc?.name === "CancelledError";
}
