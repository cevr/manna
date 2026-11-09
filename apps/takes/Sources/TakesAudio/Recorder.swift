import AVFoundation
import Foundation
import Synchronization
import TakesCore

/// A finished recording: its file, rate and length, and the frames "next beat" was pressed at.
public struct Recording: Hashable, Sendable {
  public var source: SourceID
  public var url: URL
  /// The file's path relative to the project folder.
  public var file: String
  public var rate: Int
  public var frames: Int
  public var markers: [Int]

  public init(
    source: SourceID, url: URL, file: String, rate: Int, frames: Int, markers: [Int] = []
  ) {
    self.source = source
    self.url = url
    self.file = file
    self.rate = rate
    self.frames = frames
    self.markers = markers
  }

  /// The recording as a project source, its transcript still to come.
  public var asSource: Source {
    Source(id: source, file: file, rate: rate, frames: frames, transcript: .pending)
  }

  /// The edit a stopped recording makes: one take on `beat`, or with markers, a take per beat
  /// from `beat` on, split at the quietest point near each press.
  public func edit(
    in project: Project, startingAt beat: BeatID?, name: String, created: Date = Date()
  ) throws -> Edit {
    guard !markers.isEmpty else {
      return .take(of: asSource, on: beat, in: project, name: name, created: created)
    }
    let url = url
    let points = try SessionSplit.points(frames: frames, rate: rate, markers: markers) { range in
      try AudioReader.read(url, frames: range)
    }
    return SessionSplit.edit(
      project: project, source: asSource, points: points, startBeat: beat, name: name,
      created: created)
  }
}

/// Records one input to a 32-bit float mono WAV at the device's own rate, with a level meter,
/// a frame count and "next beat" markers the audio thread and the caller share under a lock.
public final class Recorder {
  public enum Failure: Error, Hashable, Sendable {
    case permissionDenied
    case alreadyRecording
    case noInput
    case device(String)
  }

  private var engine: AVAudioEngine?
  private var sink: Sink?
  private var pending: (source: SourceID, url: URL, file: String, rate: Int)?
  private var observer: (any NSObjectProtocol)?

  /// Called on the main queue when the input goes away or changes under a recording; the caller
  /// stops it, keeping what was recorded.
  public var onInterruption: (@Sendable () -> Void)?

  public init() {}

  public var isRecording: Bool { engine != nil }

  /// Microphone access: asks the first time; false when the owner refused it in System Settings.
  public static func requestPermission() async -> Bool {
    await AVCaptureDevice.requestAccess(for: .audio)
  }

  /// The System Settings page that grants microphone access.
  public static let privacySettings = URL(
    string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")

  /// Starts recording `device` (the system default when absent) into the project's `audio/`.
  public func start(device: InputDevice?, folder: URL, source: SourceID = .make()) throws {
    guard engine == nil else { throw Failure.alreadyRecording }
    let engine = AVAudioEngine()
    let input = engine.inputNode
    if let device {
      do {
        try input.auAudioUnit.setDeviceID(device.id)
      } catch {
        throw Failure.device("\(device.name): \(error.localizedDescription)")
      }
    }
    let format = input.outputFormat(forBus: 0)
    guard format.channelCount > 0, format.sampleRate > 0 else { throw Failure.noInput }
    let rate = Int(format.sampleRate)
    let file = Names.sourceFile(id: source, extension: "wav")
    let url = folder.appending(path: file)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: format.sampleRate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let writer = try AVAudioFile(
      forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
    let sink = Sink(file: writer)
    input.installTap(onBus: 0, bufferSize: 4_096, format: format) { buffer, _ in
      sink.write(buffer)
    }
    engine.prepare()
    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      sink.finish()
      try? FileManager.default.removeItem(at: url)
      throw Failure.device(error.localizedDescription)
    }
    let interruption = onInterruption
    observer = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
    ) { _ in interruption?() }
    self.engine = engine
    self.sink = sink
    pending = (source, url, file, rate)
  }

  /// Drops a "next beat" marker at the frame recorded so far.
  @discardableResult
  public func mark() -> Int? {
    sink?.mark()
  }

  /// Frames recorded so far.
  public var frames: Int { sink?.frames ?? 0 }

  /// The loudest sample since the last call, in dBFS (−160 for silence), for a level meter.
  public func takePeak() -> Float {
    let peak = sink?.takePeak() ?? 0
    guard peak > 0 else { return -160 }
    return 20 * log10(peak)
  }

  /// Stops and closes the file; nothing when not recording.
  public func stop() -> Recording? {
    guard let engine, let sink, let pending else { return nil }
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    if let observer { NotificationCenter.default.removeObserver(observer) }
    let written = sink.finish()
    self.engine = nil
    self.sink = nil
    self.pending = nil
    self.observer = nil
    return Recording(
      source: pending.source, url: pending.url, file: pending.file, rate: pending.rate,
      frames: written.frames, markers: written.markers)
  }
}

/// The audio thread's side of a recording: the file, mixed down to mono, and what the meter and
/// the markers read.
final class Sink: Sendable {
  struct Written {
    var frames: Int
    var markers: [Int]
  }

  private struct State {
    var file: AVAudioFile?
    var frames = 0
    var peak: Float = 0
    var markers: [Int] = []
  }

  private let state: Mutex<State>

  init(file: sending AVAudioFile) {
    state = Mutex(State(file: file))
  }

  func write(_ buffer: AVAudioPCMBuffer) {
    guard let mono = Self.mono(buffer) else { return }
    let frames = Int(mono.frameLength)
    var peak: Float = 0
    if let data = mono.floatChannelData {
      for index in 0..<frames { peak = max(peak, abs(data[0][index])) }
    }
    state.withLock { state in
      guard let file = state.file else { return }
      do {
        try file.write(from: mono)
        state.frames += frames
        state.peak = max(state.peak, peak)
      } catch {
        state.file = nil
      }
    }
  }

  func mark() -> Int {
    state.withLock { state in
      state.markers.append(state.frames)
      return state.frames
    }
  }

  var frames: Int { state.withLock { $0.frames } }

  func takePeak() -> Float {
    state.withLock { state in
      defer { state.peak = 0 }
      return state.peak
    }
  }

  @discardableResult
  func finish() -> Written {
    state.withLock { state in
      state.file?.close()
      state.file = nil
      return Written(frames: state.frames, markers: state.markers)
    }
  }

  private static func mono(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    let channels = Int(buffer.format.channelCount)
    guard let data = buffer.floatChannelData, channels > 0 else { return nil }
    let frames = Int(buffer.frameLength)
    var samples = [Float](repeating: 0, count: frames)
    for channel in 0..<channels {
      for index in 0..<frames { samples[index] += data[channel][index] }
    }
    if channels > 1 {
      let scale = 1 / Float(channels)
      for index in 0..<frames { samples[index] *= scale }
    }
    guard
      let format = AVAudioFormat(
        standardFormatWithSampleRate: buffer.format.sampleRate, channels: 1)
    else { return nil }
    return Buffers.make(samples, format: format)
  }
}
