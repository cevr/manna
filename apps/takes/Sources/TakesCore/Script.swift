/// `script.md`: the beats in order, each with the words its edited audio says.
public enum Script {
  public static let fileName = "script.md"

  public static func markdown(_ project: Project) -> String {
    var lines = ["# \(project.name)", ""]
    for (offset, beat) in project.document.beats.enumerated() {
      lines.append("## \(offset + 1). \(beat.title)")
      lines.append("")
      if beat.keptTake == nil {
        lines.append("_(no take)_")
      } else {
        let words = project.words(of: project.plan(beat: beat.id)).map(\.text)
        lines.append(words.isEmpty ? "_(no words)_" : words.joined(separator: " "))
      }
      lines.append("")
    }
    return lines.joined(separator: "\n")
  }

  /// The WAV each beat with a kept take exports to, by beat: `01-hook.wav`.
  public static func files(_ project: Project) -> [(beat: Beat, file: String)] {
    project.document.beats.enumerated().compactMap { offset, beat in
      guard beat.keptTake != nil else { return nil }
      return (beat, Names.beatFile(position: offset + 1, title: beat.title))
    }
  }
}
