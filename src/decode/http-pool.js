/** Shared HTTP session pool — reuse TCP, no reconnect thrash.
 *
 * Zero-dependency client on node:http/https replicating the Python session:
 * - keep-alive connection pool (default 32 sockets, LIFO)
 * - default NO timeouts (timeout=null waits forever)
 *   optional timeout=[connectS|null, readS|null] (seconds, like requests)
 * - urllib3-style retry: total=2, connect=2, read=0 (never multiply long-poll
 *   read timeouts), status=1 for 429/5xx, backoff_factor=0.2,
 *   raise_on_status=False (final response returned regardless)
 * - requests-style redirect following (301/302/303 → GET, 307/308 preserve)
 */

import http from "node:http";
import https from "node:https";
import { CancelledError, ConnectTimeoutError, NetworkError, ReadTimeoutError } from "../core/errors.js";
import { PERF } from "../core/config.js";
import { sleep } from "../util/time.js";

// Canonical hierarchy lives in core/errors.js — re-exported here for compat.
export { ConnectTimeoutError, NetworkError, ReadTimeoutError };

// Local filesystem errors are permanent caller bugs, not transport blips —
// never disguise them as retryable NetworkErrors.
const FS_CODES = new Set([
  "ENOENT",
  "EACCES",
  "EISDIR",
  "EPERM",
  "ENOTDIR",
  "ELOOP",
  "ENAMETOOLONG",
]);

// Default cap for response bodies (16 MiB): poll/upload replies are tiny JSON.
// Prevents unbounded Buffer growth on a compromised/misbehaving endpoint.
const DEFAULT_MAX_BODY = 16 * 1024 * 1024;

const CONNECT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
]);

function classifyNetworkError(err, responseStarted) {
  if (err instanceof NetworkError) return err;
  const code = err?.code ?? "";
  if (code && FS_CODES.has(code)) return err;
  const message = String(err?.message ?? err ?? "");
  const hangUp = /socket hang up|connection closed|aborted/i.test(message);
  if ((!responseStarted && CONNECT_CODES.has(code)) || hangUp || code === "ABORT_ERR") {
    return new NetworkError((code || "network") + ": " + message, {
      detail: code,
      connectPhase: !responseStarted,
      cause: err,
    });
  }
  return new NetworkError((code || "network") + ": " + message, { detail: code, cause: err });
}

function makeResponse(res, body) {
  const headers = res.headers;
  return {
    status: res.statusCode,
    ok: res.statusCode >= 200 && res.statusCode < 400,
    headers,
    header(name) {
      const value = headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    },
    text() {
      return body.toString("utf8");
    },
    json() {
      return JSON.parse(body.toString("utf8"));
    },
    body: body,
  };
}

export class Session {
  #httpsAgent;
  #httpAgent;
  _lastUse = 0;
  _inflight = 0;

  constructor(poolSize = PERF.POOL_SIZE) {
    const options = {
      keepAlive: true,
      keepAliveMsecs: 30_000,
      maxSockets: poolSize,
      maxFreeSockets: poolSize,
      scheduling: "lifo",
    };
    this.#httpsAgent = new https.Agent(options);
    this.#httpAgent = new http.Agent(options);
    this._lastUse = Date.now();
  }

