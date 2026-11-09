#!/usr/bin/env node
/** Production build → dist/.
 *
 * Goal: extreme cold/warm startup with 100% of the runtime links resolved.
 * - Bundles every entry into ONE ESM file (no runtime module graph to resolve).
 * - Keeps Node builtins external (zero third-party runtime dependency).
 * - Minifies + keeps names + emits linked source maps.
 * - Generates tiny launchers that enable Node's V8 compile cache.
 * - Writes a self-contained dist/package.json (bin + exports).
 * - Verifies the artifact (links, export parity, GUI endpoints, CLI) by default.
 *
 * Usage:
 *   node scripts/build-dist.mjs            # build + verify
 *   node scripts/build-dist.mjs --no-verify
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const NO_VERIFY = process.argv.includes("--no-verify");

const ENTRIES = [
  { entry: "src/index.js", out: "index.js", label: "library" },
  { entry: "src/cli.js", out: "cli.bundle.mjs", label: "cli" },
  { entry: "src/gui.js", out: "gui.bundle.mjs", label: "gui" },
  { entry: "src/model-probe.js", out: "model-probe.bundle.mjs", label: "probe" },
];

const ESBUILD_OPTIONS = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node18"],
  minify: true,
  keepNames: true,
  treeShaking: true,
  charset: "utf8",
  legalComments: "none",
  sourcemap: "linked",
  sourcesContent: true,
  metafile: true,
  logLevel: "silent",
  absWorkingDir: ROOT,
};

function log(message) {
  process.stdout.write(`${message}\n`);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function write(relPath, content) {
  const full = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

function fastLauncher({ bundle, relativeBundle, exitStyle = "exit" }) {
  const importSpecifier = JSON.stringify(relativeBundle);
  const tail =
    exitStyle === "exit"
      ? `  const code = await main();
  process.exit(Number.isInteger(code) ? code : 0);`
      : `  await main();`;
  return `#!/usr/bin/env node
/** Generated fast launcher — bundled runtime + V8 compile cache. Do not edit. */
import * as nodeModule from "node:module";

try {
  nodeModule.enableCompileCache?.();
} catch {
  /* compile cache is only an optimization — never fatal */
}

const { main } = await import(${importSpecifier});

