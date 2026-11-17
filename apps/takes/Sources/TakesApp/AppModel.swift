import AppKit
import Foundation
import Observation
import TakesAudio
import TakesCore
import TakesTranscribe

/// What the take editor has selected: words of a clip's source transcript, or a frame range.
enum Selection: Hashable {
  case words(ClipRef, ClosedRange<Int>)
  case frames(ClipRef, Range<Int>)

  var clip: ClipRef {
    switch self {
    case .words(let clip, _), .frames(let clip, _): clip
    }
  }
}

/// What is playing, and the timeline its play head is read through.
struct Playback: Hashable {
  enum Kind: Hashable {
    case take(TakeID)
    case film
  }

  var kind: Kind
  var timeline: Timeline
}

/// A recording under way: where it started, and whether it is a session take.
struct Capture: Hashable {
  var beat: BeatID?
  var session: Bool
}

/// The app's state: the open project and its history, the selection, recording and playback.
@Observable
final class AppModel {
  private(set) var folder: URL?
  private(set) var editor = Editor(project: Project(name: ""))
  var selectedBeat: BeatID?
  var selectedTake: TakeID?
  var selection: Selection?
  private(set) var message = ""
  private(set) var parakeet = Transcriber.Status.idle
  private(set) var devices: [InputDevice] = []
  private(set) var level: Float = -160
  private(set) var recording: Capture?
  private(set) var playback: Playback?
  private(set) var peaks: [SourceID: Peaks] = [:]

  private let transcriber: Transcriber
  private let recorder: any Microphone
  private let player = Player()
  @ObservationIgnored private var transcribing: [SourceID: Task<Void, Never>] = [:]
  @ObservationIgnored private var saving: Task<Void, Never>?
  @ObservationIgnored private var metering: Task<Void, Never>?
  @ObservationIgnored private var watch: InputDeviceWatch?
  @ObservationIgnored private var waiting: [URL] = []
  @ObservationIgnored private var loadingPeaks: Set<SourceID> = []

  static let lastProjectKey = "lastProject"
  static let inputKey = "inputUID"

  init(transcriber: Transcriber = Transcriber(), microphone: any Microphone = Recorder()) {
    self.transcriber = transcriber
    self.recorder = microphone
    refreshDevices()
    watch = InputDeviceWatch { Task { @MainActor in self.refreshDevices() } }
    recorder.onInterruption = { Task { @MainActor in self.stopRecording() } }
  }

  var project: Project { editor.project }
  var beats: [Beat] { project.document.beats }
  var hasProject: Bool { folder != nil }

  var beat: Beat? { beats.first { $0.id == selectedBeat } }

  /// The take the editor shows: the one picked, else the kept one, else the latest.
  var take: Take? {
    guard let beat else { return nil }
    return beat.takes.first { $0.id == selectedTake } ?? beat.keptTake ?? beat.takes.last
  }

  /// Opens the project in `folder`, making it when there is none yet.
  func open(_ folder: URL) {
    let project: Project
    do {
      if FileManager.default.fileExists(
        atPath: folder.appending(path: ProjectFile.fileName).path(percentEncoded: false))
      {
        project = try ProjectFile.load(from: folder)
      } else {
        project = Project(name: folder.lastPathComponent)
        try ProjectFile.save(project, in: folder)
      }
    } catch {
      say("Could not open \(folder.path(percentEncoded: false)): \(error.localizedDescription)")
      return
    }
    stopPlaying()
    self.folder = folder
    editor = Editor(project: project)
    selectedBeat = beats.first?.id
    selectedTake = nil
    selection = nil
    peaks = [:]
    UserDefaults.standard.set(folder.path(percentEncoded: false), forKey: Self.lastProjectKey)
    say("Opened \(project.name)")
    for source in project.sources.values where source.transcript == .pending {
      transcribe(source)
    }
    let files = waiting
    waiting = []
    files.forEach(openFile)
    Task { await prepareParakeet() }
  }

