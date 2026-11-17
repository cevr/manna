/// A waveform's outline: the lowest and highest sample of each bucket of frames.
public struct Peaks: Hashable, Sendable {
  public var bucket: Int
  public var lows: [Float]
  public var highs: [Float]

  /// Buckets of `bucket` frames (5 ms is `rate / 200`); the last bucket may be short.
  public static func make(_ samples: [Float], bucket: Int) -> Peaks {
    let size = max(1, bucket)
    var lows: [Float] = []
    var highs: [Float] = []
    lows.reserveCapacity(samples.count / size + 1)
    highs.reserveCapacity(samples.count / size + 1)
    var start = 0
    while start < samples.count {
      let slice = samples[start..<min(start + size, samples.count)]
      lows.append(slice.min() ?? 0)
      highs.append(slice.max() ?? 0)
      start += size
    }
    return Peaks(bucket: size, lows: lows, highs: highs)
  }
}
