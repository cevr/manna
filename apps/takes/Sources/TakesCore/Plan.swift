/// What plays: every player, export and transcript of edited audio reads these and nothing else.
extension Project {
  /// The beat's kept take as runs of source frames, in order; empty when no take is kept.
  public func plan(beat id: BeatID) -> [Segment] {
    guard let beat = document.beats.first(where: { $0.id == id }), let take = beat.keptTake else {
      return []
    }
    return take.clips.flatMap { clip in
      clip.segments.map { Segment(source: clip.source, range: $0) }
    }
  }

  /// Every beat's plan, in the beats' order.
  public var filmPlan: [Segment] {
    document.beats.flatMap { plan(beat: $0.id) }
  }

  /// The words a plan plays: each segment's source words whose midpoint lies in it, in plan order.
  public func words(of plan: [Segment]) -> [Word] {
    plan.flatMap { segment in
      (sources[segment.source]?.transcript.words ?? []).filter {
        segment.range.contains($0.midpoint)
      }
    }
  }
}
