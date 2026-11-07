// swift-tools-version: 5.9

// The voice: on-device speech of a verse over AVSpeechSynthesizer, with its
// spoken word ranges. One's prebuild makes this directory a local pod
// (`OneSwiftPackages/voice`) that imports One, and the native bundle turns
// an import of `Voice.swift` into calls to the module it declares.

import PackageDescription

let package = Package(
  name: "voice",
  platforms: [.iOS("18.0")],
  targets: [.target(name: "voice", path: ".", exclude: ["Package.swift"])]
)
