#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift build "${TAKES_SWIFT_ARGS[@]}" -c release --product Takes
TAKES_BIN_DIR=$(swift build "${TAKES_SWIFT_ARGS[@]}" -c release --show-bin-path)
TAKES_APP="$PWD/dist/Takes.app"
mkdir -p "$TAKES_APP/Contents/MacOS" "$TAKES_APP/Contents/Resources"
cp "$TAKES_BIN_DIR/Takes" "$TAKES_APP/Contents/MacOS/Takes"
for TAKES_RESOURCE in "$TAKES_BIN_DIR"/*.bundle(N); do
    cp -R "$TAKES_RESOURCE" "$TAKES_APP/Contents/Resources/"
done
cp Support/Info.plist "$TAKES_APP/Contents/Info.plist"
codesign --force --deep --sign - "$TAKES_APP"
echo "Built $TAKES_APP"
