// swift-tools-version: 6.2
import PackageDescription

let strict: [SwiftSetting] = [.treatAllWarnings(as: .error)]

let package = Package(
  name: "Takes", platforms: [.macOS(.v26)],
  products: [.executable(name: "Takes", targets: ["TakesApp"])],
  dependencies: [
    .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.18.3", traits: [])
  ],
  targets: [
    .target(name: "TakesCore", swiftSettings: strict),
    .target(name: "TakesAudio", dependencies: ["TakesCore"], swiftSettings: strict),
    .target(
      name: "TakesTranscribe",
      dependencies: ["TakesCore", .product(name: "FluidAudio", package: "FluidAudio")],
      swiftSettings: strict),
    .executableTarget(
      name: "TakesApp", dependencies: ["TakesCore", "TakesAudio", "TakesTranscribe"],
      swiftSettings: strict + [.defaultIsolation(MainActor.self)]),
    .testTarget(
      name: "TakesTests", dependencies: ["TakesCore", "TakesAudio", "TakesTranscribe"],
      resources: [.copy("Fixtures")], swiftSettings: strict),
  ]
)
