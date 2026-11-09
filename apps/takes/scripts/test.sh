#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift test "${TAKES_DEBUG_ARGS[@]}"
