import Foundation

/// A session take: one recording through many beats, split where the speaker pressed "next beat".
public enum SessionSplit {
  /// How far either side of a press the split may move to find silence.
  public static let reach = 0.5
  /// The window whose loudness is measured, and the step between windows.
  public static let window = 0.020
  public static let hop = 0.005
  /// A segment shorter than this (a press just after the start or just before the stop) makes no take.
  public static let shortest = 0.1

  /// The split points: for each marker, the middle of the quietest window within `reach` of it,
  /// after the previous point. Ties go to the window nearest the marker. Points rise strictly.
  public static func points(samples: [Float], rate: Int, markers: [Int]) -> [Int] {
    points(frames: samples.count, rate: rate, markers: markers) { Array(samples[$0]) }
  }

  /// The split points of a recording too long to hold: `read` gives the samples of a frame range.
  public static func points(
    frames: Int, rate: Int, markers: [Int], read: (Range<Int>) throws -> [Float]
  ) rethrows -> [Int] {
    guard frames > 1 else { return [] }
    let size = max(1, Int(Double(rate) * window))
    let step = max(1, Int(Double(rate) * hop))
    let reachFrames = Int(Double(rate) * reach)
    var points: [Int] = []
    for marker in markers.sorted() {
      let floor = (points.last ?? 0) + 1
      let lower = max(floor, marker - reachFrames)
      let upper = min(frames - 1, marker + reachFrames)
      guard floor <= frames - 1 else { break }
      guard lower <= upper else {
        points.append(min(max(marker, floor), frames - 1))
        continue
      }
      let origin = max(0, lower - size)
      let limit = min(frames, upper + size)
      let samples = try read(origin..<limit)
      var energy = [Double](repeating: 0, count: limit - origin + 1)
      for index in origin..<limit {
        let sample = Double(samples.indices.contains(index - origin) ? samples[index - origin] : 0)
        energy[index - origin + 1] = energy[index - origin] + sample * sample
      }
      var best = min(max(marker, lower), upper)
      var bestEnergy = Double.infinity
      var start = max(0, lower - size / 2)
      while start + size / 2 <= upper {
        let center = start + size / 2
        let end = min(limit, start + size)
        let loudness = (energy[end - origin] - energy[start - origin]) / Double(end - start)
        if center >= lower,
          loudness < bestEnergy
            || (loudness == bestEnergy && abs(center - marker) < abs(best - marker))
        {
          best = center
          bestEnergy = loudness
        }
        start += step
      }
      points.append(best)
    }
    return points
  }

  /// The segments the points cut a recording of `frames` into: `[0, p1), [p1, p2) … [pn, frames)`.
  public static func segments(frames: Int, points: [Int]) -> [Range<Int>] {
    let bounds = [0] + points + [frames]
    return zip(bounds, bounds.dropFirst()).map { $0..<max($0, $1) }
  }

  /// The edit that lays a session's segments on the beats: segment k becomes a new kept take on
  /// the k-th beat from `startBeat`, beats "Beat N" are added for segments past the last, and a
  /// segment shorter than `shortest` makes no take.
  public static func edit(
    project: Project, source: Source, points: [Int], startBeat: BeatID?, name: String,
    created: Date, ids: () -> (BeatID, TakeID, ClipID) = { (.make(), .make(), .make()) }
  ) -> Edit {
    let beats = project.document.beats
    let start = beats.firstIndex { $0.id == startBeat } ?? beats.count
    let minimum = Int(Double(source.rate) * shortest)
    var edits: [Edit] = []
    var added = 0
    for (offset, range) in segments(frames: source.frames, points: points).enumerated() {
      guard range.count >= minimum else { continue }
      let position = start + offset
      let (newBeat, take, clip) = ids()
      let beat: BeatID
      if beats.indices.contains(position) {
        beat = beats[position].id
      } else {
        added += 1
        beat = newBeat
        edits.append(.addBeat(Beat(id: newBeat, title: "Beat \(beats.count + added)"), at: nil))
      }
      edits.append(
        .addTake(
          beat,
          Take(
            id: take, name: name, created: created,
            clips: [
              Clip(
                id: clip, source: source.id, inPoint: range.lowerBound, outPoint: range.upperBound)
            ]), keep: true))
    }
    return .batch(edits)
  }
}
