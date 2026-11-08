@preconcurrency import CoreML
import Foundation

/// Where each stage of the chain runs, by where the app runs.
///
/// The simulator has no Neural Engine, and the CPU is the one path it runs
/// the same everywhere, so every stage there is `.cpuOnly`. On a device the
/// five stages before the noise and the tail go to the Neural Engine; the
/// noise and the tail go to the GPU, or to the CPU from OS 27, where the GPU
/// path mis-executes (FluidAudio #667 and #843, its `defaultUnits`).
enum NaturalRouting: String {
  case cpuOnly
  case aneTailGpu
  case aneTailCpu

  static var current: NaturalRouting {
    #if targetEnvironment(simulator)
      return .cpuOnly
    #else
      return ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 27 ? .aneTailCpu : .aneTailGpu
    #endif
  }

  func units(_ stage: KokoroAneStage) -> MLComputeUnits {
    let tail = stage == .noise || stage == .tail
    switch self {
    case .cpuOnly: return .cpuOnly
    case .aneTailGpu: return tail ? .cpuAndGPU : .cpuAndNeuralEngine
    case .aneTailCpu: return tail ? .cpuOnly : .cpuAndNeuralEngine
    }
  }
}

/// The seven compiled stages, loaded from one folder with the routing's
/// compute units; Heartseed's stand-in for FluidAudio's model store, which
/// downloads from its own repository and so is not vendored.
public actor KokoroAneModelStore {
  private var models: [KokoroAneStage: MLModel] = [:]

  public init() {}

  /// Loads every stage from `directory`, all or none.
  func load(from directory: URL, routing: NaturalRouting) throws {
    var pending: [KokoroAneStage: MLModel] = [:]
    for stage in KokoroAneStage.allCases {
      let config = MLModelConfiguration()
      config.computeUnits = routing.units(stage)
      config.allowLowPrecisionAccumulationOnGPU = true
      pending[stage] = try MLModel(
        contentsOf: directory.appendingPathComponent(stage.bundleName), configuration: config)
    }
    models = pending
  }

  func unload() {
    models = [:]
  }

  public func model(for stage: KokoroAneStage) throws -> MLModel {
    guard let model = models[stage] else { throw KokoroAneError.modelNotLoaded(stage.bundleName) }
    return model
  }
}
