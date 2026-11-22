import Foundation
import UIKit

/// The pinch between the home list and its tiles, as the current hymnal's
/// `home/pinch.ts` hears it: a `UIPinchGestureRecognizer` on the node marked
/// `hatch="pinch"` (the home list's column, `features/list.contract`), which
/// holds both the list and the tiles, so one recognizer serves both acts and
/// the find step picks the act (`src/find/step.ts` `pinched`).
///
/// It recognises beside the list's own pan: a one-finger scroll is never
/// its, and a scroll's stray second finger is reported like any pinch, for
/// the current app's bands decide (`pinchAct`), not this part. Once it
/// recognises, UIKit cancels the touches the node's controls saw, so a pinch
/// begun on a row opens no row. It is off (`isEnabled`, which cancels a
/// gesture in flight) while the node's `data-pinchable` is not `on`: search
/// open, the drums open, or another screen on top.
///
/// Each report is kept with its serial and says the topic `pinch` changed:
/// `b` began, `m <scale>` each change, `e <scale> <velocity>` the end
/// (velocity in scale per second, UIKit's), `c` cancelled or failed (a call
/// arriving, the node turned off). `pinch.take { since }` answers the serial
/// so far and the reports after `since`, `;`-joined, as the page module's
/// does (`modules/web/index.js`); `src/pinch/run.ts` reads them.
final class Pinch: NSObject, UIGestureRecognizerDelegate {
    /// The most reports kept for a take: far more than one gesture sends between two takes.
    static let kept = 256

    private let context: ExactModuleContext
    private var serial = 0
    private var reports: [(serial: Int, word: String)] = []
    /// Each hatched node's recognizer, by its view.
    private var held: [ObjectIdentifier: UIPinchGestureRecognizer] = [:]

    init(context: ExactModuleContext) {
        self.context = context
    }

    /// The node mounted (`isNew`: its recognizer is added) or its `data-*` words moved (on or off).
    func element(_ element: ExactElement) {
        guard let view = element.view else { return }
        let on = element.data[.pinchable] == "on"
        if let recognizer = held[ObjectIdentifier(view)] {
            recognizer.isEnabled = on
            return
        }
        let recognizer = UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:)))
        recognizer.delegate = self
        recognizer.isEnabled = on
        view.addGestureRecognizer(recognizer)
        held[ObjectIdentifier(view)] = recognizer
        element.owns(recognizer: recognizer, "two fingers: a pinch in shows All at once, a pinch out the list (home/pinch.ts)")
        element.diagnostics.log("built on \(type(of: view)), \(on ? "on" : "off")")
    }

    /// The node is leaving, its view still there: its recognizer goes, a gesture in flight cancelled.
    func elementEnded(_ element: ExactElement) {
        guard let view = element.view, let recognizer = held.removeValue(forKey: ObjectIdentifier(view)) else { return }
        recognizer.isEnabled = false
        recognizer.removeTarget(self, action: #selector(pinched(_:)))
        view.removeGestureRecognizer(recognizer)
    }

    /// One `native.later` op of the `pinch.` prefix.
    func later(_ request: [String: Any], reply: ExactReply) {
        guard request["op"] as? String == "pinch.take" else {
            return reply.fail("Hymnal answers no op \(request["op"] as? String ?? "")")
        }
        let since = (request["since"] as? NSNumber)?.intValue ?? 0
        DispatchQueue.main.async { [self] in
            let run = reports.filter { $0.serial > since }.map(\.word).joined(separator: ";")
            reply.send(["serial": serial, "run": run])
        }
    }

    @objc private func pinched(_ recognizer: UIPinchGestureRecognizer) {
        switch recognizer.state {
        case .began:
            report("b")
            report("m \(said(recognizer.scale))")
        case .changed:
            report("m \(said(recognizer.scale))")
        case .ended:
            report("e \(said(recognizer.scale)) \(said(recognizer.velocity))")
        case .cancelled, .failed:
            report("c")
        default:
            break
        }
    }

    /// Beside the list's pan and every other recognizer: the rule, not UIKit, decides.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool {
        true
    }

    private func report(_ word: String) {
        serial += 1
        reports.append((serial, word))
        if reports.count > Pinch.kept { reports.removeFirst(reports.count - Pinch.kept) }
        context.changed("pinch")
    }

    /// A number as a report carries it: short, and finite.
    private func said(_ value: CGFloat) -> String {
        guard value.isFinite else { return "0" }
        let rounded = (Double(value) * 10000).rounded() / 10000
        return rounded == 0 ? "0" : String(rounded)
    }
}
