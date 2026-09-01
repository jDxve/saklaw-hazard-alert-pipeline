#!/usr/bin/env bash
# Everything CI will check, run before you hand the work over. The steps and
# their order are the ones in .github/workflows/ci.yml — if this passes and CI
# does not, that is a bug in one of the two files.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> lint"
npm run lint

echo "==> typecheck"
npm run typecheck

echo "==> test"
npm test

echo "==> build"
npm run build
