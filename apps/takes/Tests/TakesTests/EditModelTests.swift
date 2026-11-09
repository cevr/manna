import Foundation
import TakesCore
import Testing

/// The reference: each clip a span and a cut flag per source frame; undo is a stack of states.
private struct RefClip: Equatable {
  var id: ClipID
  var source: SourceID
  var bounds: Range<Int>
  var cut: [Bool]

  var frames: [Int] { bounds.filter { !cut[$0] } }
}

private struct RefTake: Equatable {
  var id: TakeID
  var clips: [RefClip]
}

private struct RefBeat: Equatable {
  var id: BeatID
  var title: String
  var takes: [RefTake]
  var kept: TakeID?
}

private struct RefState: Equatable {
  var beats: [RefBeat] = []
  var trash: [(beat: RefBeat, index: Int)] = []

  static func == (lhs: RefState, rhs: RefState) -> Bool {
    lhs.beats == rhs.beats && lhs.trash.map(\.beat) == rhs.trash.map(\.beat)
      && lhs.trash.map(\.index) == rhs.trash.map(\.index)
  }

  func plan(_ beat: RefBeat) -> [(SourceID, Int)] {
    guard let take = beat.takes.first(where: { $0.id == beat.kept }) else { return [] }
    return take.clips.flatMap { clip in clip.frames.map { (clip.source, $0) } }
  }

  mutating func withClip(_ ref: ClipRef, _ change: (inout RefClip) -> Void) {
    guard let beat = beats.firstIndex(where: { $0.id == ref.beat }),
      let take = beats[beat].takes.firstIndex(where: { $0.id == ref.take }),
      let clip = beats[beat].takes[take].clips.firstIndex(where: { $0.id == ref.clip })
    else { return }
    change(&beats[beat].takes[take].clips[clip])
  }

  func clip(_ ref: ClipRef) -> RefClip? {
    beats.first { $0.id == ref.beat }?.takes.first { $0.id == ref.take }?.clips.first {
      $0.id == ref.clip
    }
  }
}

/// A run of consecutive frames of one source: plans are compared as these, so a cut is checked
/// frame by frame without comparing every frame.
private struct Run: Equatable, CustomStringConvertible {
  var source: SourceID
  var range: Range<Int>
  var description: String { "\(source.rawValue)[\(range.lowerBound)..<\(range.upperBound)]" }
}

private func runs(_ segments: [Segment]) -> [Run] {
  var out: [Run] = []
  for segment in segments where !segment.range.isEmpty {
    if let last = out.last, last.source == segment.source,
      last.range.upperBound == segment.range.lowerBound
    {
      out[out.count - 1].range = last.range.lowerBound..<segment.range.upperBound
    } else {
      out.append(Run(source: segment.source, range: segment.range))
    }
  }
  return out
}

private func runs(_ frames: [(SourceID, Int)]) -> [Run] {
  runs(frames.map { Segment(source: $0.0, range: $0.1..<($0.1 + 1)) })
}

private struct Model {
  var editor: Editor
  var reference = RefState()
  var past: [RefState] = []
  var future: [RefState] = []
  var words: [SourceID: [Word]] = [:]
  var landed: Set<SourceID> = []
  var counter = 0
  var log: [String] = []

  mutating func fresh() -> String {
    counter += 1
    return "n\(counter)"
  }

  mutating func commit(_ edit: Edit, _ next: RefState) {
    let applied: Bool
    do {
      try editor.apply(edit)
      applied = true
    } catch {
      applied = false
    }
    let changed = next != reference
    if applied, changed {
      past.append(reference)
      future.removeAll()
      reference = next
    }
    log.append("\(edit) applied=\(applied) changed=\(changed)")
  }

  func wordRange(_ ref: ClipRef, _ selection: ClosedRange<Int>) -> Range<Int>? {
    guard let clip = reference.clip(ref), landed.contains(clip.source),
      let words = words[clip.source], let source = editor.project.sources[clip.source]
    else { return nil }
    return CutRule.range(
      words: words, selection: selection, bounds: clip.bounds, pad: CutRule.pad(rate: source.rate))
  }

  func copy(_ ref: ClipRef, _ range: Range<Int>, to target: BeatID, _ new: NewClip) -> RefState? {
    guard let origin = reference.clip(ref),
      let originBeat = reference.beats.first(where: {
        $0.id == ref.beat
      }), let index = reference.beats.firstIndex(where: { $0.id == target })
    else { return nil }
    var cut = Array(repeating: false, count: origin.cut.count)
    for frame in range { cut[frame] = origin.cut[frame] }
    let clip = RefClip(id: new.clip, source: origin.source, bounds: range, cut: cut)
    var next = reference
    if let kept = next.beats[index].takes.firstIndex(where: { $0.id == next.beats[index].kept }) {
      next.beats[index].takes[kept].clips.append(clip)
    } else {
      _ = originBeat
      next.beats[index].takes.append(RefTake(id: new.take, clips: [clip]))
      next.beats[index].kept = new.take
    }
    return next
  }

