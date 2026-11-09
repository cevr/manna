import Foundation
import TakesCore

/// A small seeded generator, so every generated case can be replayed from its seed.
struct SplitMix64: RandomNumberGenerator {
  private var state: UInt64

  init(seed: UInt64) {
    state = seed
  }

  mutating func next() -> UInt64 {
    state &+= 0x9E37_79B9_7F4A_7C15
    var z = state
    z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
    z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
    return z ^ (z >> 31)
  }

  mutating func int(_ range: ClosedRange<Int>) -> Int {
    Int.random(in: range, using: &self)
  }

  mutating func chance(_ probability: Double) -> Bool {
    Double.random(in: 0..<1, using: &self) < probability
  }

  mutating func pick<T>(_ items: [T]) -> T? {
    items.randomElement(using: &self)
  }
}

/// The seeds a generated test runs: fixed, so a failure names the seed that replays it.
func seeds(_ count: Int, salt: UInt64 = 0) -> [UInt64] {
  (0..<UInt64(count)).map { $0 &* 0x1000_0001 &+ salt }
}

/// Words as Parakeet emits them: on a grid, starts and ends rising, each word abutting, overlapping
/// or leaving a gap to the one before, and overlapping no word but its neighbours.
func generateWords(_ random: inout SplitMix64, count: Int, grid: Int, from start: Int = 0) -> [Word]
{
  var words: [Word] = []
  var cursor = start
  for index in 0..<count {
    let previousEnd = words.last?.end ?? start
    let beforePrevious = words.count >= 2 ? words[words.count - 2].end : start
    var wordStart = cursor
    switch random.int(0...2) {
    case 0: wordStart = previousEnd + grid * random.int(1...3)
    case 1: wordStart = previousEnd
    default:
      if let last = words.last {
        wordStart = max(beforePrevious, last.start + grid, previousEnd - grid * random.int(1...2))
      }
    }
    if index == 0 { wordStart = start + grid * random.int(0...2) }
    let wordEnd = max(wordStart + grid * random.int(1...4), previousEnd)
    words.append(Word(text: "w\(index)", start: wordStart, end: wordEnd))
    cursor = wordEnd
  }
  return words
}
