import Foundation
import TakesAudio
import TakesCore
import TakesTranscribe
import Testing

@testable import TakesApp

@MainActor
@Test func `the app imports an outline and a take, cuts a selected word and exports without it`()
  async throws
{
  let scratch = try Scratch()
  let folder = scratch.url.appending(path: "proj", directoryHint: .isDirectory)
  let missing = URL(filePath: "/nonexistent/loop-probe-x/parakeet-tdt-0.6b-v3")
  let model = AppModel(transcriber: Transcriber(directory: missing))
  model.open(folder)
  #expect(model.hasProject && model.project.name == "proj")
  let outline = try #require(
    Bundle.module.url(forResource: "outline", withExtension: "md", subdirectory: "Fixtures"))
  model.importOutline(outline)
  #expect(model.beats.map(\.title) == ["Hook", "Body", "Close"])
  model.select(beat: model.beats[0].id)

  let source = try #require(await model.importing(try WordFixture.audio))
  await model.transcribed(source.id)
  #expect(model.parakeetText.hasPrefix("Parakeet models not found at /nonexistent/loop-probe-x"))
  #expect(model.project.sources[source.id]?.transcript.words == nil)
  let take = try #require(model.take)
  #expect(model.beat?.kept == take.id)

  model.land(.done(try WordFixture.words), for: source.id)
  let ref = ClipRef(beat: model.beats[0].id, take: take.id, clip: take.clips[0].id)
  model.selection = .words(ref, 2...2)
  let cut = try model.project.wordRange(ref, 2...2)
  model.cut()
  let files = await model.exporting()
  #expect(files.map(\.lastPathComponent) == ["01-hook.wav", "script.md"])
  #expect(try AudioReader.info(files[0]).frames == source.frames - cut.count)
  #expect(try !String(contentsOf: files[1], encoding: .utf8).contains("beginning"))

  model.undo()
  await model.exporting()
  #expect(try AudioReader.info(files[0]).frames == source.frames)
  model.save()
  #expect(try ProjectFile.load(from: folder) == model.project)
}
