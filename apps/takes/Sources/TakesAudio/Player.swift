import AVFoundation
import Foundation

/// Plays rendered mono samples on its own engine, separate from the recorder's, and reports the
/// rendered frame it is at.
public final class Player {
  private let engine = AVAudioEngine()
  private let node = AVAudioPlayerNode()
  private let format: AVAudioFormat?
  private var startFrame = 0
  private var length = 0

  public init(rate: Int = AudioFormat.exportRate) {
    format = AVAudioFormat(standardFormatWithSampleRate: Double(rate), channels: 1)
    engine.attach(node)
    engine.connect(node, to: engine.mainMixerNode, format: format)
  }

  public enum Failure: Error, Hashable, Sendable {
    case buffer
  }

  /// Plays `samples` from frame `from`, stopping whatever played before.
  public func play(_ samples: [Float], from: Int = 0) throws {
    stop()
    let start = min(max(from, 0), samples.count)
    guard start < samples.count else { return }
    guard let format, let buffer = Buffers.make(Array(samples[start...]), format: format) else {
      throw Failure.buffer
    }
    if !engine.isRunning {
      engine.prepare()
      try engine.start()
    }
    startFrame = start
    length = samples.count
    node.scheduleBuffer(buffer, at: nil, options: [])
    node.play()
  }

  public func stop() {
    node.stop()
    length = 0
    if engine.isRunning { engine.stop() }
  }

  /// The rendered frame playing now, or nothing once stopped or past the end.
  public var position: Int? {
    guard length > 0, node.isPlaying, let time = node.lastRenderTime,
      let player = node.playerTime(forNodeTime: time)
    else { return nil }
    let frame = startFrame + Int(player.sampleTime)
    guard frame < length else { return nil }
    return max(frame, startFrame)
  }
}
