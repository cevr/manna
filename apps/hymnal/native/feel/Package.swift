// swift-tools-version: 5.9

// The voice: the app's short code-made sounds, played through iOS System
// Sound Services. One's prebuild makes this directory a local pod
// (`OneSwiftPackages/feel`) that imports One, and the native bundle turns an
// import of `Voice.swift` into calls to the module it declares.

import PackageDescription

let package = Package(
  name: "feel",
  platforms: [.iOS(.v17)],
  targets: [.target(name: "feel", path: ".", exclude: ["Package.swift"])]
)
