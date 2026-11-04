import AVFoundation
import CoreMedia
import Foundation
import Speech

/// A run of recognized text and its time, in milliseconds from the
/// session's audio start; a run the recognizer gave no time is sent at -1,
/// which the service reads as no earlier than the word before.
struct DictationRun: Codable {
  let text: String
  let start: Double
  let end: Double
}

/// One scripted result of a replay: `at` milliseconds after the replay
/// starts, whether it is final, and its runs.
struct DictationStep: Codable {
  let at: Double
  let final: Bool
  let runs: [DictationRun]
}

/// What happened to a session.
enum DictationEventKind: String, Codable {
  case start
  case result
  case end
  case fail
}

/// One event of the session the module holds, by its JS id. A result that
/// is not final holds the whole unfinalized tail; a final one holds the
/// newly final text. `reason` is set on a fail only: `denied`,
/// `unavailable`, `interrupted` or `error`.
struct DictationEvent: Codable {
  let session: Int
  let kind: DictationEventKind
  let final: Bool
  let runs: [DictationRun]
  let reason: String
}

/// What an engine can do on this device now for a locale: `ready`,
/// `missing` (its model is supported but not on the device) or
/// `unsupported`.
struct EngineReport: Codable {
  let engine: String
  let status: String
}

/// Dictation's native side: one session at a time, heard through the
/// device's on-device recognizers or replayed from a script, its results
/// sent to JS as events with each run's time.
///
/// The engines, best first: `analyzer` (SpeechAnalyzer with
/// SpeechTranscriber), `dictation` (SpeechAnalyzer with
/// DictationTranscriber), `recognizer` (SFSpeechRecognizer, on the device
/// only). Recognition never leaves the device. An analyzer engine whose
/// model is supported but not installed asks iOS to install it in the
/// background and fails `unavailable` at once, so the recital goes on with
/// the next engine.
///
/// The module emits events only for the session it holds now, matched by
/// object identity. A session JS cancelled or replaced emits nothing more:
/// after a JS reload its ids start at 1 again, so a late event of an old
/// session could carry a new one's id. Each session sends at most one
/// `end` or `fail`, and the module lets go of it then.
///
/// While it listens, the module holds the audio session for recording and
/// puts back the category, mode and options it found when the session
/// ends; an interruption ends the held session `interrupted`. On the
/// simulator it opens nothing and asks for nothing: a listen logs its skip
/// and fails `unavailable`. A replay opens nothing anywhere. It makes no
/// sound.
@MainActor final class Dictation: PeachModule {
  private var listener: ((DictationEvent) -> Void)?
  private var held: Held?
  private var observer: NSObjectProtocol?

