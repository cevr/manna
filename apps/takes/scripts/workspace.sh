#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then
  echo "Takes: native macOS $1 skipped on $(uname -s)."
  exit 0
fi
case "$1" in
  build) exec ./scripts/build-app.sh ;;
  gate) exec ./scripts/gate.sh ;;
  test) exec ./scripts/test.sh ;;
  *) echo "Unknown Takes task: $1" >&2; exit 1 ;;
esac
