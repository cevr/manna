import AVFAudio
import Foundation
#if canImport(ExactPkg_media_capture)
import ExactPkg_media_capture
#endif

/// The tuner's ear, as the current hymnal's `native/tuner/Listen.swift` is:
/// the microphone's input cut into frames of 2048 mono Float32 samples (hop
/// 2048) for the pitch reader on the TypeScript side, and listening ended
/// by `interruption` (a call, Siri), `route` (an input came or went, or the
/// engine's configuration changed) or `failure` (the media services were
/// reset), as Listen.swift ends it.
///
/// The microphone is Exact's `@exact/media-capture`: the data module opens
/// a track (`getUserMedia`, Apple's `measurement` mode) and the host's audio
/// session owner claims `.playAndRecord` for it and gives the app's
/// `playback` back when it closes, so this ear sets no category. The ear
/// taps the mixer the package hands its hatch (`MediaCaptureModule.hatch`)
/// and holds the track's capture (`holdsCapture(track:)`) while it listens.
///
/// - `tuner.ear`: `{ ear }`, whether this device hears: an iOS device, or
///   any host under the agent.
/// - `tuner.listen { track, feedRate, frame }`: starts listening on the
///   track, answering `{ rate, ends }`, the input's sample rate in hertz and
///   the ends counted so far. Under the agent no microphone is heard: a fed
///   tone's frames are counted on the agent's clock at `feedRate`, and the
///   data module makes each one (`feedFrame`, the current app's).
/// - `tuner.take`: `{ frames, ends, ended, ms }`, each frame since the last
///   take, the latest `KEPT`, in base64 of its little-endian Float32; under
///   the agent `{ fed, ends, ended }`, the frames fed so far. `ms` is this
///   answer's own time on the main thread.
/// - `tuner.stop`: stops listening; a second call does nothing.
///
/// Each frame, and each end, says the topic `tuner` changed, so the screen's
/// answer is asked again.
final class TunerEar {
    /// The most frames a take answers: the latest, as the current app drops a frame that comes while one is in work.
    static let kept = 8
    static let size = 2048

    private let context: ExactModuleContext
    private let lock = NSLock()
    private var frames: [Data] = []
    private var listening = false
    private var ends = 0
    private var ended = ""
    private var observers: [NSObjectProtocol] = []
    private var feedRate = 0.0
    private var frame = Double(TunerEar.size)
    private var fedFrom = 0.0
    private var poll: DispatchWorkItem?
    private weak var mixer: AVAudioMixerNode?
    private weak var engine: AVAudioEngine?
    private var tapped = false
    private var framer: TunerFramer?
    #if canImport(ExactPkg_media_capture)
    private var held: ExactSubscription?
    #endif

    /// The ear the package's hatch hands each capture's mixer to.
    private static weak var current: TunerEar?

    init(context: ExactModuleContext) {
        self.context = context
        TunerEar.current = self
        #if canImport(ExactPkg_media_capture)
        MediaCaptureModule.hatch = { engine, mixer in
            DispatchQueue.main.async { TunerEar.current?.capture(engine, mixer) }
        }
        #endif
    }

    func later(_ request: [String: Any], reply: ExactReply) {
        switch request["op"] as? String ?? "" {
        case "tuner.ear":
            #if os(iOS)
            reply.send(["ear": true])
            #else
            reply.send(["ear": context.agent])
            #endif
        case "tuner.listen":
            listen(request, reply: reply)
        case "tuner.take":
            reply.send(take())
        case "tuner.stop":
            end("stopped")
            reply.send(["ends": ends])
        default:
            reply.fail("the tuner answers no op \(request["op"] ?? "")")
        }
    }

    private func listen(_ request: [String: Any], reply: ExactReply) {
        if listening { end("stopped") }
        ended = ""
        lock.lock(); frames = []; lock.unlock()
        if context.agent {
            feedRate = (request["feedRate"] as? NSNumber)?.doubleValue ?? 0
            frame = (request["frame"] as? NSNumber)?.doubleValue ?? Double(TunerEar.size)
            fedFrom = context.now()
            listening = true
            schedule()
            NSLog("%@", "[tuner] listen.started rate=\(feedRate) fed=true")
            return reply.send(["rate": feedRate, "ends": ends])
        }
        #if canImport(ExactPkg_media_capture)
        guard let track = request["track"] as? String, !track.isEmpty else {
            NSLog("%@", "[tuner] listen.failed status=track")
            return reply.fail("no microphone track")
        }
        listening = true
        guard let held = MediaCaptureModule.holdsCapture(track: track) else {
            listening = false
            NSLog("%@", "[tuner] listen.failed status=capture")
            return reply.fail("no capture holds the track")
        }
        self.held = held
        if let engine, let mixer { capture(engine, mixer) }
        let rate = mixer?.outputFormat(forBus: 0).sampleRate ?? AVAudioSession.sharedInstance().sampleRate
        guard rate > 0 else {
            end("failure")
            NSLog("%@", "[tuner] listen.failed status=input")
            return reply.fail("no microphone input")
        }
        observe()
        NSLog("%@", "[tuner] listen.started rate=\(rate)")
        reply.send(["rate": rate, "ends": ends])
        #else
        reply.fail("this build has no microphone capture")
        #endif
    }

