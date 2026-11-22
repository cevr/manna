import Foundation

/// The hymnal's one app module (Exact's `ExactModule`, one an app): each
/// `native.later` goes to the part its op's prefix names, and an op no part
/// claims is refused. The tuner's ear (`tuner.`, `TunerEar.swift`) is the
/// only part today.
final class Hymnal: ExactModule {
    private lazy var parts: [String: (_ request: [String: Any], _ reply: ExactReply) -> Void] = [
        "tuner.": { [unowned self] request, reply in self.ear.later(request, reply: reply) },
        "pinch.": { [unowned self] request, reply in self.pinch.later(request, reply: reply) },
    ]
    private lazy var ear = TunerEar(context: context)
    private lazy var pinch = Pinch(context: context)

    override func element(_ element: ExactElement) {
        if element.hatch == .pinch { pinch.element(element) }
    }

    override func elementEnded(_ element: ExactElement) {
        if element.hatch == .pinch { pinch.elementEnded(element) }
    }

    override func later(_ request: [String: Any], reply: ExactReply) {
        let op = request["op"] as? String ?? ""
        guard let part = parts.first(where: { op.hasPrefix($0.key) })?.value else {
            return reply.fail("Hymnal answers no op \(op)")
        }
        part(request, reply)
    }

    override func destroy() {
        ear.end("stopped")
    }
}

let exactModule: ExactModule.Type = Hymnal.self
