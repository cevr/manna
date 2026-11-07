import AVFoundation
import Foundation

/// One natural reading the module holds: its internal generation, which
/// events are matched by, and the JS id they carry; the chunks rendered and
/// not yet scheduled; and its timeline, in samples at 24 kHz from the
/// reading's first sample: where the next chunk goes, each word's start and
/// the end of the last chunk.
@MainActor final class NaturalReading {
  let generation: Int
  let utterance: Int
  var rendered: [Int: (pcm: [Float], frames: Int)] = [:]
  var rendering: Task<(KokoroAneSynthesisResult, Double), Error>?
  var nextChunk = 0
  var begin = 0
  var scheduledEnd = 0
  var marks: [NaturalStart] = []
  var nextMark = 0
  var end: Int?
  var started = false
  var paused = false

  init(generation: Int, utterance: Int) {
    self.generation = generation
    self.utterance = utterance
  }
}

/// Where a reading's audio goes, and the clock its events follow, in
/// samples of the reading's timeline.
///
/// On a device, one `AVAudioEngine` with one `AVAudioPlayerNode` at 24 kHz
/// mono float32, built at the first chunk and torn down when the reading
/// ends; the clock is the node's sample time. The simulator never builds
/// the engine or plays, since its audio reaches the Mac's speaker: its
/// clock is the wall time since the first chunk, standing still while
/// paused.
@MainActor final class NaturalOutput {
  static let rate = Double(KokoroAneConstants.sampleRate)

  #if targetEnvironment(simulator)
    static let note = " skipped=simulator"
    private var played: Double = 0
    private var tick: Date?
    private var running = false

    func now() -> Int? {
      guard let last = tick else { return nil }
      let at = Date()
      if running { played += at.timeIntervalSince(last) * Self.rate }
      tick = at
      return Int(played)
    }

    func schedule(_ pcm: [Float], at sample: Int, paused: Bool) throws {
      if tick == nil { tick = Date() }
      if !paused { running = true }
    }

    func pause() {
      _ = now()
      running = false
    }

    func resume() throws {
      _ = now()
      running = tick != nil
    }

    func halt() {
      played = 0
      tick = nil
      running = false
    }

    func owns(_ id: ObjectIdentifier?) -> Bool {
      false
    }
  #else
    static let note = ""
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private let format = AVAudioFormat(standardFormatWithSampleRate: NaturalOutput.rate, channels: 1)

    func now() -> Int? {
      guard let player, let node = player.lastRenderTime, let time = player.playerTime(forNodeTime: node) else {
        return nil
      }
      return Int(time.sampleTime)
    }

    func schedule(_ pcm: [Float], at sample: Int, paused: Bool) throws {
      guard let format, !pcm.isEmpty,
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(pcm.count)),
        let channel = buffer.floatChannelData?[0]
      else { throw NaturalFailure(message: "play failed: no buffer") }
      buffer.frameLength = AVAudioFrameCount(pcm.count)
      pcm.withUnsafeBufferPointer { source in
        if let base = source.baseAddress { channel.update(from: base, count: pcm.count) }
      }
      let node = prepared(format)
      node.scheduleBuffer(
        buffer, at: AVAudioTime(sampleTime: AVAudioFramePosition(sample), atRate: Self.rate), options: [],
        completionHandler: nil)
      if !paused { try run() }
    }

    func pause() {
      player?.pause()
      engine?.pause()
    }

    func resume() throws {
      guard player != nil else { return }
      try run()
    }

    func halt() {
      player?.stop()
      engine?.stop()
      player = nil
      engine = nil
    }

    func owns(_ id: ObjectIdentifier?) -> Bool {
      guard let engine, let id else { return false }
      return ObjectIdentifier(engine) == id
    }

    private func prepared(_ format: AVAudioFormat) -> AVAudioPlayerNode {
      if let player { return player }
      let graph = AVAudioEngine()
      let node = AVAudioPlayerNode()
      graph.attach(node)
      graph.connect(node, to: graph.mainMixerNode, format: format)
      graph.prepare()
      engine = graph
      player = node
      return node
    }

    private func run() throws {
      guard let engine, let player else { return }
      if !engine.isRunning {
        do {
          try engine.start()
        } catch {
          throw NaturalFailure(message: "play failed: \(error.localizedDescription)")
        }
      }
      if !player.isPlaying { player.play() }
    }
  #endif
}