  init() {
    #if !targetEnvironment(simulator)
      observer = NotificationCenter.default.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
      ) { [weak self] note in
        let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        guard raw == AVAudioSession.InterruptionType.began.rawValue else { return }
        MainActor.assumeIsolated { self?.interrupted() }
      }
    #endif
  }

  /// One report per engine, in chain order, for `locale`. It only asks:
  /// availability, the locale, the model's status and on-device support.
  func engines(_ locale: String) async -> [EngineReport] {
    let place = Locale(identifier: locale)
    var reports: [EngineReport] = []
    if #available(iOS 26.0, *) {
      reports.append(EngineReport(engine: "analyzer", status: await Analysis.status(of: "analyzer", place)))
      reports.append(EngineReport(engine: "dictation", status: await Analysis.status(of: "dictation", place)))
    } else {
      reports.append(EngineReport(engine: "analyzer", status: "unsupported"))
      reports.append(EngineReport(engine: "dictation", status: "unsupported"))
    }
    let onDevice = SFSpeechRecognizer(locale: place)?.supportsOnDeviceRecognition ?? false
    reports.append(EngineReport(engine: "recognizer", status: onDevice ? "ready" : "unsupported"))
    return reports
  }

  /// Listens as session `session` with `engine` in `locale`, the verse's
  /// words as `hints`, after it lets go of whatever session it held. It
  /// returns at once; every failure arrives as a `fail` event.
  func listen(_ session: Int, _ engine: String, _ locale: String, _ hints: [String]) {
    halt()
    let next = Held(session: session)
    held = next
    #if targetEnvironment(simulator)
      NSLog("%@", "[dictation] listen session=\(session) skipped=simulator")
      emit(next, .fail, reason: "unavailable")
    #else
      NSLog("%@", "[dictation] listen session=\(session) engine=\(engine)")
      next.task = Task { [weak self] in
        await self?.hear(next, engine, locale, hints)
      }
    #endif
  }

  /// Plays `steps` as session `session`, after it lets go of whatever
  /// session it held: `start`, each step as a result at its `at`, then
  /// `end`. It opens nothing.
  func replay(_ session: Int, _ steps: [DictationStep]) {
    halt()
    let next = Held(session: session)
    next.steps = steps
    held = next
    NSLog("%@", "[dictation] replay session=\(session) steps=\(steps.count)")
    emit(next, .start)
    next.task = Task { [weak self] in
      var elapsed = 0.0
      while next.next < steps.count {
        let step = steps[next.next]
        let wait = step.at - elapsed
        if wait.isFinite && wait > 0 {
          try? await Task.sleep(nanoseconds: UInt64(min(wait, 600_000) * 1_000_000))
          elapsed = step.at
        }
        guard !Task.isCancelled, let self, self.held === next else { return }
        next.next += 1
        self.emit(next, .result, final: step.final, runs: step.runs)
      }
      self?.emit(next, .end)
    }
  }

  /// The held session stops listening and finalizes: its last results,
  /// then `end`. A replay sends its remaining steps at once, then `end`.
  /// With no held session it does nothing.
  func finish() {
    guard let now = held else { return }
    if let steps = now.steps {
      now.task?.cancel()
      while now.next < steps.count {
        let step = steps[now.next]
        now.next += 1
        emit(now, .result, final: step.final, runs: step.runs)
      }
      emit(now, .end)
      return
    }
    #if !targetEnvironment(simulator)
      now.live?.finish()
    #endif
  }

  /// Tears the held session down; it sends nothing more.
  func cancel() {
    halt()
  }

  /// Sends each event of the held session to `listener`, the last one
  /// subscribed.
  func onEvent(_ listener: @escaping (DictationEvent) -> Void) {
    self.listener = listener
  }

  /// Lets go of the held session first, so nothing it sends after is emitted, then stops it.
  private func halt() {
    let now = held
    held = nil
    now?.stop()
  }

  private func interrupted() {
    guard let now = held, now.steps == nil else { return }
    emit(now, .fail, reason: "interrupted")
  }

  /// Emits an event of `from` only while it is the held session; an `end` or a `fail` lets go of it and stops it.
  fileprivate func emit(
    _ from: Held, _ kind: DictationEventKind, final: Bool = false, runs: [DictationRun] = [],
    reason: String = ""
  ) {
    guard let now = held, now === from else { return }
    if kind == .end || kind == .fail {
      held = nil
      now.stop()
    }
    listener?(DictationEvent(session: now.session, kind: kind, final: final, runs: runs, reason: reason))
  }

  #if !targetEnvironment(simulator)
    /// A listen on a device: the microphone's permission, then the engine.
    private func hear(_ now: Held, _ engine: String, _ locale: String, _ hints: [String]) async {
      guard await Self.microphoneGranted() else {
        emit(now, .fail, reason: "denied")
        return
      }
      guard held === now else { return }
      do {
        switch engine {
        case "analyzer", "dictation":
          if #available(iOS 26.0, *) {
            try await analyze(now, engine, locale, hints)
          } else {
            emit(now, .fail, reason: "unavailable")
          }
        case "recognizer":
          try await recognize(now, locale, hints)
        default:
          emit(now, .fail, reason: "unavailable")
        }
      } catch {
        NSLog("%@", "[dictation] listen.failed session=\(now.session) engine=\(engine)")
        emit(now, .fail, reason: "error")
      }
    }

    private static func microphoneGranted() async -> Bool {
      switch AVAudioApplication.shared.recordPermission {
      case .granted: return true
      case .denied: return false
      default: return await AVAudioApplication.requestRecordPermission()
      }
    }

    /// SpeechAnalyzer with the engine's transcriber over the microphone: volatile results as the tail, final results as new text, each run with its audio time.
    @available(iOS 26.0, *)
    private func analyze(_ now: Held, _ engine: String, _ locale: String, _ hints: [String]) async throws {
      guard let analysis = await Analysis.make(engine, Locale(identifier: locale)) else {
        emit(now, .fail, reason: "unavailable")
        return
      }
      let status = await AssetInventory.status(forModules: [analysis.module])
      guard status == .installed else {
        if status == .supported { Analysis.install(analysis.module, engine) }
        NSLog("%@", "[dictation] listen session=\(now.session) engine=\(engine) model=missing")
        emit(now, .fail, reason: "unavailable")
        return
      }
      guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [analysis.module]) else {
        emit(now, .fail, reason: "unavailable")
        return
      }
      guard held === now else { return }
      let analyzer = SpeechAnalyzer(modules: [analysis.module])
      let context = AnalysisContext()
      context.contextualStrings[.general] = hints
      try await analyzer.setContext(context)
      guard held === now else { return }
      let (inputs, feed) = AsyncStream<AnalyzerInput>.makeStream()
      let live = Live()
      now.live = live
      live.onStop = {
        feed.finish()
        Task { await analyzer.cancelAndFinishNow() }
      }
      live.onFinish = {
        feed.finish()
        Task { try? await analyzer.finalizeAndFinishThroughEndOfInput() }
      }
      let reader = Task { [weak self] in
        do {
          try await analysis.results { text, final in
            self?.emit(now, .result, final: final, runs: Analysis.runs(of: text))
          }
          self?.emit(now, .end)
        } catch {
          NSLog("%@", "[dictation] results.failed session=\(now.session)")
          self?.emit(now, .fail, reason: "error")
        }
      }
      now.reader = reader
      try await analyzer.start(inputSequence: inputs)
      guard held === now else { return }
      let input = try live.microphone.open()
      let converter = Converter(from: input, to: format, feed: feed)
      try live.microphone.start { buffer in converter.take(buffer) }
      emit(now, .start)
    }

    /// SFSpeechRecognizer on the device over the microphone: partials as the whole transcription, the final result as final, each segment with its time.
    private func recognize(_ now: Held, _ locale: String, _ hints: [String]) async throws {
      guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)),
        recognizer.supportsOnDeviceRecognition, recognizer.isAvailable
      else {
        emit(now, .fail, reason: "unavailable")
        return
      }
      guard await Self.recognitionGranted() else {
        emit(now, .fail, reason: "denied")
        return
      }
      guard held === now else { return }
      let request = SFSpeechAudioBufferRecognitionRequest()
      request.requiresOnDeviceRecognition = true
      request.shouldReportPartialResults = true
      request.contextualStrings = hints
      let live = Live()
      now.live = live
      let task = recognizer.recognitionTask(with: request) { @Sendable [weak self] result, error in
        let runs = result.map { Self.runs(of: $0.bestTranscription) } ?? []
        let final = result?.isFinal ?? false
        let failed = result == nil && error != nil
        DispatchQueue.main.async {
          MainActor.assumeIsolated {
            guard let self else { return }
            if failed {
              self.emit(now, .fail, reason: "error")
              return
            }
            if !runs.isEmpty || final { self.emit(now, .result, final: final, runs: runs) }
            if final { self.emit(now, .end) }
          }
        }
      }
      live.onStop = { task.cancel() }
      live.onFinish = { request.endAudio() }
      _ = try live.microphone.open()
      let appender = Appender(request)
      try live.microphone.start { buffer in appender.take(buffer) }
      emit(now, .start)
    }

    private static func recognitionGranted() async -> Bool {
      switch SFSpeechRecognizer.authorizationStatus() {
      case .authorized: return true
      case .notDetermined:
        return await withCheckedContinuation { done in
          SFSpeechRecognizer.requestAuthorization { status in done.resume(returning: status == .authorized) }
        }
      default: return false
      }
    }

    private nonisolated static func runs(of transcription: SFTranscription) -> [DictationRun] {
      transcription.segments.map { segment in
        DictationRun(
          text: segment.substring,
          start: segment.timestamp * 1000,
          end: (segment.timestamp + segment.duration) * 1000)
      }
    }
  #endif
}

