#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift build "${TAKES_DEBUG_ARGS[@]}" --build-tests
