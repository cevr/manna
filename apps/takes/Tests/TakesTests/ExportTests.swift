import AVFoundation
import Foundation
import TakesAudio
import TakesCore
import Testing

/// A scratch folder removed when the test ends.
struct Scratch: ~Copyable {
  let url: URL

  init() throws {
    url = FileManager.default.temporaryDirectory.appending(path: "takes-test-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
  }

  deinit { try? FileManager.default.removeItem(at: url) }
}

private func ramp(_ frames: Int, period: Int = 1_000) -> [Float] {
  (0..<frames).map { 0.1 + 0.5 * Float($0 % period) / Float(period) }
}

private let quantum: Float = 1 / Float(1 << 23)

@Test func `a render is the segments end to end, faded to silence at every join`() throws {
  let scratch = try Scratch()
  let url = scratch.url.appending(path: "ramp.wav")
  try AudioFormat.writeWAV(ramp(12_000), to: url)
  let source = try AudioReader.read(url, frames: 0..<12_000)
  let id = SourceID("ramp")
  let plan = [
    Segment(source: id, range: 100..<5_000), Segment(source: id, range: 7_000..<9_000),
    Segment(source: id, range: 11_990..<12_000),
  ]
  let rendered = try Renderer.render(plan, files: [id: url])
  #expect(rendered.count == 4_900 + 2_000 + 10)
  let fade = 480
  #expect(rendered[0] == 0 && rendered[4_900] == 0 && rendered[6_900] == 0)
  #expect(abs(rendered[4_899]) < 0.01 && abs(rendered[6_899]) < 0.01)
  for index in fade..<(4_900 - fade) {
    #expect(abs(rendered[index] - source[100 + index]) <= quantum, "frame \(index)")
  }
  for index in (4_900 + fade)..<(6_900 - fade) {
    #expect(abs(rendered[index] - source[7_000 + index - 4_900]) <= quantum, "frame \(index)")
  }
}

@Test func `a 96 kHz source renders at 48 kHz, each segment within a frame of half its length`()
  throws
{
  let scratch = try Scratch()
  let url = scratch.url.appending(path: "wave.wav")
  let tone = (0..<96_000).map { Float(sin(Double($0) * 2 * .pi * 220 / 96_000)) * 0.5 }
  try AudioFormat.writeWAV(tone, rate: 96_000, to: url)
  #expect(try AudioReader.info(url) == AudioReader.Info(rate: 96_000, frames: 96_000, channels: 1))
  let id = SourceID("wave")
  let ranges = [0..<10_001, 20_000..<20_003, 50_000..<96_000]
  let rendered = try Renderer.render(
    ranges.map { Segment(source: id, range: $0) }, files: [id: url])
  let halves = ranges.map { $0.count / 2 }
  #expect(abs(rendered.count - halves.reduce(0, +)) <= ranges.count)
  for middle in [1_000, 2_500, 4_000] {
    let expected = Float(sin(Double(middle * 2) * 2 * .pi * 220 / 96_000)) * 0.5
    #expect(abs(rendered[middle] - expected) < 0.01, "frame \(middle)")
  }
}

@Test func `the exported WAV is 48 kHz, 24-bit, mono, and reads back within one step`() throws {
  let scratch = try Scratch()
  let url = scratch.url.appending(path: "out.wav")
  let samples = ramp(4_800) + [1.5, -1.5]
  try AudioFormat.writeWAV(samples, to: url)
  let file = try AVAudioFile(forReading: url)
  #expect(file.fileFormat.sampleRate == 48_000)
  #expect(file.fileFormat.channelCount == 1)
  #expect(file.fileFormat.settings[AVLinearPCMBitDepthKey] as? Int == 24)
  #expect(file.fileFormat.settings[AVLinearPCMIsFloatKey] as? Bool == false)
  let back = try AudioReader.read(url, frames: 0..<5_000)
  #expect(back.count == 4_802)
  for index in 0..<4_800 { #expect(abs(back[index] - samples[index]) <= quantum) }
  #expect(back[4_800] > 0.999 && back[4_801] <= -0.999)
}

@Test func `beat files are named for their position and slug`() {
  #expect(Names.beatFile(position: 1, title: "Hook") == "01-hook.wav")
  #expect(Names.beatFile(position: 12, title: "  Él dijo: ¡Sí!  ") == "12-el-dijo-si.wav")
  #expect(Names.slug("In the Beginning — Was the Word") == "in-the-beginning-was-the-word")
  #expect(Names.slug("!!!") == "beat")
  #expect(Names.sourceFile(id: SourceID("abc"), extension: "WAV") == "audio/abc.wav")
}

@Test func `script.md lists the beats with the words their edited audio says`() throws {
  let id = SourceID("s")
  var project = Project(
    name: "Film",
    sources: [
      id: Source(
        id: id, file: "audio/s.wav", rate: 100, frames: 100,
        transcript: .done([
          Word(text: "one", start: 0, end: 20), Word(text: "two", start: 20, end: 40),
          Word(text: "three", start: 40, end: 60),
        ]))
    ])
  let clip = Clip(id: ClipID("c"), source: id, inPoint: 0, outPoint: 100, cuts: [18..<42])
  try project.apply(
    .batch([
      .addBeat(Beat(id: BeatID("a"), title: "Hook"), at: nil),
      .addTake(
        BeatID("a"), Take(id: TakeID("t"), name: "t", created: Date(), clips: [clip]), keep: true),
      .addBeat(Beat(id: BeatID("b"), title: "Body"), at: nil),
    ]))
  #expect(
    Script.markdown(project) == "# Film\n\n## 1. Hook\n\none three\n\n## 2. Body\n\n_(no take)_\n")
  #expect(Script.files(project).map(\.file) == ["01-hook.wav"])
}

@Test func `a waveform's peaks are each bucket's lowest and highest sample`() {
  let peaks = Peaks.make([0, 1, -1, 0.5, 0.25, -0.5, 2], bucket: 3)
  #expect(peaks.lows == [-1, -0.5, 2])
  #expect(peaks.highs == [1, 0.5, 2])
}
