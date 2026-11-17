import Foundation
import TakesAudio
import TakesCore

/// What the app records through: the recorder on the Mac's input, or a stand-in in a test.
protocol Microphone: AnyObject {
  var onInterruption: (@Sendable () -> Void)? { get set }
  func permitted() async -> Bool
  func start(device: InputDevice?, folder: URL, source: SourceID) throws
  func mark() -> Int?
  func takePeak() -> Float
  func stop() -> Recording?
}

extension Recorder: Microphone {
  func permitted() async -> Bool {
    await Recorder.requestPermission()
  }
}
