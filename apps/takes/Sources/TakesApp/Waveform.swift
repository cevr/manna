import SwiftUI
import TakesAudio
import TakesCore

/// A clip's source around its span: the waveform, its cuts struck, the trimmed-away ends dimmed,
/// two trim handles, the selection and the play head. Drag to select, drag a handle to trim,
/// click to play from there.
struct Waveform: View {
  let model: AppModel
  let ref: ClipRef
  let clip: Clip
  let frames: Int
  let peaks: Peaks?
  let selected: Range<Int>?
  let head: Int?
  let focus: () -> Void
  @State private var drag: Drag?

  enum Drag: Hashable {
    case select(Int, Int)
    case trimIn(Int)
    case trimOut(Int)
  }

  private var span: Range<Int> {
    let margin = max((clip.outPoint - clip.inPoint) / 20, 1)
    return max(0, clip.inPoint - margin)..<min(frames, clip.outPoint + margin)
  }

  private var bounds: Range<Int> { bounds(for: drag) }

  private var shownSelection: Range<Int>? {
    if case .select(let a, let b) = drag { return min(a, b)..<max(a, b) }
    return selected
  }

  var body: some View {
    GeometryReader { proxy in
      let width = proxy.size.width
      Canvas { context, size in
        draw(&context, size)
      }
      .contentShape(.rect)
      .gesture(gesture(width: width))
    }
    .frame(height: 96)
    .background(.background, in: .rect(cornerRadius: 6))
    .accessibilityElement()
    .accessibilityLabel("Waveform")
    .accessibilityIdentifier("waveform")
  }

  private func x(_ frame: Int, _ width: CGFloat) -> CGFloat {
    let span = span
    guard span.count > 0 else { return 0 }
    return CGFloat(frame - span.lowerBound) / CGFloat(span.count) * width
  }

  private func frame(_ x: CGFloat, _ width: CGFloat) -> Int {
    let span = span
    guard width > 0 else { return span.lowerBound }
    let value = span.lowerBound + Int((x / width * CGFloat(span.count)).rounded())
    return min(max(value, 0), frames)
  }

  private func draw(_ context: inout GraphicsContext, _ size: CGSize) {
    let width = size.width
    let middle = size.height / 2
    let bounds = bounds
    if let peaks, span.count > 0 {
      var path = Path()
      let columns = max(Int(width), 1)
      for column in 0..<columns {
        let lower = frame(CGFloat(column), width) / peaks.bucket
        let upper = max(frame(CGFloat(column + 1), width) / peaks.bucket, lower + 1)
        let range = max(0, lower)..<min(upper, peaks.lows.count)
        guard !range.isEmpty else { continue }
        let low = peaks.lows[range].min() ?? 0
        let high = peaks.highs[range].max() ?? 0
        path.addRect(
          CGRect(
            x: CGFloat(column), y: middle - CGFloat(high) * middle, width: 1,
            height: max(CGFloat(high - low) * middle, 1)))
      }
      context.fill(path, with: .color(.accentColor))
    } else {
      context.fill(
        Path(CGRect(x: 0, y: middle - 0.5, width: width, height: 1)), with: .color(.secondary))
    }
    let dim = GraphicsContext.Shading.color(.black.opacity(0.35))
    context.fill(
      Path(CGRect(x: 0, y: 0, width: x(bounds.lowerBound, width), height: size.height)), with: dim)
    let end = x(bounds.upperBound, width)
    context.fill(Path(CGRect(x: end, y: 0, width: width - end, height: size.height)), with: dim)
    for cut in clip.cuts {
      let left = x(cut.lowerBound, width)
      let rect = CGRect(x: left, y: 0, width: x(cut.upperBound, width) - left, height: size.height)
      context.fill(Path(rect), with: .color(.gray.opacity(0.55)))
      var strike = Path()
      strike.move(to: CGPoint(x: rect.minX, y: middle))
      strike.addLine(to: CGPoint(x: rect.maxX, y: middle))
      context.stroke(strike, with: .color(.red.opacity(0.8)), lineWidth: 1.5)
    }
    if let shownSelection {
      let left = x(shownSelection.lowerBound, width)
      context.fill(
        Path(
          CGRect(
            x: left, y: 0, width: x(shownSelection.upperBound, width) - left, height: size.height)),
        with: .color(.accentColor.opacity(0.25)))
    }
    for edge in [bounds.lowerBound, bounds.upperBound] {
      let at = x(edge, width)
      context.fill(
        Path(CGRect(x: at - 2, y: 0, width: 4, height: size.height)), with: .color(.orange))
    }
    if let head {
      let at = x(head, width)
      context.fill(Path(CGRect(x: at - 1, y: 0, width: 2, height: size.height)), with: .color(.red))
    }
  }

  private func gesture(width: CGFloat) -> some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { value in
        let start = frame(value.startLocation.x, width)
        let now = frame(value.location.x, width)
        switch drag {
        case .none:
          if abs(value.startLocation.x - x(clip.inPoint, width)) <= 6 {
            drag = .trimIn(now)
          } else if abs(value.startLocation.x - x(clip.outPoint, width)) <= 6 {
            drag = .trimOut(now)
          } else {
            drag = .select(start, now)
          }
        case .trimIn: drag = .trimIn(now)
        case .trimOut: drag = .trimOut(now)
        case .select: drag = .select(start, now)
        }
      }
      .onEnded { value in
        focus()
        let ended = drag
        drag = nil
        switch ended {
        case .trimIn, .trimOut:
          model.apply(.trim(ref, bounds(for: ended)))
        case .select(let a, let b):
          if abs(value.location.x - value.startLocation.x) < 3 {
            model.selection = nil
            model.play(from: (clip.source, a))
          } else {
            model.selection = .frames(ref, min(a, b)..<max(a, b))
          }
        case .none: return
        }
      }
  }

  private func bounds(for drag: Drag?) -> Range<Int> {
    switch drag {
    case .trimIn(let frame): min(frame, clip.outPoint - 1)..<clip.outPoint
    case .trimOut(let frame): clip.inPoint..<max(frame, clip.inPoint + 1)
    default: clip.bounds
    }
  }
}
