import AudioToolbox
import Foundation

/// The Feel's voice, as the current hymnal's `native/feel/Voice.swift`:
/// each cue sound the app ships (`Resources/feel/<name>.wav`, the current
/// voice's render, `tools/sounds.ts`) becomes a system sound (System Sound
/// Services), and a cue plays it by its name.
///
/// System sounds are the OS's own short alerts: the ring/silent switch
/// mutes them, they play at the ringer's volume, and they mix over any
/// other audio without touching the app's audio session, so a cue lies
/// over a hymn's recording and never dips or stops it.
///
/// - `feel.load { names }`: makes each sound's system sound, once, the names
///   one string split at spaces;
///   answers `{ loaded }`, how many it holds. A sound the OS refuses is
///   logged and left out.
/// - `feel.play { name, wait }`: plays the sound `wait` ms from now on the
///   session's clock (now when it is 1 ms or less: a cue's own sound, played in
///   the turn its touch was handled; a count-in's beat waits for its beat),
///   answering at once `{ played }`: false for
///   a sound not loaded (a cue before the load plays nothing; its haptic,
///   the Contract's, still plays). The simulator logs and plays nothing:
///   its system sounds reach the Mac's speaker.
final class Feel {
    private let context: ExactModuleContext
    private var ids: [String: SystemSoundID] = [:]
    /// Each sound scheduled and not yet played (a count-in's beat), by its turn.
    private var waiting: [Int: ExactTicket] = [:]
    private var next = 0

    init(context: ExactModuleContext) {
        self.context = context
    }

    private static let folder = Bundle.main.bundleURL
        .appendingPathComponent("ExactResources/Resources/feel", isDirectory: true)

    func later(_ request: [String: Any], reply: ExactReply) {
        switch request["op"] as? String ?? "" {
        case "feel.load":
            load((request["names"] as? String ?? "").split(separator: " ").map(String.init))
            reply.send(["loaded": ids.count])
        case "feel.play":
            reply.send(["played": play(request["name"] as? String ?? "", request["wait"] as? Double ?? 0)])
        default:
            reply.fail("Feel answers no op \(request["op"] ?? "")")
        }
    }

    private func load(_ names: [String]) {
        for name in names where ids[name] == nil {
            var id: SystemSoundID = 0
            let file = Feel.folder.appendingPathComponent("\(name).wav")
            let status = AudioServicesCreateSystemSoundID(file as CFURL, &id)
            if status != noErr {
                NSLog("%@", "[feel] voice.failed sound=\(name) status=\(status)")
                continue
            }
            ids[name] = id
        }
        NSLog("%@", "[feel] ready sounds=\(ids.count)")
    }

    private func play(_ name: String, _ wait: Double) -> Bool {
        guard let id = ids[name] else { return false }
        if wait <= 1 {
            sound(id, name)
            return true
        }
        let key = next
        next += 1
        waiting[key] = context.after(wait) { [weak self] in
            self?.waiting.removeValue(forKey: key)
            self?.sound(id, name)
        }
        return true
    }

    private func sound(_ id: SystemSoundID, _ name: String) {
        #if targetEnvironment(simulator)
            NSLog("%@", "[feel] play sound=\(name) skipped=simulator")
        #else
            AudioServicesPlaySystemSound(id)
        #endif
    }

    func end() {
        for ticket in waiting.values { ticket.stop() }
        waiting = [:]
        for id in ids.values { AudioServicesDisposeSystemSoundID(id) }
        ids = [:]
    }
}
