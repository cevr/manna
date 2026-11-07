// swift-tools-version: 5.9

// The natural voice: Kokoro-82M's seven-stage Core ML chain, vendored from
// FluidAudio into `kokoro/`, downloaded once, checked and run on the
// device. One's prebuild makes this directory a local pod
// (`OneSwiftPackages/natural`) that imports One, and the native bundle turns
// an import of `Natural.swift` into calls to the module it declares.

import PackageDescription

let package = Package(
  name: "natural",
  platforms: [.iOS("18.0")],
  targets: [
    .target(
      name: "natural", path: ".",
      exclude: ["Package.swift", "kokoro/LICENSE", "kokoro/README.md"])
  ]
)
