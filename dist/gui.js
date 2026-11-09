#!/usr/bin/env node
/** Generated fast launcher — bundled runtime + V8 compile cache. Do not edit. */
import * as nodeModule from "node:module";

try {
  nodeModule.enableCompileCache?.();
} catch {
  /* compile cache is only an optimization — never fatal */
}

const { main } = await import("./gui.bundle.mjs");

try {
  await main();
} catch (exc) {
  process.stderr.write(`\nFatal: ${exc?.stack ?? String(exc)}\n`);
  process.exitCode = 1;
}
