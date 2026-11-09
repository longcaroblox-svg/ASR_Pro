#!/usr/bin/env node
/** Verify the dist/ artifact end-to-end.
 *
 * Checks:
 *   1. every expected file exists, every JS file parses (`node --check`);
 *   2. zero unresolved relative imports, zero non-node externals;
 *   3. dist export surface is identical to src for all four entries;
 *   4. CLI --help and probe usage work through the bundled launchers;
 *   5. real GUI HTTP links work: /, /api/fs, /api/probe-file, /api/resolve-file,
 *      /api/media (200 + 206 Range), /api/srt, /api/upload, /api/start, /api/cancel, SSE;
 *   6. startup timing (src vs dist) is measured and reported.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildWav } from "../tests/fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = process.env.ASR_DIST_UNDER_TEST
  ? path.resolve(process.env.ASR_DIST_UNDER_TEST)
  : path.join(ROOT, "dist");
const NONCE = crypto.randomBytes(6).toString("hex");

const ENTRY_PAIRS = [
  ["src/index.js", "index.js"],
  ["src/cli.js", "cli.bundle.mjs"],
  ["src/gui.js", "gui.bundle.mjs"],
  ["src/model-probe.js", "model-probe.bundle.mjs"],
];

let passed = 0;
function pass(name, detail = "") {
  passed += 1;
  process.stdout.write(`  ✓ ${name}${detail ? ` — ${detail}` : ""}\n`);
}
function fail(name, exc) {
  process.stdout.write(`  ✗ ${name}\n    ${String(exc?.stack ?? exc).replaceAll("\n", "\n    ")}\n`);
  throw exc;
}
async function check(name, fn) {
  try {
    const detail = await fn();
    pass(name, typeof detail === "string" ? detail : "");
  } catch (exc) {
    fail(name, exc);
  }
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function listFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function elapsedMs(fn) {
  const t0 = process.hrtime.bigint();
  const value = fn();
  return [Number(process.hrtime.bigint() - t0) / 1e6, value];
}

async function exportSurface(specifier) {
  const mod = await import(specifier);
  return mod;
}

function structural(value) {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return `${type}:${JSON.stringify(value)}`;
  if (Array.isArray(value)) {
    try {
      return `array:${JSON.stringify(value)}`;
    } catch {
      return null;
    }
  }
  if (type === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    try {
      return `object:${JSON.stringify(value)}`;
    } catch {
      return null;
    }
  }
  return null;
}

function httpGet(origin, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, origin);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function httpPost(origin, pathname, { body = "", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, origin);
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: { "content-length": payload.length, ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

async function readFirstSseChunk(origin) {
  const controller = new AbortController();
  try {
    const res = await fetch(new URL("/events", origin), { signal: controller.signal });
    assert.equal(res.status, 200);
    const reader = res.body.getReader();
    const { value } = await reader.read();
    await reader.cancel().catch(() => {});
    return Buffer.from(value).toString("utf8");
  } finally {
    controller.abort();
  }
}

function startGuiChild(script, port, { timeoutMs = 15_000, cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd,
      env: {
        ...process.env,
        ASR_GUI_PORT: String(port),
        ASR_GUI_NO_OPEN: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let err = "";
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error(`GUI timeout after ${timeoutMs}ms\n${out}\n${err}`)),
      timeoutMs,
    );

    function finish(exc) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (exc) reject(exc);
      else resolve(child);
    }
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
      if (out.includes(`127.0.0.1:${port}`) || out.includes(`localhost:${port}`)) finish();
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString("utf8");
    });
    child.on("error", finish);
    child.on("exit", (code) => {
      if (!settled) finish(new Error(`GUI exited early (code ${code})\n${out}\n${err}`));
    });
  });
}

function stopGuiChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    try {
      child.kill("SIGKILL");
    } catch {
      resolve();
    }
    setTimeout(resolve, 2_000).unref?.();
  });
}

async function checkGuiReady(script, port, timeoutMs = 15_000, cwd = ROOT) {
  const child = await startGuiChild(script, port, { timeoutMs, cwd });
  child.stdout.destroy();
  child.stderr.destroy();
  await stopGuiChild(child);
}

function measureCli(script, runs = 7) {
  const samples = [];
  for (let i = 0; i < runs + 1; i++) {
    const [ms, result] = elapsedMs(() =>
      spawnSync(process.execPath, [script, "--help"], {
        cwd: ROOT,
        stdio: "ignore",
        timeout: 20_000,
        windowsHide: true,
      }),
    );
    assert.equal(result.status, 0, `${script} --help exited ${result.status}`);
    if (i > 0) samples.push(ms);
  }
  return median(samples);
}

async function measureGui(script, port) {
  const t0 = process.hrtime.bigint();
  await checkGuiReady(script, port);
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

function runDistE2E() {
  const testSource = fs.readFileSync(path.join(ROOT, "tests", "test-e2e-pipeline.mjs"), "utf8");
  const distIndexUrl = pathToFileURL(path.join(DIST, "index.js")).href;
  const fixturesUrl = pathToFileURL(path.join(ROOT, "tests", "fixtures.mjs")).href;
  let transformed = testSource;
  for (const specifier of [
    "../src/pipeline/orchestrator.js",
    "../src/core/domain.js",
    "../src/core/cancel.js",
    "../src/decode/http-pool.js",
  ]) {
    transformed = transformed.replaceAll(JSON.stringify(specifier), JSON.stringify(distIndexUrl));
  }
  transformed = transformed.replaceAll(JSON.stringify("./fixtures.mjs"), JSON.stringify(fixturesUrl));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-dist-e2e-"));
  const testFile = path.join(tempDir, "pipeline.test.mjs");
  fs.writeFileSync(testFile, transformed);
  try {
    const result = spawnSync(process.execPath, ["--test", testFile], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /(?:#|ℹ)\s*pass 4\b/);
    assert.match(result.stdout, /(?:#|ℹ)\s*fail 0\b/);
    return "4 pipeline tests (ORIGINAL + AUTO + NO-FALLBACK + byte fidelity)";
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
async function main() {
  process.stdout.write(`Verifying dist at ${DIST}\n`);
  assert.ok(fs.existsSync(DIST), "dist/ does not exist");

  // Pick the GUI port before importing the bundle (PORT is read at module load).
  const guiPort = 20000 + crypto.randomInt(0, 30000);
  process.env.ASR_GUI_PORT = String(guiPort);

  const required = [
    "index.js",
    "cli.bundle.mjs",
    "gui.bundle.mjs",
    "model-probe.bundle.mjs",
    "bin/asr-ultrax.js",
    "gui.js",
    "model-probe.js",
    "package.json",
    "BUILD.json",
    "README.md",
    "run.bat",
    "run.sh",
  ];
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "BUILD.json"), "utf8"));

  await check("required dist files + source maps exist", () => {
    for (const rel of required) assert.ok(fs.existsSync(path.join(DIST, rel)), `missing ${rel}`);
    for (const entry of manifest.entries) {
      assert.ok(fs.existsSync(path.join(DIST, `${entry.out}.map`)), `missing ${entry.out}.map`);
      assert.equal(sha256File(path.join(DIST, entry.out)), entry.sha256, `sha mismatch ${entry.out}`);
    }
    return `${required.length} files + ${manifest.entries.length} maps`;
  });

  await check("portable launchers present (Windows + POSIX)", () => {
    const bat = fs.readFileSync(path.join(DIST, "run.bat"), "utf8");
    const sh = fs.readFileSync(path.join(DIST, "run.sh"), "utf8");
    assert.match(bat, /node gui\.js/);
    assert.match(sh, /exec node gui\.js/);
    assert.match(sh, /ASR_GUI_PORT/);
    return "run.bat + run.sh";
  });

  await check("dist package manifest is self-contained", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(DIST, "package.json"), "utf8"));
    assert.equal(pkg.type, "module");
    assert.equal(pkg.main, "./index.js");
    assert.equal(pkg.bin["asr-ultrax"], "bin/asr-ultrax.js");
    assert.equal(pkg.exports["."], "./index.js");
    return `${pkg.name}@${pkg.version}`;
  });

  await check("all dist JS files parse (node --check)", () => {
    const files = listFiles(DIST).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
    for (const file of files) {
      const res = spawnSync(process.execPath, ["--check", file], {
        cwd: ROOT,
        stdio: "pipe",
        windowsHide: true,
      });
      assert.equal(
        res.status,
        0,
        `${path.relative(ROOT, file)}: ${res.stderr.toString("utf8")}`,
      );
    }
    return `${files.length} files`;
  });

  await check("zero unresolved links / zero third-party runtime deps", () => {
    for (const link of manifest.externalLinks) {
      assert.ok(link.startsWith("node:"), `non-builtin external: ${link}`);
    }
    for (const entry of manifest.entries) {
      const source = fs.readFileSync(path.join(DIST, entry.out), "utf8");
      const relative = source.match(
        /(?:^|[;}\s])(?:import|export)\s*(?:[^"'`]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+)["']/,
      );
      assert.equal(relative, null, `unbundled relative link in ${entry.out}: ${relative?.[1]}`);
    }
    return `${manifest.externalLinks.length} node: builtins only`;
  });

  const surfaces = new Map();
  await check("dist export surface matches src for all entries", async () => {
    let total = 0;
    for (const [srcRel, distRel] of ENTRY_PAIRS) {
      const srcUrl = `${pathToFileURL(path.join(ROOT, srcRel)).href}?verify=${NONCE}`;
      const distUrl = `${pathToFileURL(path.join(DIST, distRel)).href}?verify=${NONCE}`;
      const src = await exportSurface(srcUrl);
      const dist = await exportSurface(distUrl);
      surfaces.set(distRel, { src, dist });
      assert.deepEqual(Object.keys(dist).sort(), Object.keys(src).sort(), `${distRel} exports differ`);
      for (const key of Object.keys(src)) {
        assert.equal(typeof dist[key], typeof src[key], `${distRel}#${key} type differs`);
        const a = structural(src[key]);
        const b = structural(dist[key]);
        if (a !== null) assert.equal(b, a, `${distRel}#${key} value differs`);
      }
      total += Object.keys(src).length;
    }
    return `${total} exports identical`;
  });

  await check("CLI launcher --help (bundled)", () => {
    const res = spawnSync(process.execPath, [path.join(DIST, "bin", "asr-ultrax.js"), "--help"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 20_000,
      windowsHide: true,
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /ASR Studio UltraX/);
    assert.match(res.stdout, /--speed <0\.5\.\.1\.5>/);
    return `${res.stdout.length} chars`;
  });

  await check("probe launcher usage (bundled)", () => {
    const res = spawnSync(process.execPath, [path.join(DIST, "model-probe.js")], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 20_000,
      windowsHide: true,
    });
    assert.equal(res.status, 2, res.stderr);
    assert.match(res.stderr, /Usage: node src\/model-probe\.js/);
    return "exit 2 + usage";
  });

  const guiModule = surfaces.get("gui.bundle.mjs").dist;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "asr-dist-verify-"));
  const wavPath = path.join(temp, "sample.wav");
  const srtPath = path.join(temp, "sample.srt");
  const txtPath = path.join(temp, "notes.txt");
  const wavBuf = buildWav({ seconds: 1, sampleRate: 8000 });
  fs.writeFileSync(wavPath, wavBuf);
  fs.writeFileSync(srtPath, "1\n00:00:00,000 --> 00:00:01,000\nxin chào\n");
  fs.writeFileSync(txtPath, "not media");
  let server;

  try {
    await check("GUI server listens and / renders all links", async () => {
      server = await guiModule.startGui({ openBrowser: false });
      const res = await httpGet(`http://127.0.0.1:${guiPort}`, "/");
      assert.equal(res.status, 200);
      const html = res.body.toString("utf8");
      for (const marker of ["ASR Studio UltraX", "/api/start", "/api/upload", "/api/media", "EventSource"]) {
        assert.ok(html.includes(marker), `HTML missing ${marker}`);
      }
      return `${html.length} bytes`;
    });

    await check("GET /api/fs lists media links", async () => {
      const res = await httpGet(`http://127.0.0.1:${guiPort}`, `/api/fs?path=${encodeURIComponent(temp)}`);
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body.toString("utf8"));
      assert.ok(data.entries.some((e) => e.name === "sample.wav"), "sample.wav missing");
      assert.ok(!data.entries.some((e) => e.name === "notes.txt"), "non-media leaked");
      return `${data.entries.length} entries`;
    });

    await check("GET /api/probe-file reads real duration", async () => {
      const res = await httpGet(
        `http://127.0.0.1:${guiPort}`,
        `/api/probe-file?path=${encodeURIComponent(wavPath)}`,
      );
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body.toString("utf8"));
      assert.ok(data.durationS > 0.9 && data.durationS < 1.1, `durationS=${data.durationS}`);
      return `durationS=${data.durationS}`;
    });

    await check("GET /api/resolve-file resolves name+size", async () => {
      const res = await httpGet(
        `http://127.0.0.1:${guiPort}`,
        `/api/resolve-file?name=sample.wav&size=${wavBuf.length}`,
      );
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body.toString("utf8"));
      assert.equal(data.found, true);
      assert.equal(path.resolve(data.path), path.resolve(wavPath));
      return data.path;
    });

    await check("GET /api/media full 200 + Range 206", async () => {
      const full = await httpGet(
        `http://127.0.0.1:${guiPort}`,
        `/api/media?path=${encodeURIComponent(wavPath)}`,
      );
      assert.equal(full.status, 200);
      assert.equal(Number(full.headers["content-length"]), wavBuf.length);
      assert.equal(full.headers["accept-ranges"], "bytes");

      const ranged = await httpGet(
        `http://127.0.0.1:${guiPort}`,
        `/api/media?path=${encodeURIComponent(wavPath)}`,
        { range: "bytes=0-99" },
      );
      assert.equal(ranged.status, 206);
      assert.equal(ranged.body.length, 100);
      assert.match(String(ranged.headers["content-range"]), /^bytes 0-99\/\d+$/);
      return `${wavBuf.length} bytes, range 0-99`;
    });

    await check("GET /api/media rejects non-media extension", async () => {
      const res = await httpGet(
        `http://127.0.0.1:${guiPort}`,
        `/api/media?path=${encodeURIComponent(txtPath)}`,
      );
      assert.equal(res.status, 403);
      return "403 as designed";
    });

    await check("GET /api/srt inline + download", async () => {
      const inline = await httpGet(
        `http://127.0.0.1:${guiPort}`,
        `/api/srt?path=${encodeURIComponent(srtPath)}`,
      );
      assert.equal(inline.status, 200);
      assert.match(inline.body.toString("utf8"), /xin chào/);

      const download = await httpGet(
        `http://127.0.0.1:${guiPort}`,
        `/api/srt?path=${encodeURIComponent(srtPath)}&download=1`,
      );
      assert.equal(download.status, 200);
      assert.match(String(download.headers["content-disposition"]), /attachment/);
      return "inline + attachment";
    });

    await check("POST /api/upload stages a real media file", async () => {
      const res = await httpPost(
        `http://127.0.0.1:${guiPort}`,
        "/api/upload?name=upload.wav",
        { body: wavBuf, headers: { "content-type": "application/octet-stream" } },
      );
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body.toString("utf8"));
      assert.equal(data.ok, true);
      assert.ok(fs.existsSync(data.path), "staged file missing");
      assert.ok(data.durationS > 0.9 && data.durationS < 1.1);
      return data.name;
    });

    await check("POST /api/start validates JSON + /api/cancel link", async () => {
      const bad = await httpPost(`http://127.0.0.1:${guiPort}`, "/api/start", {
        body: "not-json",
        headers: { "content-type": "application/json" },
      });
      assert.equal(bad.status, 400);

      const cancel = await httpPost(`http://127.0.0.1:${guiPort}`, "/api/cancel");
      assert.equal(cancel.status, 200);
      assert.deepEqual(JSON.parse(cancel.body.toString("utf8")), { ok: true });
      return "400 + cancel ok";
    });

    await check("SSE /events link streams", async () => {
      const first = await readFirstSseChunk(`http://127.0.0.1:${guiPort}`);
      assert.match(first, /: connected/);
      return "connected";
    });

    await check("unknown route returns JSON 404", async () => {
      const res = await httpGet(`http://127.0.0.1:${guiPort}`, "/api/nope");
      assert.equal(res.status, 404);
      return "404";
    });
  } finally {
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }

  await check("dist is relocatable — copy outside repo keeps 100% of links", async () => {    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "asr-dist-copy-"));
    const copyPort = guiPort + 3;
    let guiChild;
    try {
      fs.cpSync(DIST, copy, { recursive: true });

      const cli = spawnSync(process.execPath, [path.join(copy, "bin", "asr-ultrax.js"), "--help"], {
        cwd: copy,
        encoding: "utf8",
        timeout: 20_000,
        windowsHide: true,
      });
      assert.equal(cli.status, 0, cli.stderr);
      assert.match(cli.stdout, /ASR Studio UltraX/);

      const indexUrl = pathToFileURL(path.join(copy, "index.js")).href;
      const probe = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import(${JSON.stringify(indexUrl)}).then((m) => { if (!m.CloudPipeline || !m.renderSrt) process.exit(3); process.stdout.write(m.VERSION); })`,
        ],
        { cwd: copy, encoding: "utf8", timeout: 20_000, windowsHide: true },
      );
      assert.equal(probe.status, 0, probe.stderr);
      assert.equal(probe.stdout, manifest.version);

      guiChild = await startGuiChild(path.join(copy, "gui.js"), copyPort, { cwd: copy });
      const res = await httpGet(`http://127.0.0.1:${copyPort}`, "/");
      assert.equal(res.status, 200);
      assert.ok(res.body.toString("utf8").includes("ASR Studio UltraX"));
      return `copied to ${path.basename(copy)} · CLI + library + GUI OK`;
    } finally {
      await stopGuiChild(guiChild);
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });

  await check("full pipeline E2E runs on dist bundle (real audio + mock cloud)", () =>
    runDistE2E(),
  );

  await check("Unicode/space install path runs (no node_modules)", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "asr-dist-unicode-"));
    const stage = path.join(base, "stage");
    const installDir = path.join(base, "ASR Máy Khác 中文");
    const unicodePort = guiPort + 4;
    let guiChild;
    try {
      fs.cpSync(DIST, stage, { recursive: true });
      fs.renameSync(stage, installDir);

      const cli = spawnSync(
        process.execPath,
        [path.join(installDir, "bin", "asr-ultrax.js"), "--help"],
        { cwd: installDir, encoding: "utf8", timeout: 20_000, windowsHide: true },
      );
      assert.equal(cli.status, 0, cli.stderr);
      assert.match(cli.stdout, /ASR Studio UltraX/);

      const lib = await import(pathToFileURL(path.join(installDir, "index.js")).href);
      assert.equal(lib.VERSION, manifest.version);
      assert.ok(Object.keys(lib).length >= 70);

      guiChild = await startGuiChild(path.join(installDir, "gui.js"), unicodePort, {
        cwd: installDir,
      });
      const res = await httpGet(`http://127.0.0.1:${unicodePort}`, "/");
      assert.equal(res.status, 200);
      assert.ok(res.body.toString("utf8").includes("ASR Studio UltraX"));
      return `${path.basename(installDir)} · CLI + ${Object.keys(lib).length} exports + GUI OK`;
    } finally {
      await stopGuiChild(guiChild);
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  await check("startup timing src vs dist", async () => {
    const srcCli = measureCli("bin/asr-ultrax.js");
    const distCli = measureCli("dist/bin/asr-ultrax.js");

    const guiSrcPort = guiPort + 1;
    const guiDistPort = guiPort + 2;
    const srcGui = await measureGui("src/gui.js", guiSrcPort);
    const distGui = await measureGui("dist/gui.js", guiDistPort);

    process.stdout.write(
      `    CLI  src ${srcCli.toFixed(0)} ms → dist ${distCli.toFixed(0)} ms` +
        `  (${(srcCli / distCli).toFixed(2)}× faster)\n`,
    );
    process.stdout.write(
      `    GUI  src ${srcGui.toFixed(0)} ms → dist ${distGui.toFixed(0)} ms` +
        `  (${(srcGui / distGui).toFixed(2)}× faster)\n`,
    );
    assert.ok(distCli < 5_000, "dist CLI startup absurdly slow");
    assert.ok(distGui < 5_000, "dist GUI startup absurdly slow");
    return `CLI ${distCli.toFixed(0)} ms · GUI ${distGui.toFixed(0)} ms`;
  });

  process.stdout.write(`\nDIST VERIFY OK — ${passed} checks passed.\n`);
}

main().catch((exc) => {
  process.stderr.write(`\nDIST VERIFY FAILED: ${exc?.stack ?? String(exc)}\n`);
  process.exitCode = 1;
});