  /**
   * Single logical request with retry + redirect handling.
   * @param {string} method
   * @param {string} url
   * @param {{headers?:object, body?:Buffer|string|null|(()=>import("node:stream").Readable),
   *          contentLength?:number, timeout?:Array|null}} opts
   *   body as a FACTORY (returns a fresh Readable) enables disk-streaming uploads:
   *   each retry attempt opens a new stream; contentLength must be provided.
   *   timeout: null = wait forever, else [connectS|null, readS|null] in seconds.
   * @returns {Promise<object>} normalized response
   */
  async request(method, url, opts = {}) {
    const {
      headers = {},
      body = null,
      contentLength = null,
      timeout = null,
      followRedirects = true,
      retry = DEFAULT_RETRY,
    } = opts;

    let totalLeft = retry.total;
    let connectLeft = retry.connect;
    let statusLeft = retry.status;
    let redirectsLeft = 4;
    let currentUrl = url;
    let currentMethod = method.toUpperCase();
    let currentBody = body === undefined ? null : body;
    let currentHeaders = headers;
    const signal = opts.signal ?? null;
    const token = opts.token ?? null;
    const maxBody = opts.maxBody ?? DEFAULT_MAX_BODY;
    if (signal?.aborted) {
      throw new CancelledError("request aborted before start");
    }
    this._inflight = (this._inflight | 0) + 1;
    try {
    for (;;) {
      try {
        token?.check?.();
      } catch (cancelExc) {
        throw cancelExc;
      }
      if (signal?.aborted) {
        throw new CancelledError("request aborted");
      }
      let response;
      try {
        this._lastUse = Date.now();
        response = await this.#once(
          currentMethod,
          currentUrl,
          currentHeaders,
          currentBody,
          timeout,
          contentLength,
          maxBody,
          signal,
          token,
        );
      } catch (err) {
        if (signal?.aborted || token?.cancelled === true) {
          throw new CancelledError("request aborted", { cause: err });
        }
        if (err instanceof CancelledError) throw err;
        // #once already classifies transport failures into NetworkError.
        const networkErr = err instanceof NetworkError
          ? err
          : classifyNetworkError(err, false);
        const connectRetryable =
          networkErr instanceof ConnectTimeoutError ||
          (networkErr.connectPhase && !(networkErr instanceof ReadTimeoutError));
        if (connectRetryable && connectLeft > 0 && totalLeft > 0) {
          connectLeft -= 1;
          totalLeft -= 1;
          await sleep(retry.backoffFactor * 1000 * 2 ** (retry.total - totalLeft - 1));
          continue;
        }
        throw networkErr;
      }

      if (followRedirects && [301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.header("location");
        if (location) {
          if (redirectsLeft <= 0) {
            throw new NetworkError("too many redirects (limit 4) at " + currentUrl, { detail: location });
          }
          redirectsLeft -= 1;
          let nextUrl;
          try {
            nextUrl = new URL(location, currentUrl).toString();
          } catch (cause) {
            throw new NetworkError("bad redirect location: " + String(location).slice(0, 200), {
              detail: location,
              cause,
            });
          }
          // Strip credentials on cross-origin redirect (requests behavior).
          try {
            if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
              currentHeaders = Object.fromEntries(
                Object.entries(currentHeaders).filter(
                  ([k]) => !["authorization", "cookie", "proxy-authorization"].includes(k.toLowerCase()),
                ),
              );
            }
          } catch {
            /* origin compare best-effort; keep headers */
          }
          currentUrl = nextUrl;
          if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === "POST")) {
            currentMethod = "GET";
            currentBody = null;
            currentHeaders = Object.fromEntries(
              Object.entries(currentHeaders).filter(
                ([k]) => !["content-length", "content-type", "transfer-encoding"].includes(k.toLowerCase()),
              ),
            );
          }
          continue;
        }
      }

      if (statusLeft > 0 && totalLeft > 0 && retry.statusForcelist.includes(response.status)) {
        statusLeft -= 1;
        totalLeft -= 1;
        await sleep(retry.backoffFactor * 1000 * 2 ** (retry.total - totalLeft - 1));
        continue;
      }

