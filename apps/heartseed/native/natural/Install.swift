import CryptoKit
import Foundation

/// Why a download failed, as JS reads it in `failed {reason}`.
enum NaturalInstallFailure: String, Error {
  case network
  case check
  case space
  case cancelled
}

/// The pinned download, one file at a time in manifest order.
///
/// The natural folder is created and kept out of backups before the first
/// byte. A file already at its final path with the manifest's size is kept;
/// `load` hashes it again. Any other file is downloaded into `.partial/`, its
/// SHA-256 taken in 1 MiB reads, and moved into place only on a match; a
/// mismatch is deleted and fetched again, at most twice more. Every failure
/// deletes `.partial/`, so a bad or partial file never sits at a final path.
enum NaturalInstall {
  static let headroom = 50 << 20
  static let attempts = 3

  /// Runs the download to its end and returns nil when every file is in
  /// place, else the reason it stopped.
  static func run(
    base: String, revision: String, files: [NaturalFile],
    emit: @escaping @Sendable (NaturalInstallEvent) -> Void
  ) async -> NaturalInstallFailure? {
    let partial = NaturalFolder.root.appendingPathComponent(".partial", isDirectory: true)
    let fetch = NaturalFetch(waiting: {
      emit(NaturalInstallEvent(kind: .waiting, bytes: 0, total: 0, reason: ""))
    })
    defer {
      fetch.finish()
      try? FileManager.default.removeItem(at: partial)
    }
    do {
      try prepare(partial)
      let missing = files.enumerated().filter { !present(revision, $0.element) }
      let total = files.reduce(0) { $0 + $1.bytes }
      let needed = missing.reduce(0) { $0 + $1.element.bytes }
      NSLog("%@", "[natural] install revision=\(revision) missing=\(missing.count)")
      try checkSpace(needed + headroom)
      let progress = NaturalProgress(done: total - needed, total: total, emit: emit)
      progress.file(0)
      for (index, file) in missing {
        try await fetchChecked(
          index: index, file: file, base: base, target: NaturalFolder.file(revision, file.path),
          partial: partial.appendingPathComponent(String(index), isDirectory: false), fetch: fetch,
          progress: progress)
      }
      try Task.checkCancellation()
      return nil
    } catch let failure as NaturalInstallFailure {
      return failure
    } catch {
      return Task.isCancelled ? .cancelled : .network
    }
  }

  static func present(_ revision: String, _ file: NaturalFile) -> Bool {
    let url = NaturalFolder.file(revision, file.path)
    let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? nil
    return size == file.bytes
  }

  /// The folder exists and is excluded from backups before any byte lands.
  private static func prepare(_ partial: URL) throws {
    let manager = FileManager.default
    var root = NaturalFolder.root
    do {
      try manager.createDirectory(at: root, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try root.setResourceValues(values)
      try? manager.removeItem(at: partial)
      try manager.createDirectory(at: partial, withIntermediateDirectories: true)
    } catch {
      NSLog("%@", "[natural] install folder error=\(error.localizedDescription)")
      throw NaturalInstallFailure.space
    }
  }

  /// Fails with `space` when the volume holds less than `needed` bytes for
  /// important use. An unreadable capacity lets the download try.
  private static func checkSpace(_ needed: Int) throws {
    let values = try? NaturalFolder.root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    guard let available = values?.volumeAvailableCapacityForImportantUsage else { return }
    if available < Int64(needed) { throw NaturalInstallFailure.space }
  }

  private static func fetchChecked(
    index: Int, file: NaturalFile, base: String, target: URL, partial: URL, fetch: NaturalFetch,
    progress: NaturalProgress
  ) async throws {
    guard
      let encoded = file.path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
      let url = URL(string: base + encoded)
    else { throw NaturalInstallFailure.network }
    for attempt in 1...attempts {
      try Task.checkCancellation()
      do {
        try await fetch.download(url, to: partial) { written in progress.written(written) }
      } catch {
        throw Task.isCancelled ? NaturalInstallFailure.cancelled : NaturalInstallFailure.network
      }
      try Task.checkCancellation()
      let checked = (try? sha256(partial)) == file.sha256
      NSLog("%@", "[natural] file index=\(index) checked=\(checked) try=\(attempt)")
      if checked {
        try place(partial, at: target)
        progress.file(file.bytes)
        return
      }
      try? FileManager.default.removeItem(at: partial)
    }
    throw NaturalInstallFailure.check
  }

  /// Moves a checked file to its final path, a rename within one volume.
  private static func place(_ partial: URL, at target: URL) throws {
    let manager = FileManager.default
    do {
      try manager.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
      try? manager.removeItem(at: target)
      try manager.moveItem(at: partial, to: target)
    } catch {
      NSLog("%@", "[natural] install move error=\(error.localizedDescription)")
      throw NaturalInstallFailure.space
    }
  }

  /// The file's SHA-256 in lowercase hex, read 1 MiB at a time.
  static func sha256(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hasher = SHA256()
    var reading = true
    while reading {
      try autoreleasepool {
        let data = try handle.read(upToCount: 1 << 20) ?? Data()
        if data.isEmpty { reading = false } else { hasher.update(data: data) }
      }
    }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }
}

/// The download's byte count for `progress` events: at most ten a second
/// while a file arrives, and one each time a file is placed.
final class NaturalProgress: @unchecked Sendable {
  private let lock = NSLock()
  private var done: Int
  private var last = Date.distantPast
  private let total: Int
  private let emit: @Sendable (NaturalInstallEvent) -> Void