/// The session the module holds: its JS id, the task that runs it, and
/// either a replay's steps with the index of the next one or, on a device,
/// the microphone and recognizer it listens with.
@MainActor private final class Held {
  let session: Int
  var task: Task<Void, Never>?
  var steps: [DictationStep]?
  var next = 0
  #if !targetEnvironment(simulator)
    var live: Live?
    var reader: Task<Void, Never>?
  #endif

  init(session: Int) {
    self.session = session
  }

  /// Stops whatever runs the session: the replay's task, or the microphone and the recognizer.
  func stop() {
    task?.cancel()
    #if !targetEnvironment(simulator)
      reader?.cancel()
      live?.stop()
      live = nil
    #endif
  }
}

/// The analyzer engines' transcribers, created for a locale, and how their
/// results and their model's status read.
@available(iOS 26.0, *)
private enum Analysis {
  case speech(SpeechTranscriber)
  case dictation(DictationTranscriber)

  var module: any SpeechModule {
    switch self {
    case .speech(let transcriber): return transcriber
    case .dictation(let transcriber): return transcriber
    }
  }

  /// The engine's transcriber for `locale` with volatile results and audio
  /// times, or none when the engine cannot take the locale here.
  static func make(_ engine: String, _ locale: Locale) async -> Analysis? {
    switch engine {
    case "analyzer":
      guard SpeechTranscriber.isAvailable,
        let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale)
      else { return nil }
      return .speech(
        SpeechTranscriber(
          locale: supported, transcriptionOptions: [], reportingOptions: [.volatileResults],
          attributeOptions: [.audioTimeRange]))
    case "dictation":
      guard let supported = await DictationTranscriber.supportedLocale(equivalentTo: locale) else {
        return nil
      }
      return .dictation(
        DictationTranscriber(
          locale: supported, contentHints: [.shortForm], transcriptionOptions: [],
          reportingOptions: [.volatileResults], attributeOptions: [.audioTimeRange]))
    default:
      return nil
    }
  }

  /// `ready` when the engine's model is installed, `missing` when it is
  /// supported or downloading, `unsupported` otherwise.
  static func status(of engine: String, _ locale: Locale) async -> String {
    guard let analysis = await make(engine, locale) else { return "unsupported" }
    switch await AssetInventory.status(forModules: [analysis.module]) {
    case .installed: return "ready"
    case .supported, .downloading: return "missing"
    default: return "unsupported"
    }
  }

  /// Hands each result's text and finality to `send` on the main actor, until the analyzer finishes.
  func results(_ send: @escaping @MainActor (AttributedString, Bool) -> Void) async throws {
    switch self {
    case .speech(let transcriber):
      for try await result in transcriber.results { await send(result.text, result.isFinal) }
    case .dictation(let transcriber):
      for try await result in transcriber.results { await send(result.text, result.isFinal) }
    }
  }

  /// The runs of a result's text, each with its audio time in milliseconds.
  static func runs(of text: AttributedString) -> [DictationRun] {
    text.runs.map { run in
      let piece = String(text[run.range].characters)
      guard let range = run.audioTimeRange else { return DictationRun(text: piece, start: -1, end: -1) }
      return DictationRun(text: piece, start: millis(range.start), end: millis(range.end))
    }
  }

  private static func millis(_ time: CMTime) -> Double {
    let seconds = time.seconds
    return seconds.isFinite ? seconds * 1000 : -1
  }

  #if !targetEnvironment(simulator)
    /// Asks iOS to download and install the engine's model in the background; the listen that found it missing does not wait.
    static func install(_ module: any SpeechModule, _ engine: String) {
      NSLog("%@", "[dictation] model engine=\(engine) install=requested")
      Task.detached {
        do {
          if let request = try await AssetInventory.assetInstallationRequest(supporting: [module]) {
            try await request.downloadAndInstall()
          }
          NSLog("%@", "[dictation] model engine=\(engine) install=done")
        } catch {
          NSLog("%@", "[dictation] model engine=\(engine) install=failed")
        }
      }
    }
  #endif
}

