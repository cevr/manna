import FluidAudio
import Foundation
import TakesCore

/// Transcribes takes on this Mac with Parakeet, from the models already on disk: it never
/// downloads. The models load once, on first use, off the caller's actor.
public actor Transcriber {
  public enum Status: Hashable, Sendable {
    case idle
    case loading
    case ready
    case unavailable(String)
  }

  private let directory: URL
  private var loading: Task<AsrManager, any Error>?
  public private(set) var status = Status.idle

  public init(directory: URL = ParakeetModels.directory) {
    self.directory = directory
  }

  /// The words of an audio file, their times in frames at `rate` (the file's own rate); or why
  /// there are none.
  public func transcribe(_ url: URL, rate: Int) async -> Transcript {
    let manager: AsrManager
    do {
      manager = try await loaded()
    } catch {
      if case .unavailable(let message) = status { return .unavailable(message) }
      return .unavailable(ParakeetModels.absentMessage(directory, detail: describe(error)))
    }
    do {
      let timings = try await Self.run(manager, url)
      return .done(
        timings.map { timing in
          Word(
            text: timing.word, start: Self.frame(timing.startTime, rate),
            end: Self.frame(timing.endTime, rate))
        })
    } catch {
      return .unavailable("Transcription failed: \(describe(error))")
    }
  }

  /// Starts loading the models, so the first take does not wait for them.
  public func prepare() async {
    _ = try? await loaded()
  }

  private func loaded() async throws -> AsrManager {
    if let loading { return try await loading.value }
    guard ParakeetModels.exists(directory) else {
      let message = ParakeetModels.absentMessage(directory)
      status = .unavailable(message)
      throw AsrModelsError.modelNotFound("parakeet-tdt-0.6b-v3", directory)
    }
    status = .loading
    let directory = directory
    let task = Task { try await Self.load(directory) }
    loading = task
    do {
      let manager = try await task.value
      status = .ready
      return manager
    } catch {
      status = .unavailable(ParakeetModels.absentMessage(directory, detail: describe(error)))
      throw error
    }
  }

  @concurrent private static func load(_ directory: URL) async throws -> AsrManager {
    let models = try AsrModels.loadLocal(from: directory, version: .v3)
    let manager = AsrManager(config: .default)
    try await manager.loadModels(models)
    return manager
  }

  @concurrent private static func run(_ manager: AsrManager, _ url: URL) async throws
    -> [WordTiming]
  {
    var state = TdtDecoderState.make(decoderLayers: await manager.decoderLayerCount)
    let result = try await manager.transcribe(url, decoderState: &state)
    return buildWordTimings(from: result.tokenTimings ?? [])
  }

  private static func frame(_ seconds: TimeInterval, _ rate: Int) -> Int {
    Int((seconds * Double(rate)).rounded())
  }

  private func describe(_ error: any Error) -> String {
    (error as? any LocalizedError)?.errorDescription ?? String(describing: error)
  }
}
