/// Undo and redo as stacks of whole documents.
public struct History: Hashable, Sendable {
  public static let limit = 200

  public private(set) var past: [Document] = []
  public private(set) var future: [Document] = []

  public init() {}

  public var canUndo: Bool { !past.isEmpty }
  public var canRedo: Bool { !future.isEmpty }

  /// Remembers the document an edit is about to replace, and forgets what was undone.
  public mutating func record(_ document: Document) {
    past.append(document)
    if past.count > Self.limit { past.removeFirst(past.count - Self.limit) }
    future.removeAll()
  }

  /// The document before `current`, remembering `current` for redo.
  public mutating func undo(from current: Document) -> Document? {
    guard let previous = past.popLast() else { return nil }
    future.append(current)
    return previous
  }

  /// The document undone from `current`, remembering `current` for undo.
  public mutating func redo(from current: Document) -> Document? {
    guard let next = future.popLast() else { return nil }
    past.append(current)
    return next
  }
}

/// A project with its history: edits are undoable; sources and transcripts are not.
public struct Editor: Hashable, Sendable {
  public private(set) var project: Project
  public private(set) var history = History()

  public init(project: Project) {
    self.project = project
  }

  /// Applies an edit as one undo step; an edit that changes nothing leaves no step.
  public mutating func apply(_ edit: Edit) throws(EditError) {
    var next = project
    try next.apply(edit)
    guard next.document != project.document else { return }
    history.record(project.document)
    project = next
  }

  public mutating func undo() {
    if let document = history.undo(from: project.document) { project.document = document }
  }

  public mutating func redo() {
    if let document = history.redo(from: project.document) { project.document = document }
  }

  /// Adds a source; an undone edit that used it leaves it in place for redo.
  public mutating func add(_ source: Source) {
    project.sources[source.id] = source
  }

  /// Lands a source's transcript, whatever the history holds.
  public mutating func land(_ transcript: Transcript, for source: SourceID) {
    project.sources[source]?.transcript = transcript
  }
}
