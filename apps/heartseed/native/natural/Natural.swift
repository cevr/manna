import AVFoundation
import CoreML
import CryptoKit
import Foundation
import UIKit

/// One file of the pinned download: its path under the revision, size and SHA-256.
struct NaturalFile: Codable {
  let path: String
  let bytes: Int
  let sha256: String
}

/// What is on disk and in memory: the files present at their size, the
/// bytes under the natural folder, whether that folder is kept out of
/// backups, whether the last process ended during a natural reading, and
/// the process's memory footprint and its peak, in bytes.
struct NaturalStatus: Codable {
  let revision: String
  let files: Int
  let bytes: Int
  let excluded: Bool
  let crashed: Bool
  let loaded: Bool
  let installing: Bool
  let footprint: Int
  let peak: Int
}

enum NaturalInstallKind: String, Codable {
  case progress
  case waiting
  case done
  case failed
}

/// One step of the download: progress in bytes, waiting for a network it
/// may use, done, or failed with a reason (`network`, `check`, `space` or
/// `cancelled`).
struct NaturalInstallEvent: Codable {
  let kind: NaturalInstallKind
  let bytes: Int
  let total: Int
  let reason: String
}

/// A word's start in a chunk: the sample it starts at, and its UTF-16 span
/// in the text the reading lights.
struct NaturalStart: Codable {
  let sample: Int
  let location: Int
  let length: Int
}

/// A rendered chunk: each id's frame count, the sample count, the render's
/// wall time in milliseconds, and the index of its first and last audible
/// sample (`samples` and `-1` when none is).
struct NaturalRender: Codable {
  let frames: [Int]
  let samples: Int
  let millis: Double
  let first: Int
  let last: Int
}

enum NaturalEventKind: String, Codable {
  case start
  case range
  case finish
  case cancel
  case interrupt
}

/// One event of the reading the module holds, by its JS id.
struct NaturalEvent: Codable {
  let utterance: Int
  let kind: NaturalEventKind
  let location: Int
  let length: Int
}

/// A call the module refuses, with what JS reads as the rejection.
struct NaturalFailure: LocalizedError {
  let message: String

  var errorDescription: String? { message }
}

/// The natural voice's native side: Kokoro-82M's pinned files, downloaded
/// into `Application Support/Heartseed/natural/` and kept out of backups,
/// loaded into the seven-stage chain, and a reading rendered chunk by chunk
/// from the token ids JS plans.
///
/// A file `natural/reading` marks a natural reading in progress. One left
/// behind when the module starts means the last process ended during a
/// reading: `status` reports `crashed` for this process, and the marker is
/// deleted.
///
/// The module holds at most one reading. Its events are matched by an
/// internal generation, not the JS id, since a JS reload reuses ids from 1:
/// a reading stopped or replaced emits nothing more, and a terminal event
/// (finish or interrupt) lets go of it. An audio interruption or an engine
/// configuration change (a route change) ends it with `interrupt`. The
/// module leaves the audio session as it finds it.
@MainActor final class Natural: PeachModule {
  private var listener: ((NaturalEvent) -> Void)?
  private var installListener: ((NaturalInstallEvent) -> Void)?
  private let crashed: Bool
  private var installTask: Task<Void, Never>?
  private var installToken = 0
  private let store = KokoroAneModelStore()
  private var loadedRevision: String?
  private var voicePack: KokoroAneVoicePack?
  private var voicePath: String?
  private var packs: [String: KokoroAneVoicePack] = [:]
  private var lastLoad: Task<Double, Error>?
  private var loading: (revision: String, task: Task<Void, Error>)?
  private var unloading: Task<Void, Never>?
  private var loadToken = 0
  private var renderChain: Task<(KokoroAneSynthesisResult, Double), Error>?
  private var held: NaturalReading?
  private var generation = 0
  private let output = NaturalOutput()
  private var ticker: Task<Void, Never>?
  private var observers: [NSObjectProtocol] = []

