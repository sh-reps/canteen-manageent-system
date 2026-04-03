#!/usr/bin/env bash
set -euo pipefail

exec python -m uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-10000}"
