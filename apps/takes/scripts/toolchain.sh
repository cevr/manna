# Source from zsh build scripts. SwiftPM's native builder also works without full Xcode.
# Warnings are errors per target (Package.swift's treatAllWarnings), never through -Xswiftc:
# that flag reaches FluidAudio too, which compiles with warnings.
TAKES_SWIFT_ARGS=(--build-system native -j "${TAKES_JOBS:-6}")
if [[ "$(xcode-select -p)" == /Library/Developer/CommandLineTools && -d /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk ]]; then
    TAKES_SWIFT_ARGS+=(--sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk)
fi
TAKES_TEST_ARGS=()
if [[ "$(xcode-select -p)" == /Library/Developer/CommandLineTools ]]; then
    TAKES_TEST_FRAMEWORKS=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
    TAKES_TEST_ARGS+=(-Xswiftc -F -Xswiftc "$TAKES_TEST_FRAMEWORKS"
        -Xswiftc -load-plugin-library -Xswiftc /Library/Developer/CommandLineTools/usr/lib/swift/host/plugins/testing/libTestingMacros.dylib
        -Xlinker -F -Xlinker "$TAKES_TEST_FRAMEWORKS" -Xlinker -rpath -Xlinker "$TAKES_TEST_FRAMEWORKS")
fi
TAKES_DEBUG_ARGS=("${TAKES_SWIFT_ARGS[@]}" "${TAKES_TEST_ARGS[@]}")
