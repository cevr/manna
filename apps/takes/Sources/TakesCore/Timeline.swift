/// A plan laid end to end at the render rate: where each segment starts in the rendered audio, and
/// which source frame a rendered frame plays. The player's play head reads it.
public struct Timeline: Hashable, Sendable {
  public struct Placed: Hashable, Sendable {
    public var segment: Segment
    public var sourceRate: Int
    /// The rendered frames this segment fills.
    public var span: Range<Int>
  }

  public let rate: Int
  public let placed: [Placed]

  /// The samples `count` frames at `from` become at `to`; the renderer pads or trims to this.
  public static func renderedCount(_ count: Int, from: Int, to: Int) -> Int {
    guard from != to else { return count }
    return Int((Double(count) * Double(to) / Double(from)).rounded())
  }

  public init(plan: [Segment], rates: [SourceID: Int], rate: Int) {
    self.rate = rate
    var cursor = 0
    var placed: [Placed] = []
    for segment in plan {
      let sourceRate = rates[segment.source] ?? rate
      let count = Self.renderedCount(segment.range.count, from: sourceRate, to: rate)
      placed.append(
        Placed(segment: segment, sourceRate: sourceRate, span: cursor..<(cursor + count)))
      cursor += count
    }
    self.placed = placed
  }

  public init(plan: [Segment], project: Project, rate: Int) {
    self.init(plan: plan, rates: project.sources.mapValues(\.rate), rate: rate)
  }

  /// The rendered length in frames.
  public var frames: Int { placed.last?.span.upperBound ?? 0 }

  /// The segment and source frame a rendered frame plays, or nothing past the end.
  public func locate(_ frame: Int) -> (index: Int, source: SourceID, frame: Int)? {
    guard let index = placed.firstIndex(where: { $0.span.contains(frame) }) else { return nil }
    let place = placed[index]
    let offset = Self.renderedCount(frame - place.span.lowerBound, from: rate, to: place.sourceRate)
    let sourceFrame = min(
      place.segment.range.lowerBound + offset, place.segment.range.upperBound - 1)
    return (index, place.segment.source, sourceFrame)
  }

  /// The rendered frame that plays a source frame, the first segment holding it; nothing when cut.
  public func frame(source: SourceID, frame: Int) -> Int? {
    guard
      let place = placed.first(where: {
        $0.segment.source == source && $0.segment.range.contains(frame)
      })
    else { return nil }
    let offset = Self.renderedCount(
      frame - place.segment.range.lowerBound, from: place.sourceRate, to: rate)
    return min(
      place.span.lowerBound + offset, max(place.span.upperBound - 1, place.span.lowerBound))
  }
}
