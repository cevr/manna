import AppKit
import SwiftUI
import TakesAudio
import TakesCore

/// A take's clips, each as its words over its waveform. Bare keys act here only, while the editor
/// has focus, so they never reach a text field: ⌫ cuts, Space plays, R records. → (next beat in
/// a session take) is the Record menu's Next Beat, so it works whatever the window shows.
struct TakeEditor: View {
  let model: AppModel
  let beat: Beat
  let take: Take
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text(take.name).font(.headline)
        Spacer()
        Button("Cut", systemImage: "scissors") { model.cut() }
          .disabled(model.selection == nil)
          .accessibilityIdentifier("cut")
          .help("Cut the selection (⌫)")
        Button("Restore", systemImage: "arrow.uturn.backward") { model.restore() }
          .disabled(model.selection == nil)
          .accessibilityIdentifier("restore")
        Menu("Move to") { targets(move: true) }
          .disabled(!hasWords)
          .fixedSize()
        Menu("Copy to") { targets(move: false) }
          .disabled(!hasWords)
          .fixedSize()
      }
      ForEach(take.clips) { clip in
        ClipEditor(
          model: model, ref: ClipRef(beat: beat.id, take: take.id, clip: clip.id), clip: clip,
          focus: { focused = true })
      }
    }
    .padding(12)
    .background(.background.secondary, in: .rect(cornerRadius: 10))
    .focusable()
    .focusEffectDisabled()
    .focused($focused)
    .onKeyPress(keys: [.delete, .deleteForward, .space, "r"]) { press in
      switch press.key {
      case .delete, .deleteForward: model.cut()
      case .space: model.togglePlay()
      default: model.toggleRecording(session: false)
      }
      return .handled
    }
    .onTapGesture { focused = true }
  }

  private var hasWords: Bool {
    if case .words = model.selection { return true }
    return false
  }

  @ViewBuilder private func targets(move: Bool) -> some View {
    ForEach(Array(model.beats.enumerated()), id: \.element.id) { index, target in
      Button("\(index + 1). \(target.title)") { model.send(to: target.id, move: move) }
    }
  }
}

struct ClipEditor: View {
  let model: AppModel
  let ref: ClipRef
  let clip: Clip
  let focus: () -> Void

  private var source: Source? { model.project.sources[clip.source] }

  private var playing: Bool {
    model.playback?.kind == .take(ref.take)
  }

  var body: some View {
    TimelineView(.animation(paused: !playing)) { _ in
      let head = playHead
      VStack(alignment: .leading, spacing: 8) {
        transcript(head: head)
        Waveform(
          model: model, ref: ref, clip: clip, frames: source?.frames ?? clip.outPoint,
          peaks: model.peaks(for: clip.source), selected: selectedFrames, head: head,
          focus: focus)
      }
    }
  }

  /// The source frame the play head is at, when it is in this clip.
  private var playHead: Int? {
    guard playing, let frame = model.position, let timeline = model.playback?.timeline,
      let place = timeline.locate(frame), place.source == clip.source,
      clip.bounds.contains(place.frame)
    else { return nil }
    return place.frame
  }

  private var selectedFrames: Range<Int>? {
    switch model.selection {
    case .words(let selected, let words) where selected == ref:
      try? model.project.wordRange(ref, words)
    case .frames(let selected, let frames) where selected == ref: frames
    default: nil
    }
  }

  @ViewBuilder private func transcript(head: Int?) -> some View {
    switch source?.transcript ?? .none {
    case .none: Text("No transcript").foregroundStyle(.secondary)
    case .pending: Text("Transcribing…").foregroundStyle(.secondary)
    case .unavailable(let reason): Text(reason).foregroundStyle(.secondary)
    case .done(let words):
      FlowLayout(spacing: 4) {
        ForEach(clip.wordIndices(words), id: \.self) { index in
          WordButton(
            word: words[index], struck: clip.isStruck(words[index]),
            selected: isSelected(index),
            current: head.map { words[index].start <= $0 && $0 < words[index].end } ?? false
          ) {
            select(index)
          }
          .accessibilityIdentifier("word-\(index)")
        }
      }
    }
  }

  private func isSelected(_ index: Int) -> Bool {
    guard case .words(let selected, let words) = model.selection, selected == ref else {
      return false
    }
    return words.contains(index)
  }

  private func select(_ index: Int) {
    focus()
    if NSEvent.modifierFlags.contains(.shift),
      case .words(let selected, let words) = model.selection, selected == ref
    {
      model.selection = .words(
        ref, min(words.lowerBound, index)...max(words.upperBound, index))
    } else {
      model.selection = .words(ref, index...index)
    }
  }
}

struct WordButton: View {
  let word: Word
  let struck: Bool
  let selected: Bool
  let current: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(word.text)
        .strikethrough(struck)
        .foregroundStyle(foreground)
        .padding(.horizontal, 3)
        .padding(.vertical, 1)
        .background(background, in: .rect(cornerRadius: 4))
    }
    .buttonStyle(.plain)
    .font(.title3)
    .accessibilityLabel(word.text)
    .accessibilityValue(accessibilityState)
  }

  private var foreground: Color {
    if current { return .red }
    if struck { return .secondary }
    return .primary
  }

  private var background: Color {
    if selected { return .accentColor.opacity(0.3) }
    return .clear
  }

  private var accessibilityState: String {
    if struck { return "cut" }
    return ""
  }
}

/// Lays its children out in rows, wrapping at the proposed width.
struct FlowLayout: Layout {
  var spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
    let width = rows.map(\.width).max() ?? 0
    let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    for row in arrange(width: bounds.width, subviews: subviews) {
      var x = bounds.minX
      for index in row.items {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private struct Row {
    var items: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
    var rows: [Row] = []
    var row = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      if !row.items.isEmpty, row.width + spacing + size.width > width {
        rows.append(row)
        row = Row()
      }
      if !row.items.isEmpty { row.width += spacing }
      row.items.append(index)
      row.width += size.width
      row.height = max(row.height, size.height)
    }
    if !row.items.isEmpty { rows.append(row) }
    return rows
  }
}
