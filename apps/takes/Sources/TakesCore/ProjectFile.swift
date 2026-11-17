import Foundation

/// A project on disk: a folder with `project.json` and the `audio/` the sources live in.
public enum ProjectFile {
  public static let fileName = "project.json"
  public static let audioFolder = "audio"

  public enum Failure: Error, Hashable, Sendable {
    case unsupportedVersion(Int)
  }

  /// `~/Documents/Takes/<name>/`, where a new project goes by default.
  public static func defaultFolder(name: String) -> URL {
    FileManager.default.homeDirectoryForCurrentUser
      .appending(path: "Documents/Takes", directoryHint: .isDirectory)
      .appending(path: name, directoryHint: .isDirectory)
  }

  /// The project as `project.json` holds it: pretty-printed, keys sorted, dates in ISO 8601.
  public static func encode(_ project: Project) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .iso8601
    return try encoder.encode(project)
  }

  public static func decode(_ data: Data) throws -> Project {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let project = try decoder.decode(Project.self, from: data)
    guard project.version == Takes.projectVersion else {
      throw Failure.unsupportedVersion(project.version)
    }
    return project
  }

  /// Writes `project.json` in one atomic replace, making the folder and its `audio/` first.
  public static func save(_ project: Project, in folder: URL) throws {
    try FileManager.default.createDirectory(
      at: folder.appending(path: audioFolder, directoryHint: .isDirectory),
      withIntermediateDirectories: true)
    try encode(project).write(to: folder.appending(path: fileName), options: .atomic)
  }

  public static func load(from folder: URL) throws -> Project {
    try decode(Data(contentsOf: folder.appending(path: fileName)))
  }

  /// The URL of a source's audio file inside a project folder.
  public static func audioURL(of source: Source, in folder: URL) -> URL {
    folder.appending(path: source.file)
  }
}
