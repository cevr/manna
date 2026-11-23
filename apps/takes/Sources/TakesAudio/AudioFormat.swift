import AVFoundation
import Foundation

/// The format every render and export uses: 48 kHz mono, written as 24-bit integer WAV.
public enum AudioFormat {
  public static let exportRate = 48_000
  public static let exportBits = 24

  public enum Failure: Error, Hashable, Sendable {
    case buffer
  }

  /// Writes samples as a 48 kHz (or `rate`), 24-bit, mono WAV; samples past ±1 are clipped.
  public static func writeWAV(_ samples: [Float], rate: Int = exportRate, to url: URL) throws {
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: Double(rate),
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: exportBits,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    try? FileManager.default.removeItem(at: url)
    let file = try AVAudioFile(
      forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
    defer { file.close() }
    guard !samples.isEmpty else { return }
    let clipped = samples.map { min(max($0, -1), 1) }
    guard let buffer = Buffers.make(clipped, format: file.processingFormat) else {
      throw Failure.buffer
    }
    try file.write(from: buffer)
  }
}
