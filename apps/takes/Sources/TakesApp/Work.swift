import Foundation
import TakesAudio
import TakesCore

/// The app's heavy work, run off the main actor: rendering, waveforms, export, imports.
enum Work {
  @concurrent static func render(_ plan: [Segment], files: [SourceID: URL]) async throws -> [Float]
  {
    try Renderer.render(plan, files: files)
  }

  @concurrent static func peaks(_ url: URL, rate: Int) async throws -> Peaks {
    let info = try AudioReader.info(url)
    let samples = try AudioReader.read(url, frames: 0..<info.frames)
    return Peaks.make(samples, bucket: max(1, rate / 200))
  }

  @concurrent static func export(_ project: Project, from folder: URL, to destination: URL)
    async throws -> [URL]
  {
    try Exporter.export(project, from: folder, to: destination)
  }

  @concurrent static func importAudio(_ url: URL, into folder: URL) async throws -> Source {
    try Exporter.importAudio(url, into: folder)
  }

  @concurrent static func edit(of recording: Recording, in project: Project, beat: BeatID?)
    async throws -> Edit
  {
    let name = if recording.markers.isEmpty { "Take" } else { "Session" }
    return try recording.edit(in: project, startingAt: beat, name: name)
  }
}