try {
${tail}
} catch (exc) {
  process.stderr.write(\`\\nFatal: \${exc?.stack ?? String(exc)}\\n\`);
  process.exitCode = 1;
}
`;
}

function writePackageJson(entrySummary) {
  const pkg = {
    name: PKG.name,
    version: PKG.version,
    description: PKG.description,
    type: "module",
    engines: PKG.engines,
    main: "./index.js",
    exports: {
      ".": "./index.js",
      "./cli": "./cli.bundle.mjs",
      "./gui": "./gui.bundle.mjs",
      "./probe": "./model-probe.bundle.mjs",
      "./package.json": "./package.json",
    },
    bin: {
      "asr-ultrax": "bin/asr-ultrax.js",
    },
    files: [
      "bin/",
      "*.js",
      "*.mjs",
      "*.map",
      "BUILD.json",
      "README.md",
      "run.bat",
      "run.sh",
    ],
    scripts: {
      start: "node gui.js",
      cli: "node bin/asr-ultrax.js",
      probe: "node model-probe.js",
    },
    keywords: PKG.keywords,
    license: PKG.license,
    build: entrySummary,
  };
  write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
}

function writeDistRunBat() {
  const bat = `@echo off
setlocal EnableExtensions
title ASR Studio UltraX (dist)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Install Node.js 22.2 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

if not "%~1"=="" set "ASR_GUI_PORT=%~1"
set "PORT=%ASR_GUI_PORT%"
if not defined PORT set "PORT=8760"

where curl >nul 2>nul
if not errorlevel 1 (
  curl -s -o nul --max-time 2 "http://127.0.0.1:%PORT%/" >nul 2>nul
  if not errorlevel 1 (
    echo ASR Studio UltraX is already running at http://127.0.0.1:%PORT%
    start "" "http://127.0.0.1:%PORT%"
    exit /b 0
  )
)

echo Starting ASR Studio UltraX (dist) on http://127.0.0.1:%PORT% ...
echo Press Ctrl+C to stop.
echo.
node gui.js
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
  echo.
  echo [ERROR] App exited with code %CODE%.
  pause
)
exit /b %CODE%
`;
  write("run.bat", bat);
}

function writeDistRunSh() {
  const sh = `#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found in PATH. Install Node.js 22.2 or newer." >&2
  exit 1
fi

PORT="\${ASR_GUI_PORT:-8760}"
export ASR_GUI_PORT="$PORT"
printf 'Starting ASR Studio UltraX (dist) on http://127.0.0.1:%s ...\\n' "$PORT"
exec node gui.js
`;
  write("run.sh", sh);
}

function assertNoUnresolvedLinks(metafiles) {  const allowed = new Set();
  let externalCount = 0;
  for (const [outName, meta] of Object.entries(metafiles)) {
    if (!outName.endsWith(".js") && !outName.endsWith(".mjs")) continue;
    for (const imp of meta.imports ?? []) {
      if (!imp.external) {
        throw new Error(`${outName} still has a non-bundled relative import: ${imp.path}`);
      }
      if (!imp.path.startsWith("node:")) {
        throw new Error(`${outName} has a non-builtin external dependency: ${imp.path}`);
      }
      allowed.add(imp.path);
      externalCount += 1;
    }
  }
  return { allowed: [...allowed].sort(), externalCount };
}

async function main() {
  log(`ASR Studio UltraX build → dist/  (v${PKG.version})`);

  const esbuild = await import("esbuild").catch(() => null);
  if (!esbuild) {
    throw new Error(
      "esbuild is required to build dist/. Run: npm install --save-dev esbuild",
    );
  }

  fs.rmSync(DIST, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  fs.mkdirSync(DIST, { recursive: true });

  const metafiles = {};
  const summaries = [];
  let totalBytes = 0;

  for (const spec of ENTRIES) {
    const outfile = path.join(DIST, spec.out);
    const result = await esbuild.build({
      ...ESBUILD_OPTIONS,
      entryPoints: [path.join(ROOT, spec.entry)],
      outfile,
    });
    const bundle = fs.readFileSync(outfile);
    const mapPath = `${outfile}.map`;
    const map = fs.readFileSync(mapPath);
    const outputKey = path.relative(ROOT, outfile).replaceAll("\\", "/");
    const metafile = result.metafile;
    metafiles[outputKey] = metafile.outputs[outputKey];
    totalBytes += bundle.length + map.length;
    summaries.push({
      label: spec.label,
      entry: spec.entry,
      out: spec.out,
      bytes: bundle.length,
      mapBytes: map.length,
      sha256: sha256(bundle),
      inputs: Object.keys(metafile.inputs).length,
    });
    log(
      `  ✓ ${spec.entry} → dist/${spec.out}  ` +
        `${(bundle.length / 1024).toFixed(1)} KiB  ` +
        `(${Object.keys(metafile.inputs).length} modules bundled)`,
    );
  }

  const links = assertNoUnresolvedLinks(metafiles);
  log(`  ✓ links: 0 unresolved local imports · ${links.allowed.length} node: externals`);

  write("bin/asr-ultrax.js", fastLauncher({ relativeBundle: "../cli.bundle.mjs" }));
  write("gui.js", fastLauncher({ relativeBundle: "./gui.bundle.mjs", exitStyle: "keep" }));
  write("model-probe.js", fastLauncher({ relativeBundle: "./model-probe.bundle.mjs" }));
  writePackageJson(summaries);
  fs.copyFileSync(path.join(ROOT, "README.md"), path.join(DIST, "README.md"));
  writeDistRunBat();
  writeDistRunSh();

  const manifest = {
    name: PKG.name,
    version: PKG.version,
    builtAt: new Date().toISOString(),
    node: process.version,
    target: ESBUILD_OPTIONS.target,
    bundleBytes: totalBytes,
    entries: summaries,
    externalLinks: links.allowed,
    launch: {
      cli: "node dist/bin/asr-ultrax.js",
      gui: "node dist/gui.js",
      probe: "node dist/model-probe.js",
      library: "import * as ultrax from './dist/index.js'",
    },
    notes: [
      "All relative module links are resolved at build time.",
      "Only node: builtins remain external — zero third-party runtime deps.",
      "Launchers enable the Node V8 compile cache for faster warm starts.",
    ],
  };
  write("BUILD.json", `${JSON.stringify(manifest, null, 2)}\n`);

  log(
    `  ✓ dist ready: ${summaries.reduce((n, s) => n + s.inputs, 0)} modules bundled, ` +
      `${(totalBytes / 1024).toFixed(1)} KiB total (js + maps)`,
  );

  if (NO_VERIFY) {
    log("  · verification skipped (--no-verify)");
    return;
  }

  log("");
  log("Verifying dist artifact…");
  const verifier = path.join(ROOT, "scripts", "verify-dist.mjs");
  const check = spawnSync(process.execPath, [verifier], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ASR_DIST_UNDER_TEST: DIST },
    windowsHide: true,
  });
  if (check.status !== 0) {
    process.exitCode = check.status ?? 1;
    return;
  }

  log("");
  log("BUILD OK — dist/ is complete, self-contained and verified.");
}

main().catch((exc) => {
  process.stderr.write(`\nBUILD FAILED: ${exc?.stack ?? String(exc)}\n`);
  process.exitCode = 1;
});
