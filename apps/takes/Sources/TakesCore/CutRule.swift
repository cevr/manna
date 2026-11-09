/// Where a cut of selected words starts and ends.
///
/// Parakeet's words sit on an 80 ms grid, abut their neighbours and can overlap them. A cut takes
/// the selected words plus a pad of silence where the gap allows; where a neighbour abuts, it stops
/// at the neighbour; where a neighbour overlaps, it splits the overlap at its middle.
public enum CutRule {
  /// The pad a cut takes either side of its words when the gap allows: 30 ms.
  public static func pad(rate: Int) -> Int {
    Int((Double(rate) * 0.03).rounded())
  }

  /// The frames cutting words `selection` of `words` removes from a clip spanning `bounds`, or
  /// nothing when the selection's ends are not words in that span.
  public static func range(
    words: [Word], selection: ClosedRange<Int>, bounds: Range<Int>, pad: Int
  ) -> Range<Int>? {
    guard
      words.indices.contains(selection.lowerBound), words.indices.contains(selection.upperBound)
    else { return nil }
    let first = words[selection.lowerBound]
    let last = words[selection.upperBound]
    guard bounds.contains(first.midpoint), bounds.contains(last.midpoint) else { return nil }
    let left = leftEdge(
      of: first, after: neighbour(words, selection.lowerBound - 1, bounds), pad: pad)
    let right = rightEdge(
      of: last, before: neighbour(words, selection.upperBound + 1, bounds), pad: pad)
    let lower = max(left, bounds.lowerBound)
    let upper = min(right, bounds.upperBound)
    if let cut = Intervals.span(lower, upper) { return cut }
    return Intervals.clamp(first.start..<max(last.end, first.start + 1), to: bounds)
  }

  private static func neighbour(_ words: [Word], _ index: Int, _ bounds: Range<Int>) -> Word? {
    guard words.indices.contains(index), bounds.contains(words[index].midpoint) else { return nil }
    return words[index]
  }

  private static func leftEdge(of word: Word, after previous: Word?, pad: Int) -> Int {
    guard let previous else { return Int.min }
    if previous.end <= word.start { return max(word.start - pad, previous.end) }
    return (previous.end + word.start) / 2
  }

  private static func rightEdge(of word: Word, before next: Word?, pad: Int) -> Int {
    guard let next else { return Int.max }
    if word.end <= next.start { return min(word.end + pad, next.start) }
    return (word.end + next.start) / 2
  }
}