  mutating func randomRef(_ random: inout SplitMix64) -> ClipRef? {
    let refs = reference.beats.flatMap { beat in
      beat.takes.flatMap { take in
        take.clips.map { ClipRef(beat: beat.id, take: take.id, clip: $0.id) }
      }
    }
    return random.pick(refs)
  }

  mutating func randomSelection(_ random: inout SplitMix64, _ ref: ClipRef) -> ClosedRange<Int> {
    guard let clip = reference.clip(ref), let words = words[clip.source], !words.isEmpty else {
      return 0...0
    }
    let first = random.int(0...(words.count - 1))
    return first...min(words.count - 1, first + random.int(0...3))
  }

  mutating func step(_ random: inout SplitMix64) {
    let sources = Array(editor.project.sources.values).sorted { $0.id.rawValue < $1.id.rawValue }
    switch random.int(0...16) {
    case 0:
      let id = BeatID(fresh())
      let at = random.int(0...reference.beats.count)
      var next = reference
      next.beats.insert(RefBeat(id: id, title: id.rawValue, takes: [], kept: nil), at: at)
      commit(.addBeat(Beat(id: id, title: id.rawValue), at: at), next)
    case 1:
      guard let beat = random.pick(reference.beats) else { return }
      var next = reference
      let index = next.beats.firstIndex { $0.id == beat.id }!
      next.trash.append((next.beats.remove(at: index), index))
      commit(.deleteBeat(beat.id), next)
    case 2:
      guard let trashed = random.pick(reference.trash) else { return }
      var next = reference
      let index = next.trash.lastIndex { $0.beat.id == trashed.beat.id }!
      let entry = next.trash.remove(at: index)
      next.beats.insert(entry.beat, at: min(entry.index, next.beats.count))
      commit(.restoreBeat(trashed.beat.id), next)
    case 3:
      guard !reference.beats.isEmpty else { return }
      let from = random.int(0...(reference.beats.count - 1))
      let to = random.int(0...reference.beats.count)
      var next = reference
      let moved = next.beats.remove(at: from)
      next.beats.insert(moved, at: to > from ? to - 1 : to)
      commit(.moveBeats(offsets: [from], to: to), next)
    case 4, 5:
      guard let beat = random.pick(reference.beats), let source = random.pick(sources) else {
        return
      }
      let takeID = TakeID(fresh())
      var clips: [Clip] = []
      var refClips: [RefClip] = []
      for _ in 0..<random.int(1...2) {
        let lower = random.int(0...(source.frames - 2))
        let upper = random.int((lower + 1)...source.frames)
        let id = ClipID(fresh())
        clips.append(Clip(id: id, source: source.id, inPoint: lower, outPoint: upper))
        refClips.append(
          RefClip(
            id: id, source: source.id, bounds: lower..<upper,
            cut: Array(repeating: false, count: source.frames)))
      }
      let keep = random.chance(0.7)
      var next = reference
      let index = next.beats.firstIndex { $0.id == beat.id }!
      next.beats[index].takes.append(RefTake(id: takeID, clips: refClips))
      if keep { next.beats[index].kept = takeID }
      commit(
        .addTake(beat.id, Take(id: takeID, name: "t", created: Date(), clips: clips), keep: keep),
        next)
    case 6:
      guard let beat = random.pick(reference.beats) else { return }
      let take = random.pick(beat.takes)?.id
      var next = reference
      let index = next.beats.firstIndex { $0.id == beat.id }!
      next.beats[index].kept = take
      commit(.setKept(beat.id, take), next)
    case 7:
      guard let beat = random.pick(reference.beats), let take = random.pick(beat.takes) else {
        return
      }
      var next = reference
      let index = next.beats.firstIndex { $0.id == beat.id }!
      next.beats[index].takes.removeAll { $0.id == take.id }
      if next.beats[index].kept == take.id { next.beats[index].kept = nil }
      commit(.deleteTake(beat.id, take.id), next)
    case 8, 9:
      guard let ref = randomRef(&random), let clip = reference.clip(ref) else { return }
      let lower = random.int(0...(clip.cut.count - 1))
      let range = lower..<random.int((lower + 1)...clip.cut.count)
      let restore = random.chance(0.35)
      var next = reference
      next.withClip(ref) { clip in
        for frame in range where clip.bounds.contains(frame) { clip.cut[frame] = !restore }
      }
      commit(restore ? .restoreRange(ref, range) : .cutRange(ref, range), next)
    case 10, 11:
      guard let ref = randomRef(&random) else { return }
      let selection = randomSelection(&random, ref)
      let restore = random.chance(0.3)
      var next = reference
      if let range = wordRange(ref, selection) {
        next.withClip(ref) { clip in for frame in range { clip.cut[frame] = !restore } }
      }
      commit(restore ? .restoreWords(ref, selection) : .cutWords(ref, selection), next)
    case 12:
      guard let ref = randomRef(&random), let clip = reference.clip(ref) else { return }
      let lower = random.int(-5...(clip.cut.count - 1))
      let upper = random.int((lower + 1)...(clip.cut.count + 5))
      var next = reference
      if let bounds = Intervals.clamp(lower..<upper, to: 0..<clip.cut.count) {
        next.withClip(ref) { clip in
          clip.bounds = bounds
          for frame in clip.cut.indices where !bounds.contains(frame) { clip.cut[frame] = false }
        }
      }
      commit(.trim(ref, lower..<upper), next)
    case 13, 14:
      guard let ref = randomRef(&random), let target = random.pick(reference.beats) else { return }
      let selection = randomSelection(&random, ref)
      let new = NewClip(clip: ClipID(fresh()), take: TakeID(fresh()), created: Date())
      let move = random.chance(0.5)
      let before = Intervals.count(runs(editor.project.filmPlan).map(\.range))
      let originKept = reference.beats.first { $0.id == ref.beat }?.kept == ref.take
      var next = reference
      if let range = wordRange(ref, selection), let copied = copy(ref, range, to: target.id, new) {
        next = copied
        if move { next.withClip(ref) { clip in for frame in range { clip.cut[frame] = true } } }
      }
      commit(
        move
          ? .moveWords(ref, selection, to: target.id, new)
          : .copyWords(ref, selection, to: target.id, new), next)
      if move, originKept, reference == next {
        let after = Intervals.count(runs(editor.project.filmPlan).map(\.range))
        #expect(after == before, "a move kept the film's length: \(log)")
      }
    case 15:
      guard let source = random.pick(sources), !landed.contains(source.id),
        let words = words[source.id]
      else { return }
      editor.land(.done(words), for: source.id)
      landed.insert(source.id)
      log.append("land \(source.id)")
    default:
      if random.chance(0.5) {
        editor.undo()
        if let previous = past.popLast() {
          future.append(reference)
          reference = previous
        }
        log.append("undo")
      } else {
        editor.redo()
        if let next = future.popLast() {
          past.append(reference)
          reference = next
        }
        log.append("redo")
      }
    }
  }

