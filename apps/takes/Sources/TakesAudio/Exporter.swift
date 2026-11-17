import Foundation
import TakesCore

/// Writes a project's export: a WAV per beat with a kept take, and `script.md`.
public enum Exporter {
  /// `<project>/export/`, where Export writes by default.
  public static func defaultFolder(of project: URL) -> URL {
    project.appending(path: "export", directoryHint: .isDirectory)
  }

  /// The list, in an export folder, of the WAVs Takes last wrote there: a later export removes
  /// those no beat names any more, and never a file Takes did not write.
  public static let manifestName = ".takes-export.json"

  /// Renders each kept beat from its edits into `destination`, and writes the script beside them,
  /// then removes the WAVs an earlier export wrote there that no beat now names.
  /// Returns the files written, the WAVs in beat order then `script.md`.
  @discardableResult
  public static func export(_ project: Project, from folder: URL, to destination: URL) throws
    -> [URL]
  {
    try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
    let manifest = destination.appending(path: manifestName)
    let earlier = (try? JSONDecoder().decode([String].self, from: Data(contentsOf: manifest))) ?? []
    let files = Renderer.files(of: project, in: folder)
    var written: [URL] = []
    var names: [String] = []
    for (beat, name) in Script.files(project) {
      let url = destination.appending(path: name)
      try AudioFormat.writeWAV(Renderer.render(project.plan(beat: beat.id), files: files), to: url)
      written.append(url)
      names.append(name)
    }
    let script = destination.appending(path: Script.fileName)
    try Data(Script.markdown(project).utf8).write(to: script, options: .atomic)
    written.append(script)
    for stale in Set(earlier).subtracting(names) where isWAVName(stale) {
      try? FileManager.default.removeItem(at: destination.appending(path: stale))
    }
    try JSONEncoder().encode(names).write(to: manifest, options: .atomic)
    return written
  }

  /// A plain file name of a WAV, so a manifest can never name a path outside its folder.
  private static func isWAVName(_ name: String) -> Bool {
    !name.contains("/") && !name.hasPrefix(".") && name.hasSuffix(".wav")
  }

  /// Copies an audio file into the project's `audio/` as a new source, its transcript pending.
  public static func importAudio(_ url: URL, into folder: URL, id: SourceID = .make()) throws
    -> Source
  {
    let info = try AudioReader.info(url)
    let file = Names.sourceFile(id: id, extension: url.pathExtension)
    let target = folder.appending(path: file)
    try FileManager.default.createDirectory(
      at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
    try FileManager.default.copyItem(at: url, to: target)
    return Source(id: id, file: file, rate: info.rate, frames: info.frames, transcript: .pending)
  }
}
