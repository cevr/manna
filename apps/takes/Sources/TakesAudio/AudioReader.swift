import AVFoundation
import Foundation

/// Reads any audio file AVFoundation can open as mono samples, by frame range, at a chosen rate.
public enum AudioReader {
  public struct Info: Hashable, Sendable {
    public var rate: Int
    public var frames: Int
    public var channels: Int

    public init(rate: Int, frames: Int, channels: Int) {
      self.rate = rate
      self.frames = frames
      self.channels = channels
    }
  }

  public enum Failure: Error, Hashable, Sendable {
    case unreadable(String)
  }

  public static func info(_ url: URL) throws -> Info {
    let file = try AVAudioFile(forReading: url)
    return Info(
      rate: Int(file.fileFormat.sampleRate), frames: Int(file.length),
      channels: Int(file.fileFormat.channelCount))
  }

  /// The frames `range` of the file (in its own rate, clamped to its length), channels averaged,
  /// resampled to `rate` when given: then exactly `round(count × rate / file rate)` samples.
  public static func read(_ url: URL, frames range: Range<Int>, rate: Int? = nil) throws -> [Float]
  {
    let file = try AVAudioFile(forReading: url)
    let fileRate = Int(file.processingFormat.sampleRate)
    let lower = min(max(range.lowerBound, 0), Int(file.length))
    let upper = min(max(range.upperBound, lower), Int(file.length))
    guard upper > lower else { return [] }
    let count = upper - lower
    guard
      let buffer = AVAudioPCMBuffer(
        pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(count))
    else { throw Failure.unreadable(url.lastPathComponent) }
    file.framePosition = AVAudioFramePosition(lower)
    try file.read(into: buffer, frameCount: AVAudioFrameCount(count))
    let mono = average(buffer)
    guard let rate, rate != fileRate else { return mono }
    return try resample(mono, from: fileRate, to: rate)
  }

  /// The number of samples `count` frames at `from` become at `to`.
  public static func resampledCount(_ count: Int, from: Int, to: Int) -> Int {
    Int((Double(count) * Double(to) / Double(from)).rounded())
  }

  private static func average(_ buffer: AVAudioPCMBuffer) -> [Float] {
    let frames = Int(buffer.frameLength)
    let channels = Int(buffer.format.channelCount)
    guard let data = buffer.floatChannelData, channels > 0 else {
      return [Float](repeating: 0, count: frames)
    }
    var mono = [Float](repeating: 0, count: frames)
    for channel in 0..<channels {
      let samples = data[channel]
      for frame in 0..<frames { mono[frame] += samples[frame] }
    }
    if channels > 1 {
      let scale = 1 / Float(channels)
      for frame in 0..<frames { mono[frame] *= scale }
    }
    return mono
  }

  static func resample(_ samples: [Float], from: Int, to: Int) throws -> [Float] {
    let expected = resampledCount(samples.count, from: from, to: to)
    guard
      let input = AVAudioFormat(standardFormatWithSampleRate: Double(from), channels: 1),
      let output = AVAudioFormat(standardFormatWithSampleRate: Double(to), channels: 1),
      let converter = AVAudioConverter(from: input, to: output),
      let source = Buffers.make(samples, format: input),
      let target = AVAudioPCMBuffer(
        pcmFormat: output, frameCapacity: AVAudioFrameCount(expected + 1_024))
    else { throw Failure.unreadable("resampler \(from) → \(to)") }
    converter.sampleRateConverterQuality = AVAudioQuality.max.rawValue
    let feed = Feed(buffer: source)
    var failure: NSError?
    let status = converter.convert(to: target, error: &failure) { _, state in
      feed.next(state)
    }
    if status == .error, let failure { throw failure }
    var out = Buffers.samples(target)
    if out.count > expected { out.removeLast(out.count - expected) }
    if out.count < expected { out += [Float](repeating: 0, count: expected - out.count) }
    return out
  }

  /// Hands the converter its one input buffer, then the end of the stream.
  private final class Feed: @unchecked Sendable {
    private var buffer: AVAudioPCMBuffer?

    init(buffer: AVAudioPCMBuffer) {
      self.buffer = buffer
    }

    func next(_ state: UnsafeMutablePointer<AVAudioConverterInputStatus>) -> AVAudioBuffer? {
      guard let buffer else {
        state.pointee = .endOfStream
        return nil
      }
      self.buffer = nil
      state.pointee = .haveData
      return buffer
    }
  }
}

/// Mono float buffers to and from sample arrays.
enum Buffers {
  static func make(_ samples: [Float], format: AVAudioFormat) -> AVAudioPCMBuffer? {
    guard
      let buffer = AVAudioPCMBuffer(
        pcmFormat: format, frameCapacity: AVAudioFrameCount(max(samples.count, 1)))
    else { return nil }
    buffer.frameLength = AVAudioFrameCount(samples.count)
    if let data = buffer.floatChannelData {
      samples.withUnsafeBufferPointer { source in
        for index in source.indices { data[0][index] = source[index] }
      }
    }
    return buffer
  }

  static func samples(_ buffer: AVAudioPCMBuffer) -> [Float] {
    guard let data = buffer.floatChannelData else { return [] }
    return Array(UnsafeBufferPointer(start: data[0], count: Int(buffer.frameLength)))
  }
}
