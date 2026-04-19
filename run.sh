#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-${PORT:-5000}}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"

npm ci
npm run build

nohup npm run start -- -p "${PORT}" -H "${HOSTNAME}" > app.log 2>&1 &
echo $! > app.pid
echo "started: http://110.40.153.38:${PORT}"
