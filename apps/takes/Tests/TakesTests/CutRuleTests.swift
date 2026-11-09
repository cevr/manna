import TakesCore
import Testing

/// A word's own frames: its span less what it shares with the words either side.
private func core(_ words: [Word], _ index: Int) -> Range<Int> {
  let word = words[index]
  let lower = max(word.start, index > 0 ? words[index - 1].end : word.start)
  let upper = min(word.end, index + 1 < words.count ? words[index + 1].start : word.end)
  return lower..<max(lower, upper)
}

private func meets(_ range: Range<Int>, _ other: Range<Int>) -> Bool {
  !other.isEmpty && range.overlaps(other)
}

@Test func `a cut covers its words, spares the others and takes the pad the gap allows`() {
  for seed in seeds(2_000, salt: 7) {
    var random = SplitMix64(seed: seed)
    let grid = random.int(4...12)
    let pad = random.int(1...(grid * 2))
    let words = generateWords(&random, count: random.int(1...12), grid: grid, from: grid * 3)
    let bounds = 0..<(words.map(\.end).max()! + grid * random.int(0...3))
    let first = random.int(0...(words.count - 1))
    let last = random.int(first...(words.count - 1))
    let context = "seed \(seed) words \(words) selection \(first)...\(last) pad \(pad)"
    guard let cut = CutRule.range(words: words, selection: first...last, bounds: bounds, pad: pad)
    else {
      Issue.record("no cut: \(context)")
      continue
    }
    #expect(!cut.isEmpty, "\(context)")
    #expect(
      cut.lowerBound >= bounds.lowerBound && cut.upperBound <= bounds.upperBound, "\(context)")
    for index in first...last {
      let own = core(words, index)
      #expect(
        own.isEmpty || (cut.lowerBound <= own.lowerBound && own.upperBound <= cut.upperBound),
        "word \(index) core \(own) cut \(cut) \(context)")
    }
    for index in words.indices where !(first...last).contains(index) {
      #expect(!meets(cut, core(words, index)), "word \(index) entered by \(cut): \(context)")
    }
    let before = first > 0 ? words[first - 1].end : Int.min
    if words[first].start - pad >= before, words[first].start - pad >= bounds.lowerBound,
      first > 0
    {
      #expect(cut.lowerBound == words[first].start - pad, "left pad: \(context)")
    }
    if last + 1 < words.count, words[last].end + pad <= words[last + 1].start {
      #expect(cut.upperBound == words[last].end + pad, "right pad: \(context)")
    }
  }
}

@Test func `the measured Parakeet words cut cleanly at their abutting and overlapping edges`()
  throws
{
  let seconds: [(String, Double, Double)] = [
    ("In", 0.00, 0.24), ("the", 0.16, 0.24), ("beginning", 0.24, 0.64), ("was", 0.64, 0.80),
  ]
  let words = seconds.map { Word(text: $0.0, start: Int($0.1 * 48_000), end: Int($0.2 * 48_000)) }
  let bounds = 0..<(48_000 * 3)
  let pad = CutRule.pad(rate: 48_000)
  #expect(pad == 1_440)
  #expect(
    CutRule.range(words: words, selection: 2...2, bounds: bounds, pad: pad) == 11_520..<30_720)
  #expect(CutRule.range(words: words, selection: 1...1, bounds: bounds, pad: pad) == 9_600..<11_520)
  #expect(CutRule.range(words: words, selection: 0...0, bounds: bounds, pad: pad) == 0..<9_600)
  #expect(
    CutRule.range(words: words, selection: 3...3, bounds: 0..<36_000, pad: pad) == 30_720..<36_000)
  #expect(CutRule.range(words: words, selection: 3...3, bounds: 0..<20_000, pad: pad) == nil)
  #expect(CutRule.range(words: words, selection: 3...9, bounds: bounds, pad: pad) == nil)
}
