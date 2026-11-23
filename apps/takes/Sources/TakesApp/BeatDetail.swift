import SwiftUI
import TakesAudio
import TakesCore

struct BeatDetail: View {
  let model: AppModel
  let beat: Beat

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        BeatHeading(model: model, beat: beat)
        if model.recording != nil {
          RecordingBanner(model: model, beat: beat)
        }
        TakeList(model: model, beat: beat)
        if let take = model.take {
          TakeEditor(model: model, beat: beat, take: take)
        }
      }
      .padding(20)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

/// The beat's title and talking-point note, edited in place; each commit is one undo step.
struct BeatHeading: View {
  let model: AppModel
  let beat: Beat
  @State private var title = ""
  @State private var note = ""
  @FocusState private var focus: Field?

  enum Field: Hashable {
    case title, note
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      TextField("Title", text: $title)
        .font(.title.bold())
        .textFieldStyle(.plain)
        .focused($focus, equals: .title)
        .onSubmit(commit)
        .accessibilityIdentifier("beat-title")
      TextField("Talking points", text: $note, axis: .vertical)
        .textFieldStyle(.plain)
        .foregroundStyle(.secondary)
        .lineLimit(1...8)
        .focused($focus, equals: .note)
        .accessibilityIdentifier("beat-note")
    }
    .onAppear(perform: load)
    .onChange(of: beat.id) { load() }
    .onChange(of: beat.title) { if focus != .title { title = beat.title } }
    .onChange(of: beat.note) { if focus != .note { note = beat.note } }
    .onChange(of: focus) { commit() }
  }

  private func load() {
    title = beat.title
    note = beat.note
  }

  private func commit() {
    if title != beat.title, !title.isEmpty { model.apply(.renameBeat(beat.id, title)) }
    if note != beat.note { model.apply(.setNote(beat.id, note)) }
  }
}

/// While recording: the beat's note large, so the talking points are in view.
struct RecordingBanner: View {
  let model: AppModel
  let beat: Beat

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Image(systemName: "record.circle.fill").foregroundStyle(.red)
        if model.recording?.session == true {
          Text("Session take: → for the next beat, ⌘R to stop")
        } else {
          Text("Recording: ⌘R to stop")
        }
      }
      .font(.headline)
      Text(prompt).font(.system(size: 28, weight: .medium))
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.red.opacity(0.08), in: .rect(cornerRadius: 10))
  }

  private var prompt: String {
    if beat.note.isEmpty { return beat.title }
    return beat.note
  }
}

struct TakeList: View {
  let model: AppModel
  let beat: Beat

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Takes").font(.headline)
      if beat.takes.isEmpty {
        Text("No takes yet: record one (⌘R), or drop an audio file here.")
          .foregroundStyle(.secondary)
      }
      ForEach(Array(beat.takes.enumerated()), id: \.element.id) { index, take in
        TakeRow(model: model, beat: beat, take: take, index: index)
      }
    }
  }
}

struct TakeRow: View {
  let model: AppModel
  let beat: Beat
  let take: Take
  let index: Int

  private var kept: Bool { beat.kept == take.id }
  private var shown: Bool { model.take?.id == take.id }

  var body: some View {
    HStack(spacing: 10) {
      Button(keptLabel, systemImage: keptIcon) {
        if kept {
          model.apply(.setKept(beat.id, nil))
        } else {
          model.apply(.setKept(beat.id, take.id))
        }
      }
      .labelStyle(.iconOnly)
      .buttonStyle(.borderless)
      .foregroundStyle(.yellow)
      Button("Play", systemImage: "play.fill") { model.play(take: take) }
        .labelStyle(.iconOnly).buttonStyle(.borderless)
      Button {
        model.selectedTake = take.id
        model.selection = nil
      } label: {
        HStack {
          Text(take.name).fontWeight(shownWeight)
          Text(duration).monospacedDigit().foregroundStyle(.secondary)
        }
      }
      .buttonStyle(.borderless)
      Spacer()
      Button("Delete Take", systemImage: "trash") { model.apply(.deleteTake(beat.id, take.id)) }
        .labelStyle(.iconOnly).buttonStyle(.borderless)
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("take-\(index + 1)")
  }

  private var keptLabel: String {
    if kept { return "Kept" }
    return "Keep"
  }

  private var keptIcon: String {
    if kept { return "star.fill" }
    return "star"
  }

  private var shownWeight: Font.Weight {
    if shown { return .semibold }
    return .regular
  }

  private var duration: String {
    let frames = Timeline(
      plan: model.project.plan(of: take), project: model.project, rate: AudioFormat.exportRate
    ).frames
    return AppModel.duration(frames, rate: AudioFormat.exportRate)
  }
}

/// The film's beats as a strip, each as wide as its edited audio, with the play head.
struct FilmStrip: View {
  let model: AppModel

  var body: some View {
    let lengths = model.beats.map { beat in
      Timeline(
        plan: model.project.plan(beat: beat.id), project: model.project,
        rate: AudioFormat.exportRate
      ).frames
    }
    let total = max(lengths.reduce(0, +), 1)
    GeometryReader { proxy in
      ZStack(alignment: .leading) {
        HStack(spacing: 1) {
          ForEach(Array(model.beats.enumerated()), id: \.element.id) { index, beat in
            Rectangle()
              .fill(stripColor(beat))
              .frame(width: max(proxy.size.width * CGFloat(lengths[index]) / CGFloat(total), 2))
              .overlay { Text("\(index + 1)").font(.caption2).foregroundStyle(.secondary) }
              .onTapGesture { model.select(beat: beat.id) }
              .help(beat.title)
          }
        }
        if model.playback?.kind == .film {
          TimelineView(.animation) { _ in
            if let frame = model.position {
              Rectangle().fill(.red).frame(width: 2)
                .offset(x: proxy.size.width * CGFloat(frame) / CGFloat(total))
            }
          }
        }
      }
    }
    .frame(height: 22)
    .padding(.horizontal, 12)
    .padding(.top, 6)
    .accessibilityLabel("Film strip")
  }

  private func stripColor(_ beat: Beat) -> Color {
    if beat.id == model.selectedBeat { return .accentColor.opacity(0.5) }
    return .secondary.opacity(0.25)
  }
}