  func newProject(named name: String) {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    open(ProjectFile.defaultFolder(name: trimmed))
  }

  /// Opens the project named by `--project <dir>`, else the last one opened.
  func openAtLaunch(arguments: [String]) {
    if let index = arguments.firstIndex(of: "--project"), arguments.indices.contains(index + 1) {
      open(URL(filePath: arguments[index + 1], directoryHint: .isDirectory))
    } else if let last = UserDefaults.standard.string(forKey: Self.lastProjectKey),
      FileManager.default.fileExists(atPath: last)
    {
      open(URL(filePath: last, directoryHint: .isDirectory))
    }
  }

  /// A file opened from Finder or `open -a`: an outline or an audio take.
  func openFile(_ url: URL) {
    guard hasProject else {
      waiting.append(url)
      return
    }
    if ["md", "markdown", "txt"].contains(url.pathExtension.lowercased()) {
      importOutline(url)
    } else {
      importAudio(url)
    }
  }

  func apply(_ edit: Edit) {
    do {
      try editor.apply(edit)
      changed()
    } catch {
      say("Could not apply the edit: \(error)")
    }
  }

  func undo() {
    editor.undo()
    selection = nil
    changed()
  }

  func redo() {
    editor.redo()
    selection = nil
    changed()
  }

  func addBeat() {
    let beat = Beat(id: .make(), title: "Beat \(beats.count + 1)")
    apply(.addBeat(beat, at: nil))
    selectedBeat = beat.id
  }

  func deleteBeat(_ id: BeatID) {
    apply(.deleteBeat(id))
    if selectedBeat == id { selectedBeat = beats.first?.id }
  }

  func select(beat id: BeatID?) {
    selectedBeat = id
    selectedTake = nil
    selection = nil
  }

  func importOutline(_ url: URL) {
    let text: String
    do {
      text = try String(contentsOf: url, encoding: .utf8)
    } catch {
      say("Could not read \(url.lastPathComponent): \(error.localizedDescription)")
      return
    }
    let beats = Outline.beats(text)
    guard !beats.isEmpty else {
      say("No beats in \(url.lastPathComponent): use **1. Title.** paragraphs or ## headings")
      return
    }
    apply(.batch(beats.map { .addBeat($0, at: nil) }))
    if selectedBeat == nil { selectedBeat = beats.first?.id }
    say("Imported \(beats.count) beats from \(url.lastPathComponent)")
  }

  func importAudio(_ url: URL) {
    Task { await importing(url) }
  }

  /// Copies an audio file into the project as a kept take on the selected beat, then transcribes it.
  @discardableResult
  func importing(_ url: URL) async -> Source? {
    guard let folder else { return nil }
    let beat = selectedBeat
    do {
      let source = try await Work.importAudio(url, into: folder)
      editor.add(source)
      let edit = Edit.take(
        of: source, on: beat, in: project, name: url.deletingPathExtension().lastPathComponent,
        created: Date())
      apply(edit)
      land(on: beat)
      say("Imported \(url.lastPathComponent)")
      transcribe(source)
      return source
    } catch {
      say("Could not import \(url.lastPathComponent): \(error.localizedDescription)")
      return nil
    }
  }

  /// Waits for a source's transcription to land.
  func transcribed(_ source: SourceID) async {
    await transcribing[source]?.value
  }

  /// Selects the beat a new take landed on and shows its kept take.
  private func land(on beat: BeatID?) {
    let target = beats.first { $0.id == beat } ?? beats.last
    selectedBeat = target?.id
    selectedTake = target?.kept
    selection = nil
  }

  /// Cuts what is selected; words or frames.
  func cut() {
    switch selection {
    case .words(let clip, let words): apply(.cutWords(clip, words))
    case .frames(let clip, let frames): apply(.cutRange(clip, frames))
    case .none: return
    }
  }

  func restore() {
    switch selection {
    case .words(let clip, let words): apply(.restoreWords(clip, words))
    case .frames(let clip, let frames): apply(.restoreRange(clip, frames))
    case .none: return
    }
  }

