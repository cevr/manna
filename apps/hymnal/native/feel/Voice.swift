import AudioToolbox
import Foundation

/// The voice's native side: each sound the app renders becomes a system
/// sound (System Sound Services), and a cue plays it by its id.
///
/// System sounds are the OS's own short alerts: the ring/silent switch
/// mutes them, they play at the ringer's volume, and they mix over any
/// other audio without touching the app's audio session, so a click lies
/// over a hymn's recording and never dips or stops it.
///
/// The simulator plays nothing: its system sounds reach the Mac's speaker,
/// so a play there logs the sound and returns.
@MainActor final class Voice: PeachModule {
  init() {}

  /// Writes `wav` under Caches as `<name>-<hash>.wav`, unless that file is
  /// there already, and makes its system sound. Answers the sound's id, or
  /// 0 when the file could not be written or the OS refused it (logged).
  func load(_ name: String, _ hash: String, _ wav: Data) -> Int {
    let file = Voice.folder.appendingPathComponent("\(name)-\(hash).wav")
    if !FileManager.default.fileExists(atPath: file.path) {
      do {
        try FileManager.default.createDirectory(at: Voice.folder, withIntermediateDirectories: true)
        try wav.write(to: file, options: .atomic)
      } catch {
        NSLog("%@", "[feel] voice.failed sound=\(name) status=write")
        return 0
      }
    }
    var id: SystemSoundID = 0
    let status = AudioServicesCreateSystemSoundID(file as CFURL, &id)
    if status != noErr {
      NSLog("%@", "[feel] voice.failed sound=\(name) status=\(status)")
      return 0
    }
    return Int(id)
  }

  /// Logs that the voice is ready, with how many sounds it holds and how
  /// long the pass took; answers whether this is the simulator.
  func ready(_ sounds: Int, _ ms: Int) -> Bool {
    NSLog("%@", "[feel] ready sounds=\(sounds) ms=\(ms) simulator=\(Voice.simulator)")
    return Voice.simulator
  }

  /// Plays the sound `load` gave `id` for. On the simulator it logs the
  /// sound by `name` and plays nothing.
  func play(_ id: Int, _ name: String) {
    #if targetEnvironment(simulator)
      NSLog("%@", "[feel] play sound=\(name) skipped=simulator")
    #else
      AudioServicesPlaySystemSound(SystemSoundID(id))
    #endif
  }

  private static let folder = FileManager.default
    .urls(for: .cachesDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("feel", isDirectory: true)

  #if targetEnvironment(simulator)
    private static let simulator = true
  #else
    private static let simulator = false
  #endif
}
