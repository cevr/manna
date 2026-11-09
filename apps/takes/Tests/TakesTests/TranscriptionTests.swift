import Foundation
import TakesCore
import TakesTranscribe
import Testing

@Test(
  .enabled(
    if: ParakeetModels.present,
    "Parakeet models absent at ~/Library/Application Support/FluidAudio/Models/parakeet-tdt-0.6b-v3; transcription test skipped"
  ))
func `Parakeet hears the fixture's twelve words, each within a tenth of a second`() async throws {
  let transcript = await Transcriber().transcribe(try WordFixture.audio, rate: 48_000)
  let heard = try #require(transcript.words, "\(transcript)")
  let stored = try WordFixture.words
  #expect(heard.map(\.text) == stored.map(\.text))
  for (word, expected) in zip(heard, stored) {
    #expect(abs(word.start - expected.start) <= 4_800, "\(word) vs \(expected)")
    #expect(abs(word.end - expected.end) <= 4_800, "\(word) vs \(expected)")
  }
}

@Test func `without the models a take is still kept, its transcript plainly unavailable`()
  async throws
{
  let missing = URL(filePath: "/nonexistent/loop-probe-x/parakeet-tdt-0.6b-v3")
  let transcriber = Transcriber(directory: missing)
  let transcript = await transcriber.transcribe(try WordFixture.audio, rate: 48_000)
  #expect(
    transcript
      == .unavailable(
        "Parakeet models not found at /nonexistent/loop-probe-x/parakeet-tdt-0.6b-v3 — recording and editing still work"
      ))
  #expect(await transcriber.status == transcript.unavailableStatus)
}

extension Transcript {
  fileprivate var unavailableStatus: Transcriber.Status? {
    if case .unavailable(let message) = self { return .unavailable(message) }
    return nil
  }
}