  init() {
    let marker = NaturalFolder.marker
    crashed = FileManager.default.fileExists(atPath: marker.path)
    if crashed {
      try? FileManager.default.removeItem(at: marker)
      NSLog("%@", "[natural] start crashed=true")
    }
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) {
        [weak self] note in
        let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        guard raw == AVAudioSession.InterruptionType.began.rawValue else { return }
        MainActor.assumeIsolated { self?.interrupted("interruption") }
      })
    observers.append(
      center.addObserver(forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main) {
        [weak self] note in
        let source = (note.object as AnyObject?).map(ObjectIdentifier.init)
        MainActor.assumeIsolated {
          guard let self, self.output.owns(source) else { return }
          self.interrupted("route")
        }
      })
    observers.append(
      center.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) {
        [weak self] _ in
        MainActor.assumeIsolated { self?.memoryWarning() }
      })
  }

  func status(_ revision: String, _ files: [NaturalFile]) async -> NaturalStatus {
    let present = files.filter { NaturalInstall.present(revision, $0) }
    let excluded =
      (try? NaturalFolder.root.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup)
      ?? nil
    let memory = NaturalMemory.read()
    return NaturalStatus(
      revision: revision, files: present.count, bytes: NaturalFolder.bytes(), excluded: excluded ?? false,
      crashed: crashed, loaded: loadedRevision == revision, installing: installTask != nil, footprint: memory.footprint, peak: memory.peak)
  }

  /// Starts the pinned download and returns; a call while one runs does
  /// nothing. Its steps arrive through `onInstall`.
  func install(_ base: String, _ revision: String, _ files: [NaturalFile]) {
    guard installTask == nil else { return }
    installToken += 1
    let token = installToken
    let emit: @Sendable (NaturalInstallEvent) -> Void = { [weak self] event in
      DispatchQueue.main.async {
        MainActor.assumeIsolated { self?.emitInstall(token, event) }
      }
    }
    let total = files.reduce(0) { $0 + $1.bytes }
    installTask = Task.detached { [weak self] in
      let failure = await NaturalInstall.run(base: base, revision: revision, files: files, emit: emit)
      NSLog("%@", failure.map { "[natural] install failed reason=\($0.rawValue)" } ?? "[natural] install done")
      DispatchQueue.main.async {
        MainActor.assumeIsolated { self?.installEnded(token, failure, total) }
      }
    }
  }

  func cancelInstall() {
    installTask?.cancel()
  }

  /// Cancels a download and waits for it to let go of its files, halts the
  /// reading, unloads, and deletes the natural folder whole.
  func remove() async throws {
    if let task = installTask {
      task.cancel()
      await task.value
    }
    halt()
    unload()
    await unloading?.value
    let manager = FileManager.default
    guard manager.fileExists(atPath: NaturalFolder.root.path) else { return }
    do {
      try manager.removeItem(at: NaturalFolder.root)
    } catch {
      throw NaturalFailure(message: "remove failed: \(error.localizedDescription)")
    }
  }

  private func emitInstall(_ token: Int, _ event: NaturalInstallEvent) {
    guard token == installToken, installTask != nil else { return }
    installListener?(event)
  }

  private func installEnded(_ token: Int, _ failure: NaturalInstallFailure?, _ total: Int) {
    guard token == installToken else { return }
    installTask = nil
    let event =
      failure.map { NaturalInstallEvent(kind: .failed, bytes: 0, total: total, reason: $0.rawValue) }
      ?? NaturalInstallEvent(kind: .done, bytes: total, total: total, reason: "")
    installListener?(event)
  }

  /// Makes `voice`, the path of one of `files` ending `.bin`, the pack every
  /// later `render` reads, and returns the call's time in milliseconds; any
  /// other `voice` throws `voice`. The first load of `revision` in this
  /// process checks every file by its SHA-256 and loads the seven stages
  /// with this device's routing; a later one keeps the stages and reads the
  /// pack from disk, or from the packs already read, re-hashing nothing. A
  /// missing file throws `missing`; a file that fails its check is deleted
  /// and throws `check`. Loads run in the order they are called, so the
  /// last one called leaves its voice current, and a voice change halts
  /// the reading held.
  func load(_ revision: String, _ files: [NaturalFile], _ voice: String) async throws -> Double {
    guard voice.hasSuffix(".bin"), let file = files.first(where: { $0.path == voice }) else {
      throw NaturalFailure(message: "voice")
    }
    let previous = lastLoad
    let task = Task { () async throws -> Double in
      _ = await previous?.result
      return try await self.loadVoice(revision, files, file)
    }
    lastLoad = task
    return try await task.value
  }

  private func loadVoice(_ revision: String, _ files: [NaturalFile], _ file: NaturalFile) async throws -> Double {
    let clock = ContinuousClock()
    let began = clock.now
    let stages = loadedRevision == revision ? "kept" : "loaded"
    if loadedRevision != revision { try await loadStages(revision, files) }
    let token = loadToken
    let pack = try await packOf(revision, file)
    guard loadToken == token, loadedRevision == revision else { throw NaturalFailure(message: "removed") }
    if voicePath != file.path, held != nil { halt() }
    voicePath = file.path
    voicePack = pack
    let spent = began.duration(to: clock.now).components
    let millis = Double(spent.seconds) * 1_000 + Double(spent.attoseconds) / 1e15
    NSLog(
      "%@",
      "[natural] load ms=\(Int(millis.rounded())) units=\(NaturalRouting.current.rawValue) "
        + "voice=\(file.path) stages=\(stages)")
    return millis
  }

  /// Checks every file of `revision` and loads the seven stages, or joins
  /// the stage load already in flight for it.
  private func loadStages(_ revision: String, _ files: [NaturalFile]) async throws {
    if let loading, loading.revision == revision {
      let token = loadToken
      try await loading.task.value
      guard loadToken == token else { throw NaturalFailure(message: "removed") }
      loadedRevision = revision
      return
    }
    if loadedRevision != nil {
      halt()
      unload()
    }
    let pending = unloading
    let store = store
    let routing = NaturalRouting.current
    let token = loadToken
    let task = Task.detached { () async throws in
      await pending?.value
      try NaturalModels.verify(revision, files)
      let folder = NaturalFolder.root.appendingPathComponent(revision, isDirectory: true)
      do {
        try await store.load(from: folder, routing: routing)
      } catch {
        await store.unload()
        throw NaturalFailure(message: "load failed: \(error.localizedDescription)")
      }
    }
    loading = (revision, task)
    defer { if loadToken == token, loading?.revision == revision { loading = nil } }
    try await task.value
    guard loadToken == token else { throw NaturalFailure(message: "removed") }
    loadedRevision = revision
  }

  /// The pack of `file`, read once from disk and kept by its path until the
  /// stages unload.
  private func packOf(_ revision: String, _ file: NaturalFile) async throws -> KokoroAneVoicePack {
    if let pack = packs[file.path] { return pack }
    guard NaturalInstall.present(revision, file) else {
      NSLog("%@", "[natural] load missing voice=\(file.path)")
      throw NaturalFailure(message: "missing")
    }
    let url = NaturalFolder.file(revision, file.path)
    let token = loadToken
    let pack: KokoroAneVoicePack
    do {
      pack = try await Task.detached { try KokoroAneVoicePack.load(from: url) }.value
    } catch {
      throw NaturalFailure(message: "load failed: \(error.localizedDescription)")
    }
    if loadToken == token { packs[file.path] = pack }
    return pack
  }

  /// Renders chunk `chunk` of reading `utterance` from its token ids (BOS
  /// and EOS included, 3 to 512) at `speed`, the voice's duration scale
  /// the app sends, and keeps its audio for `play`. Chunk 0
  /// starts a new reading: the one held is halted, and the reading marker
  /// is written. A later chunk of a reading not held throws `stale`.
  /// Renders run one at a time, off the main actor; one that ends for a
  /// reading no longer held keeps nothing, and a failed one ends the
  /// reading.
  func render(_ utterance: Int, _ chunk: Int, _ ids: [Int], _ speed: Double) async throws -> NaturalRender {
    guard loadedRevision != nil, let pack = voicePack else { throw NaturalFailure(message: "not loaded") }
    guard ids.count >= 3, ids.count <= KokoroAneConstants.maxInputTokens else {
      throw NaturalFailure(message: "ids \(ids.count) outside 3...\(KokoroAneConstants.maxInputTokens)")
    }
    let reading: NaturalReading
    if chunk == 0 {
      halt()
      generation += 1
      reading = NaturalReading(generation: generation, utterance: utterance)
      held = reading
      NaturalFolder.mark()
    } else {
      guard let current = held, current.utterance == utterance, chunk >= current.nextChunk else {
        throw NaturalFailure(message: "stale")
      }
      reading = current
    }
    let style = pack.slice(for: ids.count - 2)
    let input = ids.map { Int32(clamping: $0) }
    let store = store
    let previous = renderChain
    let work = Task.detached { () async throws -> (KokoroAneSynthesisResult, Double) in
      _ = await previous?.result
      try Task.checkCancellation()
      let clock = ContinuousClock()
      let began = clock.now
      let result = try await KokoroAneSynthesizer.synthesize(
        inputIds: input, styleS: style.styleS, styleTimbre: style.styleTimbre, speed: Float(speed), store: store)
      guard result.samples.allSatisfy({ $0.isFinite }) else {
        throw KokoroAneError.nonFiniteModelOutput(stage: KokoroAneStage.tail.rawValue, output: "audio")
      }
      let spent = began.duration(to: clock.now).components
      return (result, Double(spent.seconds) * 1_000 + Double(spent.attoseconds) / 1e15)
    }
    renderChain = work
    reading.rendering = work
    do {
      let (result, millis) = try await work.value
      let frames = result.predictedDurations.map { Int($0) }
      let total = frames.reduce(0, +)
      NSLog(
        "%@",
        "[natural] render utterance=\(utterance) chunk=\(chunk) ids=\(ids.count) frames=\(total) "
          + "samples=\(result.samples.count) ms=\(Int(millis.rounded())) speed=\(speed)")
      if held === reading { reading.rendered[chunk] = (result.samples, total) }
      let first = result.samples.firstIndex { abs($0) > Self.audible } ?? result.samples.count
      let last = result.samples.lastIndex { abs($0) > Self.audible } ?? -1
      return NaturalRender(frames: frames, samples: result.samples.count, millis: millis, first: first, last: last)
    } catch {
      if held === reading { halt() }
      if case KokoroAneError.nonFiniteModelOutput = error {
        NSLog("%@", "[natural] render utterance=\(utterance) chunk=\(chunk) failed=nonfinite")
        throw NaturalFailure(message: "nonfinite")
      }
      NSLog("%@", "[natural] render utterance=\(utterance) chunk=\(chunk) failed=error")
      throw NaturalFailure(message: "render failed: \(error.localizedDescription)")
    }
  }

  /// Schedules the held reading's chunk `chunk`, rendered and not yet
  /// played, right after the one before it and its rest, and drops its
  /// audio. Only `from..<to` of its samples plays (JS trims the edge
  /// silence), and `rest` samples of silence follow it before the next
  /// chunk. `starts` are its words' start samples within that cut; each
  /// sends a `range` when the clock reaches it. `last` marks the reading's
  /// final chunk, after whose last sample `finish` is sent, its rest not
  /// waited out. A chunk that comes after the clock has passed its place
  /// plays as soon as it can, its words shifted with it. A play while
  /// paused is scheduled and stays paused. A cut outside the audio, an
  /// empty one or a negative rest throws `cut`.
  func play(
    _ utterance: Int, _ chunk: Int, _ starts: [NaturalStart], _ last: Bool, _ from: Int, _ to: Int, _ rest: Int
  ) throws {
    guard let reading = held, reading.utterance == utterance else { throw NaturalFailure(message: "stale") }
    guard chunk == reading.nextChunk, reading.end == nil, let audio = reading.rendered[chunk]
    else { throw NaturalFailure(message: "chunk \(chunk) not rendered") }
    guard from >= 0, to <= audio.pcm.count, from < to, rest >= 0 else { throw NaturalFailure(message: "cut") }
    reading.rendered[chunk] = nil
    var at = reading.scheduledEnd
    if chunk > 0, let now = output.now(), now >= at { at = now + Self.lead }
    do {
      try output.schedule(Array(audio.pcm[from..<to]), at: at, paused: reading.paused)
    } catch {
      halt()
      throw error
    }
    NSLog(
      "%@",
      "[natural] play utterance=\(utterance) chunk=\(chunk) frames=\(audio.frames) samples=\(audio.pcm.count) from=\(from) to=\(to) rest=\(rest) at=\(at)"
        + NaturalOutput.note)
    if chunk == 0 { reading.begin = at }
    reading.marks += starts.map { NaturalStart(sample: at + $0.sample, location: $0.location, length: $0.length) }
    reading.nextChunk += 1
    if last {
      reading.scheduledEnd = at + (to - from)
      reading.end = reading.scheduledEnd
    } else {
      reading.scheduledEnd = at + (to - from) + rest
    }
    if !reading.paused { startTicking() }
  }

  /// Stops the held reading's clock and audio where they are.
  func pause() {
    guard let reading = held, !reading.paused else { return }
    reading.paused = true
    stopTicking()
    output.pause()
  }

  /// Goes on with a paused reading.
  func resume() {
    guard let reading = held, reading.paused else { return }
    reading.paused = false
    guard reading.nextChunk > 0 else { return }
    do {
      try output.resume()
    } catch {
      interrupted("resume")
      return
    }
    startTicking()
  }

  /// Halts the held reading and removes its marker; it emits nothing more.
  func stop() {
    halt()
  }

  /// Sends each event of the held reading to `listener`, the last one
  /// subscribed.
  func onEvent(_ listener: @escaping (NaturalEvent) -> Void) {
    self.listener = listener
  }

  func onInstall(_ listener: @escaping (NaturalInstallEvent) -> Void) {
    self.installListener = listener
  }

  /// The wait given a chunk scheduled after the clock has passed its place,
  /// in samples (100 ms), so its first samples are not lost.
  private static let lead = 2_400

  /// The amplitude a sample must pass to count as heard, for a chunk's
  /// first and last audible sample.
  private static let audible: Float = 0.01

  /// Lets go of the held reading first, so nothing it sends after is
  /// emitted, then cancels its render, stops the clock and the audio, and
  /// removes the marker.
  private func halt() {
    let reading = held
    held = nil
    reading?.rendering?.cancel()
    reading?.rendered = [:]
    stopTicking()
    output.halt()
    if reading != nil { NaturalFolder.unmark() }
  }

  private func unload() {
    loadToken += 1
    loading?.task.cancel()
    loading = nil
    loadedRevision = nil
    voicePack = nil
    voicePath = nil
    packs = [:]
    let store = store
    unloading = Task.detached { await store.unload() }
  }

  private func memoryWarning() {
    guard held == nil, loading == nil, loadedRevision != nil else { return }
    NSLog("%@", "[natural] unload reason=memory")
    unload()
  }

  private func interrupted(_ cause: String) {
    guard let reading = held else { return }
    NSLog("%@", "[natural] interrupt utterance=\(reading.utterance) cause=\(cause)")
    emit(reading.generation, .interrupt, 0, 0)
  }

  private func startTicking() {
    guard ticker == nil else { return }
    ticker = Task { @MainActor [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 20_000_000)
        self?.tick()
      }
    }
  }

  private func stopTicking() {
    ticker?.cancel()
    ticker = nil
  }

  /// Reads the clock and sends what it has reached: `start` once the first
  /// chunk begins, each word's `range`, and `finish` after the last sample.
  private func tick() {
    guard let reading = held, !reading.paused, let now = output.now() else { return }
    let generation = reading.generation
    if !reading.started, now >= reading.begin {
      reading.started = true
      emit(generation, .start, 0, 0)
    }
    while held === reading, reading.started, reading.nextMark < reading.marks.count,
      reading.marks[reading.nextMark].sample <= now
    {
      let mark = reading.marks[reading.nextMark]
      reading.nextMark += 1
      emit(generation, .range, mark.location, mark.length)
    }
    if held === reading, let end = reading.end, now >= end, reading.nextMark >= reading.marks.count {
      emit(generation, .finish, 0, 0)
    }
  }

  /// Emits an event of reading `generation` only while it is held; a
  /// terminal event halts it first.
  private func emit(_ generation: Int, _ kind: NaturalEventKind, _ location: Int, _ length: Int) {
    guard let reading = held, reading.generation == generation else { return }
    if kind == .finish || kind == .cancel || kind == .interrupt { halt() }
    listener?(NaturalEvent(utterance: reading.utterance, kind: kind, location: location, length: length))
  }
}

