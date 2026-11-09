import Foundation

/// A transcribed word, its start and end in frames at its source's own rate.
public struct Word: Codable, Hashable, Sendable {
  public var text: String
  public var start: Int
  public var end: Int

  public init(text: String, start: Int, end: Int) {
    self.text = text
    self.start = start
    self.end = end
  }

  /// The frame a word is placed by: in a segment, under a cut, inside a clip.
  public var midpoint: Int { (start + end) / 2 }
}

/// A source's transcript: it lands after the recording, outside the undo history.
public enum Transcript: Codable, Hashable, Sendable {
  case none
  case pending
  case done([Word])
  case unavailable(String)

  public var words: [Word]? {
    if case .done(let words) = self { words } else { [Word]?.none }
  }

  private enum CodingKeys: String, CodingKey {
    case state, words, reason
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let state = try container.decode(String.self, forKey: .state)
    switch state {
    case "none": self = .none
    case "pending": self = .pending
    case "done": self = .done(try container.decode([Word].self, forKey: .words))
    case "unavailable": self = .unavailable(try container.decode(String.self, forKey: .reason))
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .state, in: container, debugDescription: "Unknown transcript state \(state)")
    }
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .none: try container.encode("none", forKey: .state)
    case .pending: try container.encode("pending", forKey: .state)
    case .done(let words):
      try container.encode("done", forKey: .state)
      try container.encode(words, forKey: .words)
    case .unavailable(let reason):
      try container.encode("unavailable", forKey: .state)
      try container.encode(reason, forKey: .reason)
    }
  }
}

/// An audio file in the project's `audio/` folder; never modified once written.
public struct Source: Codable, Hashable, Sendable, Identifiable {
  public var id: SourceID
  /// The file's path relative to the project folder, `audio/<id>.<ext>`.
  public var file: String
  public var rate: Int
  public var frames: Int
  public var transcript: Transcript

  public init(id: SourceID, file: String, rate: Int, frames: Int, transcript: Transcript = .none) {
    self.id = id
    self.file = file
    self.rate = rate
    self.frames = frames
    self.transcript = transcript
  }
}

/// A span of one source, with the frames cut out of it; cuts stay sorted, merged and inside the span.
public struct Clip: Codable, Hashable, Sendable, Identifiable {
  public var id: ClipID
  public var source: SourceID
  public var inPoint: Int
  public var outPoint: Int
  public var cuts: [Range<Int>]

  public init(id: ClipID, source: SourceID, inPoint: Int, outPoint: Int, cuts: [Range<Int>] = []) {
    self.id = id
    self.source = source
    self.inPoint = inPoint
    self.outPoint = outPoint
    self.cuts = Intervals.intersect(Intervals.normalized(cuts), inPoint..<outPoint)
  }

  private enum CodingKeys: String, CodingKey {
    case id, source, cuts
    case inPoint = "in"
    case outPoint = "out"
  }

  public var bounds: Range<Int> { inPoint..<outPoint }

  /// The frames that play: the span minus the cuts, in order.
  public var segments: [Range<Int>] { Intervals.subtract(cuts, from: bounds) }

  /// A word shows struck through when its midpoint is cut or trimmed away.
  public func isStruck(_ word: Word) -> Bool {
    !bounds.contains(word.midpoint) || cuts.contains { $0.contains(word.midpoint) }
  }

  /// The indices of the transcript's words that lie in this clip's span.
  public func wordIndices(_ words: [Word]) -> [Int] {
    words.indices.filter { bounds.contains(words[$0].midpoint) }
  }
}

/// One recording of a beat, as clips played in order.
public struct Take: Codable, Hashable, Sendable, Identifiable {
  public var id: TakeID
  public var name: String
  public var created: Date
  public var clips: [Clip]

  public init(id: TakeID, name: String, created: Date, clips: [Clip]) {
    self.id = id
    self.name = name
    self.created = created
    self.clips = clips
  }
}

/// A point of the script: its title, its talking-point note, its takes and the one kept.
public struct Beat: Codable, Hashable, Sendable, Identifiable {
  public var id: BeatID
  public var title: String
  public var note: String
  public var takes: [Take]
  public var kept: TakeID?

  public init(id: BeatID, title: String, note: String = "", takes: [Take] = [], kept: TakeID? = nil)
  {
    self.id = id
    self.title = title
    self.note = note
    self.takes = takes
    self.kept = kept
  }

  public var keptTake: Take? { takes.first { $0.id == kept } }
}

/// A deleted beat and the position it is restored to.
public struct TrashedBeat: Codable, Hashable, Sendable {
  public var beat: Beat
  public var index: Int

  public init(beat: Beat, index: Int) {
    self.beat = beat
    self.index = index
  }
}

/// The undoable part of a project: the beats and the trash.
public struct Document: Codable, Hashable, Sendable {
  public var beats: [Beat]
  public var trash: [TrashedBeat]

  public init(beats: [Beat] = [], trash: [TrashedBeat] = []) {
    self.beats = beats
    self.trash = trash
  }
}

/// A project: its document and the sources it plays from; sources only grow and are never undone.
public struct Project: Codable, Hashable, Sendable {
  public var version: Int
  public var name: String
  public var document: Document
  public var sources: [SourceID: Source]

  public init(name: String, document: Document = Document(), sources: [SourceID: Source] = [:]) {
    self.version = Takes.projectVersion
    self.name = name
    self.document = document
    self.sources = sources
  }
}

/// A clip named by its beat, take and own id.
public struct ClipRef: Hashable, Sendable {
  public var beat: BeatID
  public var take: TakeID
  public var clip: ClipID

  public init(beat: BeatID, take: TakeID, clip: ClipID) {
    self.beat = beat
    self.take = take
    self.clip = clip
  }
}

/// A run of source frames that plays.
public struct Segment: Hashable, Sendable {
  public var source: SourceID
  public var range: Range<Int>

  public init(source: SourceID, range: Range<Int>) {
    self.source = source
    self.range = range
  }
}
