import AVFoundation
import Foundation

/// A voice the device offers: its identifier, BCP 47 language, name,
/// quality (1 default, 2 enhanced, 3 premium) and whether it is a novelty
/// or a personal voice.
struct VoiceInfo: Codable {
  let id: String
  let language: String
  let name: String
  let quality: Int
  let novelty: Bool
  let personal: Bool
}

/// What happened to an utterance.
enum VoiceEventKind: String, Codable {
  case start
  case range
  case finish
  case cancel
  case interrupt
}

/// One event of the utterance the module holds, by its JS id; a range is
/// the UTF-16 span of the text spoken next.
struct VoiceEvent: Codable {
  let utterance: Int
  let kind: VoiceEventKind
  let location: Int
  let length: Int
}

/// The voice's native side: one AVSpeechSynthesizer reading one utterance
/// at a time, its spoken word ranges sent to JS as events.
///
/// The module emits events only for the utterance it holds now, matched by
/// object identity. An utterance JS stopped or replaced emits nothing more,
/// not even a cancel: JS has ended that reading already, and after a JS
/// reload its ids start at 1 again, so a late event of an old utterance
/// could carry a new reading's id. Each utterance sends at most one
/// terminal event (finish, cancel or interrupt), and the module lets go of
/// it then.
///
/// On a device it speaks, its ranges from the synthesizer's delegate. The
/// simulator never speaks, since its audio reaches the Mac's speaker: it
/// renders the utterance to buffers it drops, and paces the word markers
/// that render gives by their sample time, so a reading there lights its
/// words in silence at the pace it would be heard. The module leaves the
/// audio session as it finds it; it only listens for an interruption,
/// which ends the held utterance.
@MainActor final class Voice: PeachModule {
  private let synthesizer = AVSpeechSynthesizer()
  private let relay = Relay()
  private var listener: ((VoiceEvent) -> Void)?
  private var held: AVSpeechUtterance?
  private var heldId = 0
  private var observer: NSObjectProtocol?
  #if targetEnvironment(simulator)
    private var pacer: Pacer?
  #endif

  init() {
    relay.voice = self
    #if !targetEnvironment(simulator)
      synthesizer.delegate = relay
    #endif
    observer = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
    ) { [weak self] note in
      let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      guard raw == AVAudioSession.InterruptionType.began.rawValue else { return }
      MainActor.assumeIsolated { self?.interrupted() }
    }
  }

  /// The voices the device offers.
  func voices() -> [VoiceInfo] {
    AVSpeechSynthesisVoice.speechVoices().map { voice in
      VoiceInfo(
        id: voice.identifier,
        language: voice.language,
        name: voice.name,
        quality: voice.quality.rawValue,
        novelty: voice.voiceTraits.contains(.isNoveltyVoice),
        personal: voice.voiceTraits.contains(.isPersonalVoice)
      )
    }
  }

  /// Reads `text` as utterance `utterance` in the voice whose identifier is
  /// `voice` (en-US's default when empty or unknown), after it stops
  /// whatever it was reading.
  func speak(_ utterance: Int, _ text: String, _ voice: String) {
    halt()
    let next = AVSpeechUtterance(string: text)
    next.voice =
      AVSpeechSynthesisVoice(identifier: voice) ?? AVSpeechSynthesisVoice(language: "en-US")
    held = next
    heldId = utterance
    #if targetEnvironment(simulator)
      NSLog("%@", "[voice] speak utterance=\(utterance) skipped=simulator")
      let pacer = Pacer(id: ObjectIdentifier(next)) { [weak self] id, kind, range in
        self?.emit(id, kind, range)
      }
      self.pacer = pacer
      emit(ObjectIdentifier(next), .start, NSRange(location: 0, length: 0))
      synthesizer.write(
        next,
        toBufferCallback: { buffer in
          let frames = (buffer as? AVAudioPCMBuffer)?.frameLength ?? 0
          let rate = buffer.format.sampleRate
          let bytes = Int(buffer.format.streamDescription.pointee.mBytesPerFrame)
          DispatchQueue.main.async {
            MainActor.assumeIsolated { pacer.rendered(frames: frames, rate: rate, bytesPerFrame: bytes) }
          }
        },
        toMarkerCallback: { markers in
          let words = markers.filter { $0.mark == .word }.map { ($0.textRange, $0.byteSampleOffset) }
          DispatchQueue.main.async {
            MainActor.assumeIsolated { pacer.marked(words) }
          }
        })
      pacer.start()
    #else
      synthesizer.speak(next)
    #endif
  }

  /// Pauses the held utterance where it is.
  func pause() {
    #if targetEnvironment(simulator)
      pacer?.paused = true
    #else
      synthesizer.pauseSpeaking(at: .immediate)
    #endif
  }

  /// Goes on with a paused utterance.
  func resume() {
    #if targetEnvironment(simulator)
      pacer?.paused = false
    #else
      synthesizer.continueSpeaking()
    #endif
  }

  /// Stops the held utterance; it emits nothing more.
  func stop() {
    halt()
  }

  /// Sends each event of the held utterance to `listener`, the last one
  /// subscribed.
  func onEvent(_ listener: @escaping (VoiceEvent) -> Void) {
    self.listener = listener
  }

  /// Lets go of the held utterance first, so nothing it sends after is emitted, then stops the synthesizer.
  private func halt() {
    held = nil
    #if targetEnvironment(simulator)
      pacer?.cancel()
      pacer = nil
    #endif
    if synthesizer.isSpeaking || synthesizer.isPaused {
      synthesizer.stopSpeaking(at: .immediate)
    }
  }

  private func interrupted() {
    guard let utterance = held else { return }
    emit(ObjectIdentifier(utterance), .interrupt, NSRange(location: 0, length: 0))
    halt()
  }

  /// Emits an event of `id` only while it is the held utterance; a terminal event lets go of it.
  fileprivate func emit(_ id: ObjectIdentifier, _ kind: VoiceEventKind, _ range: NSRange) {
    guard let utterance = held, ObjectIdentifier(utterance) == id else { return }
    if kind == .finish || kind == .cancel || kind == .interrupt {
      held = nil
      #if targetEnvironment(simulator)
        pacer?.cancel()
        pacer = nil
      #endif
    }
    listener?(
      VoiceEvent(utterance: heldId, kind: kind, location: range.location, length: range.length))
  }
}

