/// Sets of frames as sorted, merged, non-empty half-open ranges.
public enum Intervals {
  /// Sorts, drops empty ranges and merges overlapping or abutting ones.
  public static func normalized(_ ranges: [Range<Int>]) -> [Range<Int>] {
    let sorted = ranges.filter { !$0.isEmpty }.sorted { $0.lowerBound < $1.lowerBound }
    var merged: [Range<Int>] = []
    for range in sorted {
      if let last = merged.last, range.lowerBound <= last.upperBound {
        merged[merged.count - 1] = last.lowerBound..<max(last.upperBound, range.upperBound)
      } else {
        merged.append(range)
      }
    }
    return merged
  }

  /// The set with a range added.
  public static func union(_ set: [Range<Int>], _ range: Range<Int>) -> [Range<Int>] {
    normalized(set + [range])
  }

  /// The set with a range taken out.
  public static func subtract(_ set: [Range<Int>], _ range: Range<Int>) -> [Range<Int>] {
    set.flatMap { part in
      [
        span(part.lowerBound, min(part.upperBound, range.lowerBound)),
        span(max(part.lowerBound, range.upperBound), part.upperBound),
      ].compactMap { $0 }
    }
  }

  /// The set's parts inside a range.
  public static func intersect(_ set: [Range<Int>], _ range: Range<Int>) -> [Range<Int>] {
    set.compactMap { clamp($0, to: range) }
  }

  /// A range minus a normalized set: what of it the set leaves, in order.
  public static func subtract(_ set: [Range<Int>], from range: Range<Int>) -> [Range<Int>] {
    var left: [Range<Int>] = []
    var cursor = range.lowerBound
    for part in intersect(set, range) {
      if let gap = span(cursor, part.lowerBound) { left.append(gap) }
      cursor = max(cursor, part.upperBound)
    }
    if let tail = span(cursor, range.upperBound) { left.append(tail) }
    return left
  }

  /// A range cut down to fit another, or nothing when they do not meet.
  public static func clamp(_ range: Range<Int>, to bounds: Range<Int>) -> Range<Int>? {
    span(max(range.lowerBound, bounds.lowerBound), min(range.upperBound, bounds.upperBound))
  }

  /// The total frames of a set.
  public static func count(_ set: [Range<Int>]) -> Int {
    set.reduce(0) { $0 + $1.count }
  }

  static func span(_ lower: Int, _ upper: Int) -> Range<Int>? {
    guard lower < upper else { return nil }
    return lower..<upper
  }
}
