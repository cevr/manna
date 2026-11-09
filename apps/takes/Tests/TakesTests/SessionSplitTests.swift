import Foundation
import TakesCore
import Testing

private let rate = 1_000

private func noise(_ random: inout SplitMix64, frames: Int) -> [Float] {
  (0..<frames).map { _ in
    let level = Float.random(in: 0.2...1, using: &random)
    return random.chance(0.5) ? level : -level
  }
}

@Test func `a split lands in the silence near each press`() {
  for seed in seeds(200, salt: 5) {
    var random = SplitMix64(seed: seed)
    let count = random.int(1...6)
    var markers: [Int] = []
    var cursor = rate * 2
    for _ in 0..<count {
      markers.append(cursor)
      cursor += random.int((rate * 6 / 5)...(rate * 4))
    }
    var samples = noise(&random, frames: cursor + rate)
    var gaps: [Range<Int>] = []
    for marker in markers {
      let gap = marker + random.int(-(rate * 45 / 100)...(rate * 45 / 100 - rate / 25))
      let range = gap..<(gap + rate / 25)
      for index in range { samples[index] = 0 }
      gaps.append(range)
    }
    let presses = markers.map { $0 + random.int(-(rate / 20)...(rate / 20)) }
    let points = SessionSplit.points(samples: samples, rate: rate, markers: presses)
    let context = "seed \(seed) presses \(presses) gaps \(gaps) points \(points)"
    #expect(points.count == presses.count, "\(context)")
    for (point, gap) in zip(points, gaps) {
      #expect(gap.contains(point), "\(context)")
    }
  }
}

@Test func `split points rise strictly and stay within half a second of their press`() {
  for seed in seeds(200, salt: 9) {
    var random = SplitMix64(seed: seed)
    let frames = random.int((rate / 2)...(rate * 6))
    let samples = noise(&random, frames: frames)
    let presses = (0..<random.int(1...8)).map { _ in random.int(1...(frames - 1)) }.sorted()
    let points = SessionSplit.points(samples: samples, rate: rate, markers: presses)
    let context = "seed \(seed) frames \(frames) presses \(presses) points \(points)"
    #expect(points.count <= presses.count, "\(context)")
    #expect(zip(points, points.dropFirst()).allSatisfy { $0 < $1 }, "\(context)")
    #expect(points.allSatisfy { $0 > 0 && $0 < frames }, "\(context)")
    if presses.count < 2 || zip(presses, presses.dropFirst()).allSatisfy({ $1 - $0 > rate + 2 }) {
      #expect(points.count == presses.count, "\(context)")
      for (point, press) in zip(points, presses) {
        #expect(abs(point - press) <= rate / 2, "\(context)")
      }
    }
  }
}

@Test func `segments go to the beats in order, extra ones make new beats, a sliver makes no take`()
  throws
{
  var project = Project(name: "p")
  for title in ["Hook", "Body", "Close"] {
    try project.apply(.addBeat(Beat(id: BeatID(title), title: title), at: nil))
  }
  let source = Source(id: SourceID("s"), file: "audio/s.wav", rate: rate, frames: rate * 10)
  project.sources[source.id] = source
  var counter = 0
  let edit = SessionSplit.edit(
    project: project, source: source, points: [rate * 3, rate * 6, rate * 9, rate * 10 - 10],
    startBeat: BeatID("Body"), name: "Session", created: Date(timeIntervalSince1970: 0)
  ) {
    counter += 1
    return (BeatID("new\(counter)"), TakeID("t\(counter)"), ClipID("c\(counter)"))
  }
  try project.apply(edit)
  #expect(project.document.beats.map(\.title) == ["Hook", "Body", "Close", "Beat 4", "Beat 5"])
  #expect(project.plan(beat: BeatID("Hook")).isEmpty)
  #expect(project.plan(beat: BeatID("Body")).map(\.range) == [0..<(rate * 3)])
  #expect(project.plan(beat: BeatID("Close")).map(\.range) == [(rate * 3)..<(rate * 6)])
  #expect(project.plan(beat: BeatID("new3")).map(\.range) == [(rate * 6)..<(rate * 9)])
  #expect(project.plan(beat: BeatID("new4")).map(\.range) == [(rate * 9)..<(rate * 10 - 10)])
  #expect(project.document.beats.count == 5)
}