  func send(to beat: BeatID, move: Bool) {
    guard case .words(let clip, let words) = selection else { return }
    if move {
      apply(.moveWords(clip, words, to: beat, NewClip()))
    } else {
      apply(.copyWords(clip, words, to: beat, NewClip()))
    }
    selection = nil
  }

  private func changed() {
    saving?.cancel()
    saving = Task {
      try? await Task.sleep(for: .milliseconds(500))
      guard !Task.isCancelled else { return }
      save()
    }
  }

  func save() {
    guard let folder else { return }
    do {
      try ProjectFile.save(project, in: folder)
    } catch {
      say("Could not save: \(error.localizedDescription)")
    }
  }

  func prepareParakeet() async {
    guard parakeet == .idle else { return }
    parakeet = .loading
    await transcriber.prepare()
    parakeet = await transcriber.status
  }

  private func transcribe(_ source: Source) {
    guard let folder else { return }
    let url = ProjectFile.audioURL(of: source, in: folder)
    if parakeet == .idle { parakeet = .loading }
    transcribing[source.id] = Task {
      let transcript = await transcriber.transcribe(url, rate: source.rate)
      parakeet = await transcriber.status
      guard self.folder == folder else { return }
      land(transcript, for: source.id)
    }
  }

  /// A transcript lands on its source, outside the undo history, and is saved.
  func land(_ transcript: Transcript, for source: SourceID) {
    editor.land(transcript, for: source)
    changed()
  }

  var parakeetText: String {
    switch parakeet {
    case .idle: "Parakeet loads with the first take"
    case .loading: "Loading Parakeet…"
    case .ready: "Parakeet ready"
    case .unavailable(let message): message
    }
  }

  func refreshDevices() {
    devices = InputDevices.all().filter { $0.inputChannels > 0 }
  }

  var input: InputDevice? {
    InputChoice.choose(
      devices, remembered: UserDefaults.standard.string(forKey: Self.inputKey),
      systemDefault: InputDevices.defaultInputUID())
  }

  func choose(input uid: String) {
    guard recording == nil else { return }
    UserDefaults.standard.set(uid, forKey: Self.inputKey)
    refreshDevices()
  }

  func toggleRecording(session: Bool) {
    if recording != nil {
      stopRecording()
    } else {
      Task { await startRecording(session: session) }
    }
  }

  func startRecording(session: Bool) async {
    guard let folder, recording == nil else { return }
    guard await recorder.permitted() else {
      say("Takes may not use the microphone: allow it in System Settings ▸ Privacy ▸ Microphone")
      if let settings = Recorder.privacySettings { NSWorkspace.shared.open(settings) }
      return
    }
    stopPlaying()
    do {
      try recorder.start(device: input, folder: folder, source: .make())
    } catch {
      say("Could not record: \(error)")
      return
    }
    recording = Capture(beat: selectedBeat, session: session)
    if session {
      say("Recording a session: → drops a marker for the next beat")
    } else {
      say("Recording")
    }
    metering = Task {
      while !Task.isCancelled {
        level = recorder.takePeak()
        try? await Task.sleep(for: .milliseconds(33))
      }
    }
  }

  /// Next Beat (→) works only while a session take records, whatever the window shows.
  var canMarkNextBeat: Bool { recording?.session == true }

  /// Marks the next beat in a session take, and shows its note.
  func nextBeat() {
    guard canMarkNextBeat, recorder.mark() != nil else { return }
    if let index = beats.firstIndex(where: { $0.id == selectedBeat }), index + 1 < beats.count {
      selectedBeat = beats[index + 1].id
      selectedTake = nil
      selection = nil
    }
  }

  /// Stops recording at once, closing the file, then lays it on the beats.
  func stopRecording() {
    guard let stopped = endRecording() else { return }
    Task { await lay(stopped.made, from: stopped.state) }
  }

