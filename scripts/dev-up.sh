#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GANACHE_PID=""
MIGRATE_RESET=false

if [[ "${1:-}" == "--reset" ]]; then
  MIGRATE_RESET=true
fi

cleanup() {
  if [[ -n "$GANACHE_PID" ]]; then
    echo "Stopping Ganache (PID: $GANACHE_PID)..."
    kill "$GANACHE_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

is_ganache_running() {
  curl -sS --max-time 1 \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    http://127.0.0.1:7545 >/dev/null 2>&1
}

if is_ganache_running; then
  echo "Ganache already running on http://127.0.0.1:7545"
else
  echo "Starting Ganache..."
  ./start-ganache.sh >/tmp/voting-ganache.log 2>&1 &
  GANACHE_PID=$!

  for _ in {1..20}; do
    if is_ganache_running; then
      echo "Ganache started."
      break
    fi
    sleep 1
  done

  if ! is_ganache_running; then
    echo "Ganache failed to start. Check /tmp/voting-ganache.log"
    exit 1
  fi
fi

echo "Running Truffle migrate..."
if [[ "$MIGRATE_RESET" == "true" ]]; then
  npx truffle migrate --config truffle-config.cjs --reset --network development
else
  npx truffle migrate --config truffle-config.cjs --network development
fi

echo "Starting backend + frontend..."
npm run start:all