      return response;
    }
    } finally {
      this._inflight = (this._inflight | 0) - 1;
    }
  }

  /** One raw attempt — transport errors only, no retry logic. */
  #once(method, url, headers, body, timeout, contentLength, maxBody = null, signal = null, token = null) {
    const maxBodyBytes = maxBody ?? DEFAULT_MAX_BODY;
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const isHttps = target.protocol === "https:";
      const mod = isHttps ? https : http;
      const reqOptions = {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        agent: isHttps ? this.#httpsAgent : this.#httpAgent,
      };

      let settled = false;
      let responseStarted = false;
      let connectTimer = null;
      const clearConnectTimer = () => {
        if (connectTimer !== null) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
      };

      let detachAbort = () => {};
      let detachToken = () => {};
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearConnectTimer();
        try {
          detachAbort();
        } catch {
          /* ignore */
        }
        try {
          detachToken();
        } catch {
          /* ignore */
        }
        try {
          cleanupSocket();
        } catch {
          /* ignore */
        }
        if (signal?.aborted || token?.cancelled === true || err instanceof CancelledError) {
          reject(err instanceof CancelledError ? err : new CancelledError("request aborted", { cause: err }));
          return;
        }
        reject(classifyNetworkError(err, responseStarted));
      };

      const req = mod.request(reqOptions, (res) => {
        responseStarted = true;
        clearConnectTimer();
        const chunks = [];
        let receivedBytes = 0;
        res.on("data", (chunk) => {
          receivedBytes += chunk.length;
          if (receivedBytes > maxBodyBytes) {
            fail(new NetworkError("response body exceeds cap (" + maxBodyBytes + " bytes)", {
              detail: maxBodyBytes,
            }));
            try {
              res.destroy();
            } catch {
              /* ignore */
            }
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          try {
            detachAbort();
          } catch {
            /* ignore */
          }
          try {
            detachToken();
          } catch {
            /* ignore */
          }
          try {
            cleanupSocket();
          } catch {
            /* ignore */
          }
          resolve(makeResponse(res, Buffer.concat(chunks)));
        });
        res.on("error", fail);
        res.on("close", () => {
          // Settle when the stream dies without end/error (premature close).
          if (!settled && !res.complete) {
            fail(new NetworkError("response closed without end", { detail: "res-close" }));
          }
        });
      });

      if (signal) {
        if (signal.aborted) {
          fail(new CancelledError("request aborted"));
        } else {
          const onAbort = () => {
            try {
              req.destroy(new Error("aborted"));
            } catch {
              /* ignore */
            }
          };
          detachAbort = () => {
            try {
              signal.removeEventListener("abort", onAbort);
            } catch {
              /* ignore */
            }
          };
          try {
            signal.addEventListener("abort", onAbort, { once: true });
          } catch {
            /* non-standard signal — polling in request() loop still applies */
          }
        }
      }
      if (token && typeof token.onCancel === "function") {
        if (token.cancelled === true) {
          fail(new CancelledError("request aborted"));
        } else {
          detachToken = token.onCancel(() => {
            try {
              req.destroy(new CancelledError("request aborted"));
            } catch {
              /* ignore */
            }
          });
        }
      }
      req.on("error", fail);
      req.on("close", () => {
        clearConnectTimer();
        try {
          cleanupSocket();
        } catch {
          /* ignore */
        }
        // Settle when the socket dies without response/error (hangs otherwise).
        if (!settled) {
          fail(new NetworkError("socket closed without response", {
            detail: "req-close",
            connectPhase: !responseStarted,
          }));
        }
      });
      // No Nagle delay for tiny JSON polls: saves up to ~40ms per poll (~1000 polls/job).
      try {
        req.setNoDelay(true);
      } catch {
        /* ignore on exotic transports */
      }

      // Timeout semantics: null = wait forever; else [connectS|null, readS|null].
      let socketCleanup = null;
      if (timeout !== null && timeout !== undefined) {
        const [connectS, readS] = timeout;
        if (connectS !== null && connectS !== undefined) {
          connectTimer = setTimeout(() => {
            req.destroy(new ConnectTimeoutError(`connect timeout ${connectS}s`));
          }, connectS * 1000);
        }
        if (readS !== null && readS !== undefined) {
          const onSocket = (socket) => {
            try {
              socket.setNoDelay(true);
            } catch {
              /* ignore on exotic transports */
            }
            const onTimeout = () => {
              req.destroy(new ReadTimeoutError(`read timeout ${readS}s`));
            };
            try {
              socket.setTimeout(readS * 1000, onTimeout);
            } catch {
              /* socket already gone */
            }
            socketCleanup = () => {
              try {
                socket.removeListener("timeout", onTimeout);
              } catch {
                /* ignore */
              }
              try {
                socket.setTimeout(0);
              } catch {
                /* ignore */
              }
            };
          };
          req.on("socket", onSocket);
        }
      }
      const cleanupSocket = () => {
        if (socketCleanup) {
          const fn = socketCleanup;
          socketCleanup = null;
          try {
            fn();
          } catch {
            /* ignore */
          }
        }
      };

      if (body !== null && body !== undefined) {
        const headerKeys = Object.keys(headers ?? {}).map((k) => k.toLowerCase());
        if (typeof body === "function") {
          // Disk-streaming upload: fresh Readable per attempt, length known upfront.
          if (!headerKeys.includes("content-length") && contentLength != null) {
            req.setHeader("Content-Length", contentLength);
          }
          const stream = body();
          const destroyStream = () => {
            try {
              if (stream && !stream.destroyed) stream.destroy();
            } catch {
              /* ignore */
            }
          };
          req.on("close", destroyStream);
          req.on("error", destroyStream);
          stream.on("error", (err) => {
            req.destroy(classifyNetworkError(err, responseStarted));
          });
          stream.on("data", (chunk) => {
            if (req.destroyed || req.writableEnded) return;
            if (!req.write(chunk)) {
              try {
                stream.pause();
              } catch {
                /* ignore */
              }
              req.once("drain", () => {
                try {
                  stream.resume();
                } catch {
                  /* ignore */
                }
              });
            }
          });
          stream.on("end", () => {
            try {
              req.end();
            } catch {
              /* ignore */
            }
          });
        } else {
          const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
          if (!headerKeys.includes("content-length")) {
            req.setHeader("Content-Length", payload.length);
          }
          req.write(payload);
          req.end();
        }
      } else {
        req.end();
      }
    });
  }

  get(url, opts = {}) {
    return this.request("GET", url, opts);
  }

  post(url, opts = {}) {
    return this.request("POST", url, opts);
  }

  put(url, opts = {}) {
    return this.request("PUT", url, opts);
  }

  close() {
    this.#httpsAgent.destroy();
    this.#httpAgent.destroy();
  }

  /** Close idle sockets only — safe while requests are in flight. */
  closeIdle() {
    try {
      this.#httpsAgent.closeIdleConnections?.();
    } catch {
      /* ignore */
    }
    try {
      this.#httpAgent.closeIdleConnections?.();
    } catch {
      /* ignore */
    }
  }
}

