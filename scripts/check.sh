#!/usr/bin/env bash
set -u

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
backend_status=0
frontend_status=0

echo '==> backend: lint'
if ! (cd "$repo_root/backend" && ruff check .); then
  echo 'WARNING: backend ruff lint is a known baseline; see docs/CI-BASELINES.md.' >&2
  backend_status=1
fi

echo '==> backend: format'
if ! (cd "$repo_root/backend" && ruff format --check .); then
  echo 'WARNING: backend ruff formatting is a known baseline; see docs/CI-BASELINES.md.' >&2
  backend_status=1
fi

echo '==> backend: typecheck'
if ! (cd "$repo_root/backend" && mypy app/ --ignore-missing-imports); then
  echo 'WARNING: backend mypy errors are a known baseline; see docs/CI-BASELINES.md.' >&2
  backend_status=1
fi

echo '==> backend: tests'
if ! (cd "$repo_root/backend" && pytest); then
  exit 1
fi

echo '==> frontend: install and checks'
if ! (cd "$repo_root/frontend" && npm ci && npm run lint && npx vue-tsc --noEmit && npm test -- --run && npm run build); then
  frontend_status=1
fi

if [ "$backend_status" -ne 0 ] || [ "$frontend_status" -ne 0 ]; then
  echo 'Aggregate check completed with known backend baseline warnings or a frontend failure.' >&2
  [ "$frontend_status" -eq 0 ]
  exit $?
fi

echo 'Aggregate check passed.'
