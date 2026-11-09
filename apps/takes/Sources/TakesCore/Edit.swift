import Foundation

/// The ids and date a copy needs when it makes a new clip, and a new take on a beat with none kept.
public struct NewClip: Hashable, Sendable {
  public var clip: ClipID
  public var take: TakeID
  public var created: Date

  public init(clip: ClipID = .make(), take: TakeID = .make(), created: Date = Date()) {
    self.clip = clip
    self.take = take
    self.created = created
  }
}

/// One undoable change to a project's document.
public enum Edit: Hashable, Sendable {
  case addBeat(Beat, at: Int?)
  case renameBeat(BeatID, String)
  case setNote(BeatID, String)
  /// Moves the beats at `offsets` to before the beat now at `to`, as a list's drag does.
  case moveBeats(offsets: [Int], to: Int)
  case deleteBeat(BeatID)
  case restoreBeat(BeatID)
  case addTake(BeatID, Take, keep: Bool)
  case setKept(BeatID, TakeID?)
  case deleteTake(BeatID, TakeID)
  /// Cuts the words at these indices of the clip's source transcript.
  case cutWords(ClipRef, ClosedRange<Int>)
  case restoreWords(ClipRef, ClosedRange<Int>)
  /// Cuts source frames, clamped to the clip's span.
  case cutRange(ClipRef, Range<Int>)
  case restoreRange(ClipRef, Range<Int>)
  /// Sets the clip's span, clamped to its source.
  case trim(ClipRef, Range<Int>)
  /// Appends the words, as a clip over the same source, to the kept take of a beat.
  case copyWords(ClipRef, ClosedRange<Int>, to: BeatID, NewClip)
  /// Copies the words to a beat, then cuts them from the clip.
  case moveWords(ClipRef, ClosedRange<Int>, to: BeatID, NewClip)
  /// Several edits as one undo step; none applies if one fails.
  case batch([Edit])
}

/// Why an edit did not apply; the project is left as it was.
public enum EditError: Error, Hashable, Sendable {
  case noBeat(BeatID)
  case duplicateBeat(BeatID)
  case notInTrash(BeatID)
  case noTake(TakeID)
  case duplicateTake(TakeID)
  case noClip(ClipID)
  case duplicateClip(ClipID)
  case noSource(SourceID)
  case noTranscript(SourceID)
  case badWords(ClosedRange<Int>)
  case badRange(Range<Int>)
  case badMove([Int], Int)
}

extension Project {
  /// Applies an edit to the document, or throws and leaves the project as it was.
  public mutating func apply(_ edit: Edit) throws(EditError) {
    var next = self
    try next.applyInPlace(edit)
    self = next
  }

  private mutating func applyInPlace(_ edit: Edit) throws(EditError) {
    switch edit {
    case .addBeat(let beat, let at):
      guard !hasBeat(beat.id) else { throw .duplicateBeat(beat.id) }
      document.beats.insert(beat, at: min(max(at ?? document.beats.count, 0), document.beats.count))
    case .renameBeat(let id, let title):
      document.beats[try beatIndex(id)].title = title
    case .setNote(let id, let note):
      document.beats[try beatIndex(id)].note = note
    case .moveBeats(let offsets, let to):
      try moveBeats(offsets, to)
    case .deleteBeat(let id):
      let index = try beatIndex(id)
      document.trash.append(TrashedBeat(beat: document.beats.remove(at: index), index: index))
    case .restoreBeat(let id):
      guard let index = document.trash.lastIndex(where: { $0.beat.id == id }) else {
        throw .notInTrash(id)
      }
      let trashed = document.trash.remove(at: index)
      document.beats.insert(trashed.beat, at: min(trashed.index, document.beats.count))
    case .addTake(let id, let take, let keep):
      try addTake(take, to: id, keep: keep)
    case .setKept(let id, let take):
      let index = try beatIndex(id)
      if let take, !document.beats[index].takes.contains(where: { $0.id == take }) {
        throw .noTake(take)
      }
      document.beats[index].kept = take
    case .deleteTake(let id, let take):
      let index = try beatIndex(id)
      guard let takeIndex = document.beats[index].takes.firstIndex(where: { $0.id == take }) else {
        throw .noTake(take)
      }
      document.beats[index].takes.remove(at: takeIndex)
      if document.beats[index].kept == take { document.beats[index].kept = nil }
    case .cutWords(let ref, let selection):
      let range = try wordRange(ref, selection)
      try updateClip(ref) { clip in clip.cuts = Intervals.union(clip.cuts, range) }
    case .restoreWords(let ref, let selection):
      let range = try wordRange(ref, selection)
      try updateClip(ref) { clip in clip.cuts = Intervals.subtract(clip.cuts, range) }
    case .cutRange(let ref, let range):
      let clamped = try clampedToClip(ref, range)
      try updateClip(ref) { clip in clip.cuts = Intervals.union(clip.cuts, clamped) }
    case .restoreRange(let ref, let range):
      let clamped = try clampedToClip(ref, range)
      try updateClip(ref) { clip in clip.cuts = Intervals.subtract(clip.cuts, clamped) }
    case .trim(let ref, let range):
      let clip = try self.clip(ref)
      let source = try self.source(clip.source)
      guard let bounds = Intervals.clamp(range, to: 0..<source.frames) else {
        throw .badRange(range)
      }
      try updateClip(ref) { clip in
        clip.inPoint = bounds.lowerBound
        clip.outPoint = bounds.upperBound
        clip.cuts = Intervals.intersect(clip.cuts, bounds)
      }
    case .copyWords(let ref, let selection, let target, let new):
      try copyWords(ref, selection, to: target, new)
    case .moveWords(let ref, let selection, let target, let new):
      let range = try wordRange(ref, selection)
      try copyWords(ref, selection, to: target, new)
      try updateClip(ref) { clip in clip.cuts = Intervals.union(clip.cuts, range) }
    case .batch(let edits):
      for edit in edits { try applyInPlace(edit) }
    }
  }

