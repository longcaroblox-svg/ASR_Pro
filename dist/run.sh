#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found in PATH. Install Node.js 22.2 or newer." >&2
  exit 1
fi

PORT="${ASR_GUI_PORT:-8760}"
export ASR_GUI_PORT="$PORT"
printf 'Starting ASR Studio UltraX (dist) on http://127.0.0.1:%s ...\n' "$PORT"
exec node gui.js