#if !targetEnvironment(simulator)
  /// A device session's microphone and recognizer: `finish` stops the
  /// input and asks the recognizer for its last results; `stop` tears both
  /// down.
  @MainActor private final class Live {
    let microphone = Microphone()
    var onFinish: (() -> Void)?
    var onStop: (() -> Void)?

    func finish() {
      microphone.stop()
      let ask = onFinish
      onFinish = nil
      ask?()
    }

    func stop() {
      microphone.stop()
      let tear = onStop
      onFinish = nil
      onStop = nil
      tear?()
    }
  }

  /// The microphone through AVAudioEngine. `open` takes the audio session
  /// for recording and answers the input's format; `start` taps the input;
  /// `stop` removes the tap, stops the engine and gives the session back
  /// with `.notifyOthersOnDeactivation`, in the category, mode and options
  /// `open` found, unless another owner took it meanwhile. A second `stop`
  /// does nothing.
  @MainActor private final class Microphone {
    private let engine = AVAudioEngine()
    private var before: (category: AVAudioSession.Category, mode: AVAudioSession.Mode, options: AVAudioSession.CategoryOptions)?
    private var tapped = false

    func open() throws -> AVAudioFormat {
      let session = AVAudioSession.sharedInstance()
      before = (session.category, session.mode, session.categoryOptions)
      try session.setCategory(.record, mode: .measurement, options: .duckOthers)
      try session.setActive(true, options: .notifyOthersOnDeactivation)
      let format = engine.inputNode.outputFormat(forBus: 0)
      guard format.sampleRate > 0, format.channelCount > 0 else {
        stop()
        throw NSError(domain: "Dictation", code: 1, userInfo: [NSLocalizedDescriptionKey: "no microphone input"])
      }
      return format
    }

    func start(_ take: @escaping @Sendable (AVAudioPCMBuffer) -> Void) throws {
      let input = engine.inputNode
      input.installTap(onBus: 0, bufferSize: 4096, format: input.outputFormat(forBus: 0)) { @Sendable buffer, _ in
        take(buffer)
      }
      tapped = true
      engine.prepare()
      try engine.start()
    }

    func stop() {
      if tapped {
        engine.inputNode.removeTap(onBus: 0)
        tapped = false
      }
      if engine.isRunning { engine.stop() }
      guard let before else { return }
      self.before = nil
      let session = AVAudioSession.sharedInstance()
      guard session.category == .record else { return }
      do {
        try session.setActive(false, options: .notifyOthersOnDeactivation)
        try session.setCategory(before.category, mode: before.mode, options: before.options)
      } catch {
        NSLog("%@", "[dictation] session.release failed")
      }
    }
  }

  /// Appends the microphone's buffers to the recognizer's request, which
  /// takes them from the tap's thread.
  private final class Appender: @unchecked Sendable {
    private let request: SFSpeechAudioBufferRecognitionRequest

    init(_ request: SFSpeechAudioBufferRecognitionRequest) {
      self.request = request
    }

    func take(_ buffer: AVAudioPCMBuffer) {
      request.append(buffer)
    }
  }

  /// Converts the microphone's buffers to the analyzer's format and feeds
  /// them in. It lives on the tap's thread only.
  @available(iOS 26.0, *)
  private final class Converter: @unchecked Sendable {
    private let converter: AVAudioConverter?
    private let format: AVAudioFormat
    private let feed: AsyncStream<AnalyzerInput>.Continuation

    init(from input: AVAudioFormat, to format: AVAudioFormat, feed: AsyncStream<AnalyzerInput>.Continuation) {
      converter = input == format ? nil : AVAudioConverter(from: input, to: format)
      self.format = format
      self.feed = feed
    }

    func take(_ buffer: AVAudioPCMBuffer) {
      guard let converter else {
        feed.yield(AnalyzerInput(buffer: buffer))
        return
      }
      let ratio = format.sampleRate / buffer.format.sampleRate
      let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 1
      guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
      var given = false
      var error: NSError?
      let status = converter.convert(to: out, error: &error) { _, state in
        if given {
          state.pointee = .noDataNow
          return nil
        }
        given = true
        state.pointee = .haveData
        return buffer
      }
      guard status != .error, out.frameLength > 0 else { return }
      feed.yield(AnalyzerInput(buffer: out))
    }
  }
#endif
