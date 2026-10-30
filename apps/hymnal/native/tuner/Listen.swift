import AVFAudio
import Foundation

/// The tuner's ear: the microphone's input, cut into frames of 2048 mono
/// samples for the pitch reader on the JavaScript side.
///
/// `start` asks for no permission: the screen asks first, and `start`
/// rejects when the microphone is not granted. It takes the audio session
/// for input only (category `.record`, mode `.measurement`, which turns off
/// the input's automatic gain and voice processing, since both bend pitch),
/// installs a tap on the engine's input node and answers the hardware's
/// sample rate. The tap runs on the audio thread: it copies samples into one
/// preallocated frame and, at each full frame (hop 2048), copies it into a
/// `Data` of little-endian Float32 and hops to the main actor to send it
/// through `onFrame`.
///
/// `stop` removes the tap, stops the engine and gives the session back with
/// `.notifyOthersOnDeactivation`; a second call does nothing. Listening ends
/// through `onEnd` with `stopped` (a `stop`), `interruption` (a call, Siri),
/// `route` (an input came or went, or the engine's configuration changed)
/// or `failure` (the media services were reset).
@MainActor final class Listen: PeachModule {
  init() {}

  /// Starts listening and answers the input's sample rate in hertz. Listening
  /// already, it answers the same rate and changes nothing.
  func start() throws -> Double {
    if let rate = listening { return rate }
    guard AVAudioApplication.shared.recordPermission == .granted else {
      NSLog("%@", "[tuner] listen.failed status=permission")
      throw Listen.failure("the microphone is not granted")
    }
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.record, mode: .measurement)
      try session.setActive(true)
    } catch {
      NSLog("%@", "[tuner] listen.failed status=session")
      throw error
    }
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      release(session)
      NSLog("%@", "[tuner] listen.failed status=input")
      throw Listen.failure("no microphone input")
    }
    let framer = Framer { [weak self] frame in
      Task { @MainActor in self?.send(frame) }
    }
    input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(Framer.size), format: format) {
      buffer, _ in framer.take(buffer)
    }
    engine.prepare()
    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      release(session)
      NSLog("%@", "[tuner] listen.failed status=engine")
      throw error
    }
    listening = format.sampleRate
    observe()
    NSLog("%@", "[tuner] listen.started rate=\(format.sampleRate)")
    return format.sampleRate
  }

  /// Stops listening and sends `stopped`; does nothing when not listening.
  func stop() {
    end("stopped")
  }

  /// Takes the listener for each frame: 2048 Float32 samples, little-endian.
  /// One calls this again for each new JavaScript subscriber and fans the
  /// event out itself, so the latest listener replaces the one before.
  func onFrame(_ listener: @escaping (Data) -> Void) {
    frameListener = listener
  }

  /// Takes the listener for the end of listening: `stopped`, `interruption`,
  /// `route` or `failure`. The latest listener replaces the one before.
  func onEnd(_ listener: @escaping (String) -> Void) {
    endListener = listener
  }

  private let engine = AVAudioEngine()
  /// The sample rate while listening; nil when not.
  private var listening: Double?
  private var frameListener: ((Data) -> Void)?
  private var endListener: ((String) -> Void)?
  private var observers: [NSObjectProtocol] = []

  /// Sends a frame, unless listening ended while it waited for the main actor.
  private func send(_ frame: Data) {
    guard listening != nil else { return }
    frameListener?(frame)
  }

  /// Ends listening: the tap first, then the engine, then the session.
  private func end(_ reason: String) {
    guard listening != nil else { return }
    listening = nil
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers = []
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    release(AVAudioSession.sharedInstance())
    NSLog("%@", "[tuner] listen.ended reason=\(reason)")
    endListener?(reason)
  }

  private func release(_ session: AVAudioSession) {
    do {
      try session.setActive(false, options: .notifyOthersOnDeactivation)
    } catch {
      NSLog("%@", "[tuner] listen.release failed")
    }
  }

  /// Ends listening on an interruption's start, an input that came or went,
  /// a change of the engine's configuration (it stops itself then) and a
  /// reset of the media services.
  private func observe() {
    let center = NotificationCenter.default
    let watch = {
      [weak self] (name: Notification.Name, object: Any?, reason: @escaping @Sendable (Notification) -> String?) in
      center.addObserver(forName: name, object: object, queue: .main) { note in
        guard let ended = reason(note) else { return }
        MainActor.assumeIsolated { self?.end(ended) }
      }
    }
    observers = [
      watch(AVAudioSession.interruptionNotification, nil) { note in
        let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)
          .flatMap(AVAudioSession.InterruptionType.init(rawValue:))
        return type == .began ? "interruption" : nil
      },
      watch(AVAudioSession.routeChangeNotification, nil) { note in
        let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt)
          .flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
        return reason == .newDeviceAvailable || reason == .oldDeviceUnavailable ? "route" : nil
      },
      watch(.AVAudioEngineConfigurationChange, engine) { _ in "route" },
      watch(AVAudioSession.mediaServicesWereResetNotification, nil) { _ in "failure" },
    ]
  }

  private static func failure(_ message: String) -> NSError {
    NSError(domain: "Listen", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}

/// Cuts the tap's buffers into frames of `size` mono samples (the first
/// channel), hop `size`. It lives on the tap's thread only: the samples go
/// into one buffer allocated once, and the one allocation per frame is the
/// `Data` handed to `deliver`.
private final class Framer: @unchecked Sendable {
  static let size = 2048

  init(deliver: @escaping (Data) -> Void) {
    self.deliver = deliver
    samples = UnsafeMutableBufferPointer<Float>.allocate(capacity: Framer.size)
    samples.initialize(repeating: 0)
  }

  deinit {
    samples.deallocate()
  }

  func take(_ buffer: AVAudioPCMBuffer) {
    guard let channels = buffer.floatChannelData else { return }
    let source = channels[0]
    let count = Int(buffer.frameLength)
    var read = 0
    while read < count {
      let step = min(Framer.size - filled, count - read)
      (samples.baseAddress! + filled).update(from: source + read, count: step)
      filled += step
      read += step
      if filled == Framer.size {
        deliver(Data(buffer: samples))
        filled = 0
      }
    }
  }

  private let deliver: (Data) -> Void
  private let samples: UnsafeMutableBufferPointer<Float>
  private var filled = 0
}
