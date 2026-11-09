import Foundation

/// Where the Parakeet TDT 0.6B v3 models Hex downloaded live; Takes only reads them.
public enum ParakeetModels {
  public static var directory: URL {
    FileManager.default.homeDirectoryForCurrentUser
      .appending(path: "Library/Application Support/FluidAudio/Models/parakeet-tdt-0.6b-v3")
  }

  /// The model folder is there; a missing file inside it still shows when the models load.
  public static var present: Bool { exists(directory) }

  static func exists(_ directory: URL) -> Bool {
    FileManager.default.fileExists(atPath: directory.path(percentEncoded: false))
  }

  /// What the app says when the models cannot load: recording and editing go on without them.
  public static func absentMessage(_ directory: URL, detail: String = "") -> String {
    let path = directory.path(percentEncoded: false)
    let tail = detail.isEmpty ? "" : " (\(detail))"
    return "Parakeet models not found at \(path)\(tail) — recording and editing still work"
  }
}
