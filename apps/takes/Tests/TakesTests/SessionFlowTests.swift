import Foundation
import TakesAudio
import TakesCore
import TakesTranscribe
import Testing

@testable import TakesApp

/// A microphone that "records" a tone with a silent gap a little after each marker.
@MainActor
private final class StandIn: Microphone {
  var onInterruption: (@Sendable () -> Void)?
  var frames = 0
  var markers: [Int] = []
  var started: (folder: URL, source: SourceID)?
  let rate = 8_000

  func permitted() async -> Bool { true }

  func start(device: InputDevice?, folder: URL, source: SourceID) throws {
    started = (folder, source)
    frames = rate * 2
  }

  func mark() -> Int? {
    guard started != nil else { return nil }
    markers.append(frames)
    frames += rate * 2
    return markers.last
  }

  func takePeak() -> Float { 0.5 }

  func stop() -> Recording? {
    guard let started else { return nil }
    var samples = (0..<frames).map { Float(sin(Double($0) * 0.1)) * 0.5 }
    for marker in markers {
      for index in (marker + 400)..<(marker + 600) { samples[index] = 0 }
    }
    let file = Names.sourceFile(id: started.source, extension: "wav")
    let url = started.folder.appending(path: file)
    try? AudioFormat.writeWAV(samples, rate: rate, to: url)
    self.started = nil
    return Recording(
      source: started.source, url: url, file: file, rate: rate, frames: frames, markers: markers)
  }
}

@MainActor
@Test func `right after an outline import, Next Beat marks each beat of a session take`()
  async throws
{
  let scratch = try Scratch()
  let folder = scratch.url.appending(path: "proj", directoryHint: .isDirectory)
  try FileManager.default.createDirectory(
    at: folder.appending(path: "audio"), withIntermediateDirectories: true)
  let microphone = StandIn()
  let model = AppModel(
    transcriber: Transcriber(directory: URL(filePath: "/nonexistent/loop-probe-x/models")),
    microphone: microphone)
  model.open(folder)
  let outline = try #require(
    Bundle.module.url(forResource: "outline", withExtension: "md", subdirectory: "Fixtures"))
  model.importOutline(outline)
  #expect(model.selectedBeat == model.beats[0].id && model.take == nil)
  #expect(!model.canMarkNextBeat)

  await model.startRecording(session: true)
  #expect(model.canMarkNextBeat)
  model.nextBeat()
  #expect(model.selectedBeat == model.beats[1].id && model.take == nil)
  model.nextBeat()
  #expect(model.selectedBeat == model.beats[2].id)
  #expect(microphone.markers.count == 2)

  await model.stoppingRecording()
  #expect(!model.canMarkNextBeat)
  let plans = model.beats.map { model.project.plan(beat: $0.id) }
  #expect(plans.map(\.count) == [1, 1, 1])
  #expect(plans[0].first?.range.lowerBound == 0)
  #expect(plans[2].first?.range.upperBound == microphone.frames)
  for (index, marker) in microphone.markers.enumerated() {
    let split = try #require(plans[index].first?.range.upperBound)
    #expect((marker + 400)..<(marker + 600) ~= split)
  }
}

@MainActor
@Test func `Next Beat does nothing outside a session take`() async throws {
  let scratch = try Scratch()
  let microphone = StandIn()
  let model = AppModel(
    transcriber: Transcriber(directory: URL(filePath: "/nonexistent/loop-probe-x/models")),
    microphone: microphone)
  model.open(scratch.url.appending(path: "proj", directoryHint: .isDirectory))
  model.importOutline(
    try #require(
      Bundle.module.url(forResource: "outline", withExtension: "md", subdirectory: "Fixtures")))
  await model.startRecording(session: false)
  model.nextBeat()
  #expect(!model.canMarkNextBeat && microphone.markers.isEmpty)
  #expect(model.selectedBeat == model.beats[0].id)
  await model.stoppingRecording()
}
