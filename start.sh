#!/usr/bin/env bash
# Surrogate Manager 起動（Mac / Linux・ブラウザ版）。Ctrl+C で停止
set -e
cd "$(dirname "$0")"
[ -d backend/.venv ] || (cd backend && uv sync)
[ -d frontend/node_modules ] || (cd frontend && npm install)
(cd backend && uv run uvicorn api.main:app --app-dir . --host 127.0.0.1 --port 8000) &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT
until curl -s -o /dev/null http://127.0.0.1:8000/health; do sleep 1; done
(sleep 3 && (open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173)) &
cd frontend && npm run dev
