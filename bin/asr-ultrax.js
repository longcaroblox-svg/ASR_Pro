#!/usr/bin/env node
/** CLI entry — ASR Studio UltraX (NodeJS). */

import { main } from "../src/cli.js";

main().then((code) => process.exit(code));
