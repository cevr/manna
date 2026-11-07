// swift-tools-version: 5.9

// Dictation: a verse heard through the device's on-device recognizers
// (SpeechAnalyzer, then SFSpeechRecognizer), each word with its time, or
// replayed from a script. One's prebuild makes this directory a local pod
// (`OneSwiftPackages/dictation`) that imports One, and the native bundle
// turns an import of `Dictation.swift` into calls to the module it declares.

import PackageDescription

let package = Package(
  name: "dictation",
  platforms: [.iOS("18.0")],
  targets: [.target(name: "dictation", path: ".", exclude: ["Package.swift"])]
)
