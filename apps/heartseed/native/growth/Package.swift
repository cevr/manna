// swift-tools-version: 5.9

// The growth sound: one short code-made sound, played through iOS System
// Sound Services, which the ring/silent switch mutes. One's prebuild makes
// this directory a local pod (`OneSwiftPackages/growth`) that imports One,
// and the native bundle turns an import of `Growth.swift` into calls to the
// module it declares.

import PackageDescription

let package = Package(
  name: "growth",
  platforms: [.iOS(.v17)],
  targets: [.target(name: "growth", path: ".", exclude: ["Package.swift"])]
)
