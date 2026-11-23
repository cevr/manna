import Foundation
import TakesAudio
import TakesCore
import Testing

/// The fixture: `say` reading John 1:1, 48 kHz 16-bit mono, with the words Parakeet heard in it.
enum WordFixture {
  static var audio: URL {
    get throws {
      try #require(
        Bundle.module.url(forResource: "word", withExtension: "wav", subdirectory: "Fixtures"))
    }
  }

  static var words: [Word] {
    get throws {
      let url = try #require(
        Bundle.module.url(
          forResource: "word.words", withExtension: "json", subdirectory: "Fixtures"))
      return try JSONDecoder().decode([Word].self, from: Data(contentsOf: url))
    }
  }
}

@Test func `import, cut a word, export: the WAV is shorter by the cut and the script lacks it`()
  throws
{
  let scratch = try Scratch()
  let folder = scratch.url.appending(path: "project")
  var editor = Editor(project: Project(name: "John"))
  try editor.apply(.batch(Outline.beats("**1. Hook.** The Word.").map { .addBeat($0, at: nil) }))
  let hook = try #require(editor.project.document.beats.first)
  let source = try Exporter.importAudio(WordFixture.audio, into: folder)
  editor.add(source)
  #expect(source.rate == 48_000 && source.frames == 136_946)
  #expect(
    FileManager.default.contentsEqual(
      atPath: try WordFixture.audio.path(percentEncoded: false),
      andPath: ProjectFile.audioURL(of: source, in: folder).path(percentEncoded: false)))
  try editor.apply(
    .take(of: source, on: hook.id, in: editor.project, name: "Take 1", created: Date()))
  editor.land(.done(try WordFixture.words), for: source.id)
  let take = try #require(editor.project.document.beats.first?.keptTake)
  let ref = ClipRef(beat: hook.id, take: take.id, clip: take.clips[0].id)
  let words = try WordFixture.words
  #expect(words[2].text == "beginning")
  let cut = try editor.project.wordRange(ref, 2...2)
  try editor.apply(.cutWords(ref, 2...2))
  try ProjectFile.save(editor.project, in: folder)

  let export = Exporter.defaultFolder(of: folder)
  let files = try Exporter.export(editor.project, from: folder, to: export)
  #expect(files.map(\.lastPathComponent) == ["01-hook.wav", "script.md"])
  let info = try AudioReader.info(export.appending(path: "01-hook.wav"))
  #expect(info.rate == 48_000 && info.channels == 1)
  #expect(info.frames == source.frames - cut.count)
  let script = try String(contentsOf: export.appending(path: "script.md"), encoding: .utf8)
  #expect(!script.contains("beginning"))
  #expect(script.contains("In the was the Word, and the Word was with God."))

  editor.undo()
  try Exporter.export(editor.project, from: folder, to: export)
  #expect(try AudioReader.info(export.appending(path: "01-hook.wav")).frames == source.frames)
  #expect(
    FileManager.default.contentsEqual(
      atPath: try WordFixture.audio.path(percentEncoded: false),
      andPath: ProjectFile.audioURL(of: source, in: folder).path(percentEncoded: false)))
}