  func check(seed: UInt64) {
    let project = editor.project
    #expect(project.document.beats.map(\.id) == reference.beats.map(\.id), "seed \(seed): \(log)")
    #expect(
      project.document.trash.map(\.beat.id) == reference.trash.map(\.beat.id),
      "seed \(seed): \(log)")
    for beat in reference.beats {
      let expected = runs(reference.plan(beat))
      let actual = runs(project.plan(beat: beat.id))
      #expect(actual == expected, "seed \(seed) beat \(beat.id): \(log)")
    }
    for beat in project.document.beats {
      for take in beat.takes {
        for clip in take.clips {
          #expect(Intervals.normalized(clip.cuts) == clip.cuts, "seed \(seed): \(log)")
          #expect(
            clip.cuts.allSatisfy {
              clip.bounds.contains($0.lowerBound) && $0.upperBound <= clip.outPoint
            })
        }
      }
    }
    for source in landed {
      #expect(project.sources[source]?.transcript.words == words[source], "seed \(seed): \(log)")
    }
  }
}

@Test func `every edit plays the frames the reference keeps, through undo and redo`() {
  for seed in seeds(300, salt: 11) {
    var random = SplitMix64(seed: seed)
    var project = Project(name: "model")
    var model = Model(editor: Editor(project: project))
    for index in 0..<random.int(1...3) {
      let frames = random.int(40...300)
      let id = SourceID("s\(index)")
      project.sources[id] = Source(id: id, file: "audio/s\(index).wav", rate: 1_000, frames: frames)
      model.words[id] = generateWords(&random, count: random.int(2...10), grid: 4, from: 4)
        .filter { $0.end <= frames }
      model.editor.add(project.sources[id]!)
    }
    for _ in 0..<40 {
      model.step(&random)
      model.check(seed: seed)
    }
  }
}

@Test func `a transcript that lands survives undoing the edits before it`() throws {
  let source = Source(id: SourceID("s"), file: "audio/s.wav", rate: 1_000, frames: 100)
  var editor = Editor(project: Project(name: "p"))
  editor.add(source)
  try editor.apply(.addBeat(Beat(id: BeatID("b"), title: "Hook"), at: nil))
  try editor.apply(
    .addTake(
      BeatID("b"),
      Take(
        id: TakeID("t"), name: "t", created: Date(),
        clips: [Clip(id: ClipID("c"), source: source.id, inPoint: 0, outPoint: 100)]), keep: true))
  editor.land(.done([Word(text: "hi", start: 10, end: 20)]), for: source.id)
  editor.undo()
  editor.undo()
  #expect(editor.project.document.beats.isEmpty)
  #expect(editor.project.sources[source.id]?.transcript.words?.map(\.text) == ["hi"])
  editor.redo()
  editor.redo()
  #expect(editor.project.plan(beat: BeatID("b")) == [Segment(source: source.id, range: 0..<100)])
}

@Test func `an edit that fails or changes nothing leaves no undo step`() throws {
  var editor = Editor(project: Project(name: "p"))
  try editor.apply(.addBeat(Beat(id: BeatID("b"), title: "Hook"), at: nil))
  #expect(throws: EditError.noBeat(BeatID("x"))) { try editor.apply(.renameBeat(BeatID("x"), "y")) }
  try editor.apply(.renameBeat(BeatID("b"), "Hook"))
  #expect(editor.history.past.count == 1)
}