const DEFAULT_RETRY = Object.freeze({
  total: 2,
  connect: 2,
  read: 0, // never multiply long poll read timeouts
  status: 1,
  backoffFactor: 0.2,
  statusForcelist: [429, 500, 502, 503, 504],
});

let globalSession = null;

// Stale keep-alive sockets (server idle-close) cost 1 hangUp retry (~100-300ms).
// Recreate the pool if idle >25s (below 30s keepAliveMsecs), before the next job.
const SESSION_IDLE_MS = 25_000;

export function buildSession(poolSize = null) {
  return new Session(poolSize ?? PERF.POOL_SIZE);
}

export function getSession() {
  if (globalSession === null) {
    globalSession = buildSession();
    return globalSession;
  }
  // Only recycle REAL pools (injected test mocks lack agent state — never touch them).
  try {
    if (
      globalSession instanceof Session &&
      Date.now() - (globalSession._lastUse || 0) > SESSION_IDLE_MS
    ) {
      // Never destroy() under concurrency: in-flight sockets would die mid-request.
      if ((globalSession._inflight | 0) > 0) {
        try {
          globalSession.closeIdle();
        } catch {
          /* ignore */
        }
        return globalSession;
      }
      try {
        globalSession.close();
      } catch {
        /* ignore */
      }
      globalSession = buildSession();
    }
  } catch {
    /* never block on pool hygiene */
  }
  return globalSession;
}

/** Test hook — inject/restore the process-wide session. */
export function setSession(session) {
  const previous = globalSession;
  globalSession = session;
  return previous;
}
