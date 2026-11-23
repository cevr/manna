import TakesCore
import Testing

@Test
func `the timeline lays segments end to end at the render rate and finds each frame's source`() {
  let a = SourceID("a")
  let b = SourceID("b")
  let plan = [
    Segment(source: a, range: 100..<1_100), Segment(source: b, range: 0..<2_001),
    Segment(source: a, range: 5_000..<5_010),
  ]
  let timeline = Timeline(plan: plan, rates: [a: 48_000, b: 96_000], rate: 48_000)
  #expect(timeline.placed.map(\.span) == [0..<1_000, 1_000..<2_001, 2_001..<2_011])
  #expect(timeline.frames == 2_011)
  #expect(timeline.locate(0)?.frame == 100)
  #expect(timeline.locate(999)?.frame == 1_099)
  #expect(timeline.locate(1_000)?.source == b)
  #expect(timeline.locate(1_500)?.frame == 1_000)
  #expect(timeline.locate(2_010)?.frame == 5_009)
  #expect(timeline.locate(2_011) == nil)
  #expect(timeline.frame(source: a, frame: 600) == 500)
  #expect(timeline.frame(source: b, frame: 1_000) == 1_500)
  #expect(timeline.frame(source: a, frame: 3_000) == nil)
}

@Test func `a take's plan is its clips' segments, kept or not`() throws {
  let id = SourceID("s")
  var project = Project(name: "p")
  project.sources[id] = Source(id: id, file: "audio/s.wav", rate: 100, frames: 100)
  let take = Take(
    id: TakeID("t"), name: "t", created: .distantPast,
    clips: [Clip(id: ClipID("c"), source: id, inPoint: 10, outPoint: 90, cuts: [40..<50])])
  try project.apply(.addBeat(Beat(id: BeatID("b"), title: "B", takes: [take]), at: nil))
  #expect(project.plan(beat: BeatID("b")).isEmpty)
  #expect(project.plan(of: take).map(\.range) == [10..<40, 50..<90])
}