/// The synthesizer's delegate on a device, each callback carried to the
/// main actor in order as the utterance's identity and range.
private final class Relay: NSObject, AVSpeechSynthesizerDelegate {
  weak var voice: Voice?

  private func send(_ utterance: AVSpeechUtterance, _ kind: VoiceEventKind, _ range: NSRange) {
    let id = ObjectIdentifier(utterance)
    DispatchQueue.main.async { [weak self] in
      MainActor.assumeIsolated { self?.voice?.emit(id, kind, range) }
    }
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
    send(utterance, .start, NSRange(location: 0, length: 0))
  }

  func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString characterRange: NSRange,
    utterance: AVSpeechUtterance
  ) {
    send(utterance, .range, characterRange)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    send(utterance, .finish, NSRange(location: 0, length: 0))
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    send(utterance, .cancel, NSRange(location: 0, length: 0))
  }
}

#if targetEnvironment(simulator)
  /// The simulator's clock for one rendered utterance: it sends each word
  /// marker's range once the time played reaches the marker's sample time,
  /// and the finish once the render is done and its whole length played.
  /// Paused, the time played stands still.
  @MainActor private final class Pacer {
    private let id: ObjectIdentifier
    private let send: (ObjectIdentifier, VoiceEventKind, NSRange) -> Void
    private var markers: [(range: NSRange, byte: Int)] = []
    private var next = 0
    private var frames: Double = 0
    private var rate: Double = 22050
    private var bytesPerFrame = 4
    private var done = false
    private var played: TimeInterval = 0
    private var tick: Date = Date()
    private var task: Task<Void, Never>?
    var paused = false

    init(id: ObjectIdentifier, send: @escaping (ObjectIdentifier, VoiceEventKind, NSRange) -> Void) {
      self.id = id
      self.send = send
    }

    func rendered(frames count: AVAudioFrameCount, rate: Double, bytesPerFrame: Int) {
      if count == 0 {
        done = true
        return
      }
      frames += Double(count)
      if rate > 0 { self.rate = rate }
      if bytesPerFrame > 0 { self.bytesPerFrame = bytesPerFrame }
    }

    func marked(_ words: [(NSRange, Int)]) {
      markers.append(contentsOf: words.map { (range: $0.0, byte: $0.1) })
    }

    func start() {
      tick = Date()
      task = Task { @MainActor [weak self] in
        while !Task.isCancelled {
          try? await Task.sleep(nanoseconds: 20_000_000)
          self?.advance()
        }
      }
    }

    func cancel() {
      task?.cancel()
      task = nil
    }

    private func advance() {
      let now = Date()
      if !paused { played += now.timeIntervalSince(tick) }
      tick = now
      while next < markers.count {
        let marker = markers[next]
        let at = Double(marker.byte) / Double(bytesPerFrame) / rate
        if at > played { break }
        next += 1
        send(id, .range, marker.range)
      }
      if done && next >= markers.count && played >= frames / rate {
        send(id, .finish, NSRange(location: 0, length: 0))
      }
    }
  }
#endif