  private func hasBeat(_ id: BeatID) -> Bool {
    document.beats.contains { $0.id == id } || document.trash.contains { $0.beat.id == id }
  }

  private func beatIndex(_ id: BeatID) throws(EditError) -> Int {
    guard let index = document.beats.firstIndex(where: { $0.id == id }) else { throw .noBeat(id) }
    return index
  }

  private func source(_ id: SourceID) throws(EditError) -> Source {
    guard let source = sources[id] else { throw .noSource(id) }
    return source
  }

  /// The clip a reference names, in a beat on the list.
  public func clip(_ ref: ClipRef) throws(EditError) -> Clip {
    let beat = document.beats[try beatIndex(ref.beat)]
    guard let take = beat.takes.first(where: { $0.id == ref.take }) else {
      throw .noTake(ref.take)
    }
    guard let clip = take.clips.first(where: { $0.id == ref.clip }) else {
      throw .noClip(ref.clip)
    }
    return clip
  }

  private mutating func updateClip(
    _ ref: ClipRef, _ change: (inout Clip) -> Void
  ) throws(EditError) {
    let beat = try beatIndex(ref.beat)
    guard let take = document.beats[beat].takes.firstIndex(where: { $0.id == ref.take }) else {
      throw .noTake(ref.take)
    }
    guard
      let clip = document.beats[beat].takes[take].clips.firstIndex(where: { $0.id == ref.clip })
    else { throw .noClip(ref.clip) }
    change(&document.beats[beat].takes[take].clips[clip])
  }

  private func clampedToClip(_ ref: ClipRef, _ range: Range<Int>) throws(EditError) -> Range<Int> {
    guard let clamped = Intervals.clamp(range, to: try clip(ref).bounds) else {
      throw .badRange(range)
    }
    return clamped
  }

  /// The frames cutting these words of the clip's source transcript removes, by the cut rule.
  public func wordRange(_ ref: ClipRef, _ selection: ClosedRange<Int>) throws(EditError) -> Range<
    Int
  > {
    let clip = try self.clip(ref)
    let source = try self.source(clip.source)
    guard let words = source.transcript.words else { throw .noTranscript(source.id) }
    guard
      let range = CutRule.range(
        words: words, selection: selection, bounds: clip.bounds,
        pad: CutRule.pad(rate: source.rate))
    else { throw .badWords(selection) }
    return range
  }

  private mutating func moveBeats(_ offsets: [Int], _ to: Int) throws(EditError) {
    let moving = Set(offsets)
    guard !moving.isEmpty, moving.allSatisfy(document.beats.indices.contains),
      (0...document.beats.count).contains(to)
    else { throw .badMove(offsets, to) }
    let picked = document.beats.indices.filter(moving.contains).map { document.beats[$0] }
    let kept = document.beats.indices.filter { !moving.contains($0) }.map { document.beats[$0] }
    let destination = to - moving.count(where: { $0 < to })
    document.beats = Array(kept[..<destination]) + picked + Array(kept[destination...])
  }

  private mutating func addTake(_ take: Take, to id: BeatID, keep: Bool) throws(EditError) {
    let index = try beatIndex(id)
    guard !document.beats.contains(where: { $0.takes.contains { $0.id == take.id } }) else {
      throw .duplicateTake(take.id)
    }
    for clip in take.clips {
      let source = try self.source(clip.source)
      guard clip.inPoint >= 0, clip.inPoint < clip.outPoint, clip.outPoint <= source.frames else {
        throw .badRange(clip.bounds)
      }
    }
    document.beats[index].takes.append(take)
    if keep { document.beats[index].kept = take.id }
  }

  private mutating func copyWords(
    _ ref: ClipRef, _ selection: ClosedRange<Int>, to target: BeatID, _ new: NewClip
  ) throws(EditError) {
    let range = try wordRange(ref, selection)
    let origin = try clip(ref)
    let originTitle = document.beats[try beatIndex(ref.beat)].title
    let index = try beatIndex(target)
    guard !document.beats[index].takes.contains(where: { $0.clips.contains { $0.id == new.clip } })
    else { throw .duplicateClip(new.clip) }
    let copy = Clip(
      id: new.clip, source: origin.source, inPoint: range.lowerBound, outPoint: range.upperBound,
      cuts: Intervals.intersect(origin.cuts, range))
    if let kept = document.beats[index].takes.firstIndex(where: {
      $0.id == document.beats[index].kept
    }) {
      document.beats[index].takes[kept].clips.append(copy)
    } else {
      try addTake(
        Take(id: new.take, name: "From \(originTitle)", created: new.created, clips: [copy]),
        to: target, keep: true)
    }
  }
}