/// The check `load` makes before it trusts the files: each present at its
/// size and its SHA-256 as pinned.
enum NaturalModels {
  static func verify(_ revision: String, _ files: [NaturalFile]) throws {
    for (index, file) in files.enumerated() {
      guard NaturalInstall.present(revision, file) else {
        NSLog("%@", "[natural] load missing index=\(index)")
        throw NaturalFailure(message: "missing")
      }
      let url = NaturalFolder.file(revision, file.path)
      let hash = (try? NaturalInstall.sha256(url)) ?? ""
      guard hash == file.sha256 else {
        try? FileManager.default.removeItem(at: url)
        NSLog("%@", "[natural] load check index=\(index) checked=false")
        throw NaturalFailure(message: "check")
      }
    }
  }
}

/// The natural voice's folder, `Application Support/Heartseed/natural/`:
/// each revision's files under `<revision>/<path>` and the reading marker.
enum NaturalFolder {
  static var root: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("Heartseed", isDirectory: true)
      .appendingPathComponent("natural", isDirectory: true)
  }

  static var marker: URL { root.appendingPathComponent("reading", isDirectory: false) }

  /// Writes the marker of a natural reading in progress.
  static func mark() {
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    FileManager.default.createFile(atPath: marker.path, contents: Data())
  }

  /// Removes the marker once the reading ends.
  static func unmark() {
    try? FileManager.default.removeItem(at: marker)
  }

  static func file(_ revision: String, _ path: String) -> URL {
    root.appendingPathComponent(revision, isDirectory: true).appendingPathComponent(path, isDirectory: false)
  }

  /// The size of every file under the folder, 0 when it is absent.
  static func bytes() -> Int {
    guard
      let walk = FileManager.default.enumerator(
        at: root, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey])
    else { return 0 }
    var total = 0
    for case let url as URL in walk {
      let values = try? url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
      if values?.isRegularFile == true { total += values?.fileSize ?? 0 }
    }
    return total
  }
}

/// The process's physical footprint and its peak, as the system's memory
/// limit counts them (`task_vm_info`).
enum NaturalMemory {
  static func read() -> (footprint: Int, peak: Int) {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { raw in
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), raw, &count)
      }
    }
    guard result == KERN_SUCCESS else { return (0, 0) }
    return (Int(info.phys_footprint), Int(info.ledger_phys_footprint_peak))
  }
}