  /// Stops recording and lays the recording on the beats: one take, or one per beat of a session.
  func stoppingRecording() async {
    guard let stopped = endRecording() else { return }
    await lay(stopped.made, from: stopped.state)
  }

  private func endRecording() -> (made: Recording, state: Capture)? {
    guard let state = recording else { return nil }
    metering?.cancel()
    level = -160
    recording = nil
    guard let made = recorder.stop() else { return nil }
    guard made.frames > 0 else {
      say("Nothing was recorded")
      return nil
    }
    editor.add(made.asSource)
    return (made, state)
  }

  private func lay(_ made: Recording, from state: Capture) async {
    do {
      let edit = try await Work.edit(of: made, in: project, beat: state.beat)
      apply(edit)
      land(on: state.beat)
      save()
      transcribe(made.asSource)
      say("Recorded \(Self.duration(made.frames, rate: made.rate))")
    } catch {
      say("The recording is kept in audio/ but could not be split: \(error)")
    }
  }

  func play(take: Take) {
    play(project.plan(of: take), kind: .take(take.id), from: 0)
  }

  /// Plays the take the editor shows from a source frame, or from its start.
  func play(from sourceFrame: (SourceID, Int)? = nil) {
    guard let take else { return }
    let plan = project.plan(of: take)
    let timeline = Timeline(plan: plan, project: project, rate: AudioFormat.exportRate)
    let start = sourceFrame.flatMap { timeline.frame(source: $0.0, frame: $0.1) } ?? 0
    play(plan, kind: .take(take.id), from: start)
  }

  func playFilm() {
    play(project.filmPlan, kind: .film, from: 0)
  }

  func togglePlay() {
    if playback != nil, player.position != nil {
      stopPlaying()
    } else {
      play()
    }
  }

  private func play(_ plan: [Segment], kind: Playback.Kind, from: Int) {
    guard let folder, !plan.isEmpty else { return }
    stopPlaying()
    let files = Renderer.files(of: project, in: folder)
    let timeline = Timeline(plan: plan, project: project, rate: AudioFormat.exportRate)
    Task {
      do {
        let samples = try await Work.render(plan, files: files)
        try player.play(samples, from: from)
        playback = Playback(kind: kind, timeline: timeline)
      } catch {
        say("Could not play: \(error.localizedDescription)")
      }
    }
  }

  func stopPlaying() {
    player.stop()
    playback = nil
  }

  /// The rendered frame playing now; read every frame by the play head.
  var position: Int? {
    guard playback != nil else { return nil }
    return player.position
  }

  func peaks(for source: SourceID) -> Peaks? {
    if let found = peaks[source] { return found }
    guard let folder, let info = project.sources[source], !loadingPeaks.contains(source) else {
      return nil
    }
    loadingPeaks.insert(source)
    let url = ProjectFile.audioURL(of: info, in: folder)
    Task {
      if let made = try? await Work.peaks(url, rate: info.rate) { peaks[source] = made }
      loadingPeaks.remove(source)
    }
    return nil
  }

  func export(to destination: URL? = nil) {
    Task { await exporting(to: destination) }
  }

  /// Writes the export, to `<project>/export/` unless another folder is given.
  @discardableResult
  func exporting(to destination: URL? = nil) async -> [URL] {
    guard let folder else { return [] }
    let target = destination ?? Exporter.defaultFolder(of: folder)
    do {
      let files = try await Work.export(project, from: folder, to: target)
      say(
        "Exported \(files.count - 1) beats and script.md to \(target.path(percentEncoded: false))")
      return files
    } catch {
      say("Could not export: \(error.localizedDescription)")
      return []
    }
  }

  func say(_ text: String) {
    message = text
  }

  static func duration(_ frames: Int, rate: Int) -> String {
    let seconds = Double(frames) / Double(max(rate, 1))
    return String(
      format: "%d:%04.1f", Int(seconds) / 60, seconds.truncatingRemainder(dividingBy: 60))
  }
}
