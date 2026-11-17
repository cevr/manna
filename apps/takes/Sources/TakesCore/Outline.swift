import Foundation

/// An outline in Markdown, read as beats: each `**N. Title.**` paragraph or `##` heading starts a
/// beat, and the text under it, up to the next, is its note. Text before the first is ignored.
public enum Outline {
  public struct Point: Hashable, Sendable {
    public var title: String
    public var note: String

    public init(title: String, note: String) {
      self.title = title
      self.note = note
    }
  }

  public static func points(_ markdown: String) -> [Point] {
    var points: [Point] = []
    var note: [String] = []
    func close() {
      guard !points.isEmpty else { return }
      points[points.count - 1].note = note.joined(separator: "\n")
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    for line in markdown.split(separator: "\n", omittingEmptySubsequences: false) {
      let text = String(line).trimmingCharacters(in: .whitespaces)
      if let heading = text.wholeMatch(of: /##\s+(.+)/) {
        close()
        points.append(Point(title: title(String(heading.1)), note: ""))
        note = []
      } else if let numbered = text.wholeMatch(of: /\*\*\d+\.\s+(.+?)\*\*\s*(.*)/) {
        close()
        points.append(Point(title: title(String(numbered.1)), note: ""))
        note = [String(numbered.2)]
      } else {
        note.append(String(line))
      }
    }
    close()
    return points
  }

  /// The outline's points as new beats.
  public static func beats(_ markdown: String, id: () -> BeatID = { .make() }) -> [Beat] {
    points(markdown).map { Beat(id: id(), title: $0.title, note: $0.note) }
  }

  private static func title(_ raw: String) -> String {
    var title = raw.trimmingCharacters(in: .whitespaces)
    while title.hasSuffix(".") { title.removeLast() }
    return title.trimmingCharacters(in: .whitespaces)
  }
}
