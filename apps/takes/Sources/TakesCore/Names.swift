import Foundation

/// The names exported files take.
public enum Names {
  /// A title as a file name: lowercased, accents folded, every run of other characters one `-`.
  public static func slug(_ title: String) -> String {
    let folded = title.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
      .lowercased()
    var slug = ""
    var dash = false
    for scalar in folded.unicodeScalars {
      if ("a"..."z").contains(scalar) || ("0"..."9").contains(scalar) {
        if dash, !slug.isEmpty { slug.append("-") }
        slug.unicodeScalars.append(scalar)
        dash = false
      } else {
        dash = true
      }
    }
    return slug.isEmpty ? "beat" : slug
  }

  /// `01-hook.wav`: the beat's 1-based position, two digits, then its slug.
  public static func beatFile(position: Int, title: String) -> String {
    "\(String(format: "%02d", position))-\(slug(title)).wav"
  }

  /// The audio file a new source is copied or recorded to, relative to the project folder.
  public static func sourceFile(id: SourceID, extension ext: String) -> String {
    let suffix = ext.isEmpty ? "" : ".\(ext.lowercased())"
    return "\(ProjectFile.audioFolder)/\(id.rawValue)\(suffix)"
  }
}
