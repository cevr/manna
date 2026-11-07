import AVFoundation
import CoreML
import CryptoKit
import Foundation

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

/// A rendered chunk: each id's frame count, the sample count and the
/// render's wall time in milliseconds.
struct NaturalRender: Codable {
  let frames: [Int]
  let samples: Int
  let millis: Double
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
@MainActor final class Natural: PeachModule {
  private var listener: ((NaturalEvent) -> Void)?
  private var installListener: ((NaturalInstallEvent) -> Void)?
  private let crashed: Bool
  private var installTask: Task<Void, Never>?
  private var installToken = 0

  init() {
    let marker = NaturalFolder.marker
    crashed = FileManager.default.fileExists(atPath: marker.path)
    if crashed {
      try? FileManager.default.removeItem(at: marker)
      NSLog("%@", "[natural] start crashed=true")
    }
  }

  func status(_ revision: String, _ files: [NaturalFile]) async -> NaturalStatus {
    let present = files.filter { NaturalInstall.present(revision, $0) }
    let excluded =
      (try? NaturalFolder.root.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup)
      ?? nil
    let memory = NaturalMemory.read()
    return NaturalStatus(
      revision: revision, files: present.count, bytes: NaturalFolder.bytes(), excluded: excluded ?? false,
      crashed: crashed, loaded: false, installing: installTask != nil, footprint: memory.footprint, peak: memory.peak)
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

  /// Cancels a download, waits for it to let go of its files, and deletes
  /// the natural folder whole.
  func remove() async throws {
    if let task = installTask {
      task.cancel()
      await task.value
    }
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

  func load(_ revision: String, _ files: [NaturalFile]) async throws -> Double {
    throw NaturalFailure(message: "not yet")
  }

  func render(_ utterance: Int, _ chunk: Int, _ ids: [Int]) async throws -> NaturalRender {
    throw NaturalFailure(message: "not yet")
  }

  func play(_ utterance: Int, _ chunk: Int, _ starts: [NaturalStart], _ last: Bool) throws {
    throw NaturalFailure(message: "not yet")
  }

  func pause() {
    NSLog("%@", "[natural] pause not yet")
  }

  func resume() {
    NSLog("%@", "[natural] resume not yet")
  }

  func stop() {
    NSLog("%@", "[natural] stop not yet")
  }

  func onEvent(_ listener: @escaping (NaturalEvent) -> Void) {
    self.listener = listener
  }

  func onInstall(_ listener: @escaping (NaturalInstallEvent) -> Void) {
    self.installListener = listener
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
