import Foundation
import TakesCore
import Testing

private func generateProject(_ random: inout SplitMix64) -> Project {
  var sources: [SourceID: Source] = [:]
  for index in 0..<random.int(0...3) {
    let id = SourceID("s\(index)")
    let transcripts: [Transcript] = [
      .none, .pending, .unavailable("models absent é \"quoted\""),
      .done(generateWords(&random, count: random.int(0...5), grid: 3)),
    ]
    sources[id] = Source(
      id: id, file: "audio/s\(index).wav", rate: random.pick([44_100, 48_000, 96_000])!,
      frames: random.int(1...1_000_000), transcript: random.pick(transcripts)!)
  }
  let ids = Array(sources.keys)
  func beat(_ index: Int) -> Beat {
    var takes: [Take] = []
    for take in 0..<random.int(0...2) {
      let clips = (0..<random.int(0...2)).compactMap { clip -> Clip? in
        guard let source = random.pick(ids) else { return nil }
        let lower = random.int(0...500)
        let upper = lower + random.int(1...500)
        return Clip(
          id: ClipID("c\(index)-\(take)-\(clip)"), source: source, inPoint: lower,
          outPoint: upper, cuts: [(lower + 1)..<(lower + 1 + random.int(0...(upper - lower - 1)))])
      }
      takes.append(
        Take(
          id: TakeID("t\(index)-\(take)"), name: "Take \(take + 1)",
          created: Date(timeIntervalSince1970: Double(random.int(0...2_000_000_000))), clips: clips)
      )
    }
    return Beat(
      id: BeatID("b\(index)"), title: "Beat \(index) — ünïcode", note: "line one\nline two",
      takes: takes, kept: random.pick(takes)?.id)
  }
  let beats = (0..<random.int(0...4)).map(beat)
  let trash = (0..<random.int(0...2)).map { TrashedBeat(beat: beat(10 + $0), index: $0) }
  return Project(
    name: "Project \(random.int(0...99))", document: Document(beats: beats, trash: trash),
    sources: sources)
}

@Test func `a project encodes and decodes to itself`() throws {
  for seed in seeds(200, salt: 3) {
    var random = SplitMix64(seed: seed)
    let project = generateProject(&random)
    #expect(try ProjectFile.decode(ProjectFile.encode(project)) == project, "seed \(seed)")
  }
}

@Test func `the version 1 project file decodes as written`() throws {
  let url = try #require(
    Bundle.module.url(forResource: "project-v1", withExtension: "json", subdirectory: "Fixtures"))
  let data = try Data(contentsOf: url)
  let project = try ProjectFile.decode(data)
  let source = SourceID("5b1c2d7e")
  let clip = Clip(
    id: ClipID("c1"), source: source, inPoint: 0, outPoint: 136_800, cuts: [11_520..<30_720])
  let take = Take(
    id: TakeID("t1"), name: "Take 1", created: Date(timeIntervalSince1970: 1_793_620_800),
    clips: [clip])
  let expected = Project(
    name: "In Its Order",
    document: Document(
      beats: [
        Beat(
          id: BeatID("b1"), title: "Hook", note: "Open on the question.", takes: [take],
          kept: take.id)
      ],
      trash: [TrashedBeat(beat: Beat(id: BeatID("b2"), title: "Old"), index: 1)]),
    sources: [
      source: Source(
        id: source, file: "audio/5b1c2d7e.wav", rate: 48_000, frames: 136_800,
        transcript: .done([
          Word(text: "In", start: 0, end: 11_520), Word(text: "the", start: 7_680, end: 11_520),
        ]))
    ])
  #expect(project == expected)
  let written =
    try JSONSerialization.jsonObject(with: ProjectFile.encode(expected)) as? NSDictionary
  let golden = try JSONSerialization.jsonObject(with: data) as? NSDictionary
  #expect(written == golden)
}

@Test func `a later version is refused, not misread`() throws {
  let data = Data(
    #"{"version": 2, "name": "x", "document": {"beats": [], "trash": []}, "sources": {}}"#.utf8)
  #expect(throws: ProjectFile.Failure.unsupportedVersion(2)) { try ProjectFile.decode(data) }
}

@Test func `saving writes project.json in place and leaves no temporary file`() throws {
  let folder = FileManager.default.temporaryDirectory.appending(path: "takes-\(UUID().uuidString)")
  defer { try? FileManager.default.removeItem(at: folder) }
  var random = SplitMix64(seed: 1)
  let first = generateProject(&random)
  let second = generateProject(&random)
  try ProjectFile.save(first, in: folder)
  try ProjectFile.save(second, in: folder)
  #expect(try ProjectFile.load(from: folder) == second)
  let entries = try FileManager.default.contentsOfDirectory(
    atPath: folder.path(percentEncoded: false))
  #expect(entries.sorted() == ["audio", "project.json"])
}
