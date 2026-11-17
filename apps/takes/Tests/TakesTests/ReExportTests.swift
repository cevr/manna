import Foundation
import TakesAudio
import TakesCore
import Testing

@Test func `a re-export leaves one WAV per kept beat and every file Takes did not write`() throws {
  let scratch = try Scratch()
  let folder = scratch.url.appending(path: "project")
  let audio = try Exporter.importAudio(WordFixture.audio, into: folder, id: SourceID("w"))
  for seed in seeds(40, salt: 13) {
    var random = SplitMix64(seed: seed)
    var project = Project(name: "p", sources: [audio.id: audio])
    let titles = ["Hook", "Body", "Turn", "Close"]
    for (index, title) in titles.prefix(random.int(1...4)).enumerated() {
      let take = Take(
        id: TakeID("t\(index)"), name: "t", created: .distantPast,
        clips: [
          Clip(
            id: ClipID("c\(index)"), source: audio.id, inPoint: index * 480,
            outPoint: index * 480 + 480)
        ])
      try project.apply(
        .addBeat(Beat(id: BeatID("b\(index)"), title: title, takes: [take], kept: take.id), at: nil)
      )
    }
    let export = scratch.url.appending(path: "export-\(seed)")
    try FileManager.default.createDirectory(at: export, withIntermediateDirectories: true)
    let mine = ["99-mine.wav", "notes.txt"]
    for name in mine { try Data("mine".utf8).write(to: export.appending(path: name)) }
    var log: [String] = []
    for _ in 0..<5 {
      try Exporter.export(project, from: folder, to: export)
      let present = try FileManager.default.contentsOfDirectory(
        atPath: export.path(percentEncoded: false))
      let wavs = Set(present.filter { $0.hasSuffix(".wav") }).subtracting(mine)
      #expect(wavs == Set(Script.files(project).map(\.file)), "seed \(seed): \(log)")
      #expect(Set(mine).isSubset(of: present), "seed \(seed): \(log)")
      guard let beat = random.pick(project.document.beats) else { break }
      let edit: Edit =
        switch random.int(0...4) {
        case 0: .renameBeat(beat.id, "Renamed \(random.int(0...99))")
        case 1: .moveBeats(offsets: [0], to: project.document.beats.count)
        case 2: .deleteBeat(beat.id)
        case 3: .setKept(beat.id, nil)
        default: .setKept(beat.id, beat.takes.first?.id)
        }
      try project.apply(edit)
      log.append("\(edit)")
    }
  }
}
