import Foundation
import TakesCore
import Testing

@Test func `numbered bold paragraphs become beats, on their own line or inline`() throws {
  let url = try #require(
    Bundle.module.url(forResource: "outline", withExtension: "md", subdirectory: "Fixtures"))
  let points = Outline.points(try String(contentsOf: url, encoding: .utf8))
  #expect(
    points == [
      .init(title: "Hook", note: "Open on the question nobody asks."),
      .init(title: "Body", note: "Walk the text in its order.\nSay why the order matters."),
      .init(title: "Close", note: "Land the point."),
    ])
}

@Test func `a numbered title on its own line takes the paragraphs under it as its note`() {
  let markdown = "Preamble to skip.\n\n**1. The Hook.**\n\nFirst line.\n\nSecond paragraph.\n"
  #expect(
    Outline.points(markdown) == [.init(title: "The Hook", note: "First line.\n\nSecond paragraph.")]
  )
}

@Test func `level-two headings become beats, and mix with numbered paragraphs`() {
  let markdown = """
    # Title, ignored
    intro, ignored
    ## Opening.
    Say hello.
    ### a sub-heading stays in the note
    **2. Middle.** The middle.
    ## End
    """
  #expect(
    Outline.points(markdown) == [
      .init(title: "Opening", note: "Say hello.\n### a sub-heading stays in the note"),
      .init(title: "Middle", note: "The middle."),
      .init(title: "End", note: ""),
    ])
}

@Test func `an outline with no beats gives none, and its beats get fresh ids`() {
  #expect(Outline.points("just text\n\nmore").isEmpty)
  var counter = 0
  let beats = Outline.beats("## A\n## B") {
    counter += 1
    return BeatID("b\(counter)")
  }
  #expect(beats.map(\.id) == [BeatID("b1"), BeatID("b2")])
  #expect(beats.map(\.title) == ["A", "B"])
}
