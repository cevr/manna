import SwiftUI
import TakesAudio
import TakesCore

struct RootView: View {
  let model: AppModel

  var body: some View {
    Group {
      if model.hasProject {
        ProjectView(model: model)
      } else {
        WelcomeView(model: model)
      }
    }
    .dropDestination(for: URL.self) { urls, _ in
      urls.forEach(model.openFile)
      return !urls.isEmpty
    }
  }
}

struct WelcomeView: View {
  let model: AppModel

  var body: some View {
    VStack(spacing: 16) {
      Text("Takes").font(.largeTitle.bold())
      Text("Record a script beat by beat, then edit it by its words.")
        .foregroundStyle(.secondary)
      HStack {
        Button("New Project…") { NewProjectPanel.run(model) }
        Button("Open Project…") { Panels.openProject(model) }
      }
      Text(model.message).font(.callout).foregroundStyle(.secondary)
    }
    .padding(40)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

struct ProjectView: View {
  let model: AppModel

  var body: some View {
    NavigationSplitView {
      BeatList(model: model)
        .navigationSplitViewColumnWidth(min: 200, ideal: 240)
    } detail: {
      VStack(spacing: 0) {
        if let beat = model.beat {
          BeatDetail(model: model, beat: beat)
        } else {
          ContentUnavailableView(
            "No beat selected", systemImage: "text.badge.plus",
            description: Text("Import an outline (⇧⌘I) or add a beat."))
        }
        Divider()
        FilmStrip(model: model)
        StatusBar(model: model)
      }
    }
    .navigationTitle(model.project.name)
    .toolbar { ProjectToolbar(model: model) }
  }
}

struct BeatList: View {
  let model: AppModel

  private var selection: Binding<BeatID?> {
    Binding(get: { model.selectedBeat }, set: { model.select(beat: $0) })
  }

  var body: some View {
    List(selection: selection) {
      Section("Beats") {
        ForEach(Array(model.beats.enumerated()), id: \.element.id) { index, beat in
          HStack {
            Text("\(index + 1).").monospacedDigit().foregroundStyle(.secondary)
            Text(beat.title).lineLimit(1)
            Spacer()
            if beat.keptTake != nil {
              Image(systemName: "waveform").foregroundStyle(.secondary)
                .accessibilityLabel("has a kept take")
            }
          }
          .tag(beat.id)
          .accessibilityIdentifier("beat-\(index + 1)")
          .contextMenu {
            Button("Delete Beat") { model.deleteBeat(beat.id) }
          }
        }
        .onMove { offsets, to in model.apply(.moveBeats(offsets: Array(offsets), to: to)) }
      }
      if !model.project.document.trash.isEmpty {
        Section("Trash") {
          ForEach(model.project.document.trash.reversed(), id: \.beat.id) { trashed in
            HStack {
              Text(trashed.beat.title).foregroundStyle(.secondary).lineLimit(1)
              Spacer()
              Button("Restore") { model.apply(.restoreBeat(trashed.beat.id)) }
                .buttonStyle(.borderless)
            }
          }
        }
      }
    }
    .safeAreaInset(edge: .bottom) {
      Button("Add Beat", systemImage: "plus") { model.addBeat() }
        .buttonStyle(.borderless).padding(8).frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct ProjectToolbar: ToolbarContent {
  let model: AppModel

  var body: some ToolbarContent {
    ToolbarItemGroup {
      InputPicker(model: model)
      LevelMeter(level: model.level).frame(width: 80, height: 8)
      Button {
        model.toggleRecording(session: false)
      } label: {
        if model.recording != nil {
          Label("Stop", systemImage: "stop.circle.fill")
        } else {
          Label("Record", systemImage: "record.circle")
        }
      }
      .accessibilityIdentifier("record")
      .help("Record a take on this beat (⌘R)")
      Button("Session", systemImage: "list.bullet.circle") { model.toggleRecording(session: true) }
        .disabled(model.recording != nil)
        .help("Record through many beats, → for the next (⇧⌘R)")
      Button("Import Outline", systemImage: "list.number") { Panels.importOutline(model) }
        .accessibilityIdentifier("import-outline")
      Button("Import Audio", systemImage: "square.and.arrow.down") { Panels.importAudio(model) }
        .accessibilityIdentifier("import-audio")
      Button("Export", systemImage: "square.and.arrow.up") { model.export() }
        .accessibilityIdentifier("export")
      Button("Play Film", systemImage: "film") { model.playFilm() }
    }
  }
}

struct InputPicker: View {
  let model: AppModel

  var body: some View {
    Picker(
      "Input",
      selection: Binding(
        get: { model.input?.uid ?? "" }, set: { model.choose(input: $0) })
    ) {
      ForEach(model.devices) { device in
        Text(device.name).tag(device.uid)
      }
    }
    .frame(width: 180)
    .disabled(model.recording != nil)
    .help("The input that records")
  }
}

/// The input's peak level, −60 dBFS to 0.
struct LevelMeter: View {
  let level: Float

  var body: some View {
    GeometryReader { proxy in
      let fraction = CGFloat(min(max((level + 60) / 60, 0), 1))
      ZStack(alignment: .leading) {
        Capsule().fill(.quaternary)
        Capsule().fill(color).frame(width: proxy.size.width * fraction)
      }
    }
    .accessibilityLabel("Input level")
    .accessibilityValue("\(Int(level)) dB")
  }

  private var color: Color {
    if level > -3 { return .red }
    if level > -12 { return .yellow }
    return .green
  }
}

struct StatusBar: View {
  let model: AppModel

  var body: some View {
    HStack {
      Text(model.parakeetText).lineLimit(1)
      Spacer()
      Text(model.message).lineLimit(1).truncationMode(.middle)
    }
    .font(.caption)
    .foregroundStyle(.secondary)
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
  }
}