    /// A capture's engine and mixer, from the package's hatch: tapped at once while listening.
    private func capture(_ engine: AVAudioEngine, _ mixer: AVAudioMixerNode) {
        if self.mixer !== mixer { tapped = false }
        self.engine = engine
        self.mixer = mixer
        guard listening, !tapped, !context.agent else { return }
        let framer = TunerFramer { [weak self] frame in self?.heard(frame) }
        self.framer = framer
        mixer.installTap(onBus: 0, bufferSize: AVAudioFrameCount(TunerEar.size), format: mixer.outputFormat(forBus: 0)) {
            buffer, _ in framer.take(buffer)
        }
        tapped = true
    }

    /// A frame from the tap's thread: kept, the latest `kept`, and the screen told.
    private func heard(_ frame: Data) {
        lock.lock()
        guard listening else { lock.unlock(); return }
        frames.append(frame)
        if frames.count > TunerEar.kept { frames.removeFirst(frames.count - TunerEar.kept) }
        lock.unlock()
        context.changed("tuner")
    }

    private func take() -> [String: Any] {
        let start = Date()
        if context.agent {
            let fed = listening && feedRate > 0 ? Int(((context.now() - fedFrom) / 1000) * feedRate / frame) : 0
            return ["fed": fed, "ends": ends, "ended": ended]
        }
        lock.lock()
        let taken = frames
        frames = []
        lock.unlock()
        let text = taken.map { $0.base64EncodedString() }
        return ["frames": text, "ends": ends, "ended": ended, "ms": Date().timeIntervalSince(start) * 1000]
    }

    /// Under the agent: the screen told on the wall's time, each frame's
    /// length, so a moved clock is heard; the frames are the agent clock's.
    private func schedule() {
        poll?.cancel()
        guard listening, context.agent, feedRate > 0 else { return }
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.listening else { return }
            self.context.changed("tuner")
            self.schedule()
        }
        poll = item
        DispatchQueue.main.asyncAfter(deadline: .now() + frame / feedRate, execute: item)
    }

    /// Ends listening: the tap, then the capture's hold; an end other than a stop is counted and said.
    func end(_ reason: String) {
        guard listening else { return }
        lock.lock(); listening = false; frames = []; lock.unlock()
        poll?.cancel()
        poll = nil
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers = []
        if tapped { mixer?.removeTap(onBus: 0) }
        tapped = false
        framer = nil
        #if canImport(ExactPkg_media_capture)
        held?.cancel()
        held = nil
        #endif
        NSLog("%@", "[tuner] listen.ended reason=\(reason)")
        guard reason != "stopped" else { return }
        ends += 1
        ended = reason
        context.changed("tuner")
    }

    /// Ends listening on an interruption's start, an input that came or
    /// went, a change of the engine's configuration and a reset of the
    /// media services, as Listen.swift does.
    private func observe() {
        let center = NotificationCenter.default
        let watch = { [weak self] (name: Notification.Name, object: Any?, reason: @escaping (Notification) -> String?) in
            center.addObserver(forName: name, object: object, queue: .main) { note in
                guard let ended = reason(note) else { return }
                self?.end(ended)
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
}

/// Cuts the tap's buffers into frames of 2048 mono samples (the first
/// channel), hop 2048, as Listen.swift's `Framer`: on the tap's thread only,
/// into one buffer allocated once, one `Data` a frame.
private final class TunerFramer: @unchecked Sendable {
    init(deliver: @escaping (Data) -> Void) {
        self.deliver = deliver
        samples = UnsafeMutableBufferPointer<Float>.allocate(capacity: TunerEar.size)
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
            let step = min(TunerEar.size - filled, count - read)
            (samples.baseAddress! + filled).update(from: source + read, count: step)
            filled += step
            read += step
            if filled == TunerEar.size {
                deliver(Data(buffer: samples))
                filled = 0
            }
        }
    }

    private let deliver: (Data) -> Void
    private let samples: UnsafeMutableBufferPointer<Float>
    private var filled = 0
}
