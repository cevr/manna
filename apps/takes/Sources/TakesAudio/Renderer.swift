import Foundation
import TakesCore

/// Plays a plan into samples: each segment read at the render rate, joined end to end, with a
/// short linear fade at every join so cuts do not click. Fades multiply and never overlap, so the
/// length is the segments' lengths summed.
public enum Renderer {
  /// The fade at each segment's head and tail: 10 ms, or half the segment when it is shorter.
  public static let fade = 0.010

  public enum Failure: Error, Hashable, Sendable {
    case missingSource(SourceID)
  }

  public static func render(
    _ plan: [Segment], files: [SourceID: URL], rate: Int = AudioFormat.exportRate
  ) throws -> [Float] {
    var out: [Float] = []
    let fadeFrames = Int(Double(rate) * fade)
    for segment in plan {
      guard let url = files[segment.source] else { throw Failure.missingSource(segment.source) }
      var samples = try AudioReader.read(url, frames: segment.range, rate: rate)
      applyFades(&samples, frames: min(fadeFrames, samples.count / 2))
      out += samples
    }
    return out
  }

  /// The audio files of a project's sources, by id.
  public static func files(of project: Project, in folder: URL) -> [SourceID: URL] {
    project.sources.mapValues { ProjectFile.audioURL(of: $0, in: folder) }
  }

  static func applyFades(_ samples: inout [Float], frames: Int) {
    guard frames > 0 else { return }
    let last = samples.count - 1
    for index in 0..<frames {
      let gain = Float(index) / Float(frames)
      samples[index] *= gain
      samples[last - index] *= gain
    }
  }
}
