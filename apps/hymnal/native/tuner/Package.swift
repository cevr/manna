// swift-tools-version: 5.9

// The tuner's ear: the microphone's input as frames of samples, read through
// AVAudioEngine. One's prebuild makes this directory a local pod
// (`OneSwiftPackages/tuner`) that imports One, and the native bundle turns an
// import of `Listen.swift` into calls to the module it declares.

import PackageDescription

let package = Package(
  name: "tuner",
  platforms: [.iOS(.v17)],
  targets: [.target(name: "tuner", path: ".", exclude: ["Package.swift"])]
)
