import AVFoundation
import Foundation
import TakesCore
import Testing

@testable import TakesAudio

@Test func `a stopped session lays a take on each beat, split in the silence near each press`()
  throws
{
  let scratch = try Scratch()
  let rate = 48_000
  var samples = (0..<(rate * 6)).map { Float(sin(Double($0) * 0.05)) * 0.5 }
  let gaps = [(rate * 2 + 4_000)..<(rate * 2 + 6_000), (rate * 4 - 9_000)..<(rate * 4 - 7_000)]
  for gap in gaps { for index in gap { samples[index] = 0 } }
  let file = Names.sourceFile(id: SourceID("rec"), extension: "wav")
  let url = scratch.url.appending(path: file)
  try FileManager.default.createDirectory(
    at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
  try AudioFormat.writeWAV(samples, to: url)
  let recording = Recording(
    source: SourceID("rec"), url: url, file: file, rate: rate, frames: samples.count,
    markers: [rate * 2, rate * 4])
  var editor = Editor(project: Project(name: "p"))
  try editor.apply(
    .batch(Outline.beats("## Hook\n## Body\n## Close").map { .addBeat($0, at: nil) }))
  editor.add(recording.asSource)
  let beats = editor.project.document.beats
  try editor.apply(try recording.edit(in: editor.project, startingAt: beats[0].id, name: "Session"))
  let plans = beats.map { editor.project.plan(beat: $0.id).map(\.range) }
  #expect(plans.count == 3 && plans.allSatisfy { $0.count == 1 })
  #expect(plans[0][0].lowerBound == 0 && plans[2][0].upperBound == samples.count)
  #expect(
    gaps[0].contains(plans[0][0].upperBound) && plans[1][0].lowerBound == plans[0][0].upperBound)
  #expect(
    gaps[1].contains(plans[1][0].upperBound) && plans[2][0].lowerBound == plans[1][0].upperBound)
  #expect(editor.project.sources[SourceID("rec")]?.transcript == .pending)
}

@Test func `a recording without presses is one take on the beat`() throws {
  let recording = Recording(
    source: SourceID("r"), url: URL(filePath: "/nonexistent/loop-probe-x/r.wav"),
    file: "audio/r.wav", rate: 96_000, frames: 96_000)
  var project = Project(name: "p")
  project.sources[recording.source] = recording.asSource
  try project.apply(try recording.edit(in: project, startingAt: nil, name: "Take 1"))
  #expect(project.document.beats.map(\.title) == ["Beat 1"])
  #expect(project.filmPlan == [Segment(source: SourceID("r"), range: 0..<96_000)])
}

@Test func `the audio thread's sink mixes to mono, counts frames and drops markers`() throws {
  let scratch = try Scratch()
  let url = scratch.url.appending(path: "sink.wav")
  let settings: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 96_000.0, AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true,
  ]
  let file = try AVAudioFile(
    forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
  let sink = Sink(file: file)
  let stereo = try #require(AVAudioFormat(standardFormatWithSampleRate: 96_000, channels: 2))
  let buffer = try #require(AVAudioPCMBuffer(pcmFormat: stereo, frameCapacity: 100))
  buffer.frameLength = 100
  for index in 0..<100 {
    buffer.floatChannelData![0][index] = 0.5
    buffer.floatChannelData![1][index] = -0.1
  }
  sink.write(buffer)
  #expect(sink.mark() == 100)
  sink.write(buffer)
  #expect(sink.takePeak() == 0.2)
  #expect(sink.takePeak() == 0)
  let written = sink.finish()
  #expect(written.frames == 200 && written.markers == [100])
  let back = try AudioReader.read(url, frames: 0..<1_000)
  #expect(back.count == 200 && back.allSatisfy { abs($0 - 0.2) < 1e-6 })
}

@Test func `the input list reads without failing, and every chosen input has channels`() {
  let devices = InputDevices.all()
  let choice = InputChoice.choose(
    devices, remembered: nil, systemDefault: InputDevices.defaultInputUID())
  #expect(choice.map { $0.inputChannels > 0 } ?? true)
}