  init(done: Int, total: Int, emit: @escaping @Sendable (NaturalInstallEvent) -> Void) {
    self.done = done
    self.total = total
    self.emit = emit
  }

  func written(_ bytes: Int) {
    let event: NaturalInstallEvent? = lock.withLock {
      let now = Date()
      guard bytes > 0, now.timeIntervalSince(last) >= 0.1 else { return nil }
      last = now
      return NaturalInstallEvent(kind: .progress, bytes: done + bytes, total: total, reason: "")
    }
    if let event { emit(event) }
  }

  func file(_ bytes: Int) {
    let event: NaturalInstallEvent = lock.withLock {
      done += bytes
      last = Date()
      return NaturalInstallEvent(kind: .progress, bytes: done, total: total, reason: "")
    }
    emit(event)
  }
}

/// One URL at a time into a given file, over a session that waits for a
/// network it may use and never uses a constrained one (Low Data Mode).
final class NaturalFetch: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
  private struct Pending {
    let continuation: CheckedContinuation<Void, Error>
    let target: URL
    let task: URLSessionDownloadTask
    let written: @Sendable (Int) -> Void
    var failure: Error?
  }

  private let lock = NSLock()
  private var pending: Pending?
  private let waiting: @Sendable () -> Void
  private var session: URLSession?

  init(waiting: @escaping @Sendable () -> Void) {
    self.waiting = waiting
    super.init()
    let configuration = URLSessionConfiguration.default
    configuration.allowsConstrainedNetworkAccess = false
    configuration.waitsForConnectivity = true
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    let queue = OperationQueue()
    queue.maxConcurrentOperationCount = 1
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
  }

  /// Ends the session, which lets go of this delegate.
  func finish() {
    lock.withLock { session }?.invalidateAndCancel()
  }

  func download(_ url: URL, to target: URL, written: @escaping @Sendable (Int) -> Void) async throws {
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        guard let session = lock.withLock({ session }) else {
          continuation.resume(throwing: URLError(.cancelled))
          return
        }
        let task = session.downloadTask(with: url)
        lock.withLock {
          pending = Pending(continuation: continuation, target: target, task: task, written: written, failure: nil)
        }
        task.resume()
        if Task.isCancelled { task.cancel() }
      }
    } onCancel: {
      lock.withLock { pending?.task }?.cancel()
    }
  }

  func urlSession(_ session: URLSession, taskIsWaitingForConnectivity task: URLSessionTask) {
    waiting()
  }

  func urlSession(
    _ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
  ) {
    let written = lock.withLock { pending?.task === downloadTask ? pending?.written : nil }
    written?(Int(totalBytesWritten))
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard let target = lock.withLock({ pending?.task === downloadTask ? pending?.target : nil }) else { return }
    var failure: Error?
    let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
    if status != 200 {
      failure = URLError(.badServerResponse)
      NSLog("%@", "[natural] install status=\(status)")
    } else {
      do {
        try? FileManager.default.removeItem(at: target)
        try FileManager.default.moveItem(at: location, to: target)
      } catch {
        failure = error
      }
    }
    lock.withLock { if pending?.task === downloadTask { pending?.failure = failure } }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let ended: Pending? = lock.withLock {
      guard pending?.task === task else { return nil }
      defer { pending = nil }
      return pending
    }
    guard let ended else { return }
    if let failure = error ?? ended.failure {
      ended.continuation.resume(throwing: failure)
    } else {
      ended.continuation.resume()
    }
  }
}
