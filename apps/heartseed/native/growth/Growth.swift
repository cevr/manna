import AudioToolbox
import Foundation

/// The growth sound's native side: the sound the app renders becomes a
/// system sound (System Sound Services), and a growth plays it by its id.
///
/// System sounds are the OS's own short alerts: the ring/silent switch
/// mutes them, they play at the ringer's volume, and they mix over any
/// other audio without touching the app's audio session, so Silent mode is
/// respected and a recital's listening session is never disturbed.
///
/// The simulator plays nothing: its system sounds reach the Mac's speaker,
/// so a play there logs the sound and returns.
@MainActor final class Growth: PeachModule {
  init() {}

  /// Writes `wav` under Caches as `<name>-<hash>.wav`, unless that file is
  /// there already, and makes its system sound. Answers the sound's id, or
  /// 0 when the file could not be written or the OS refused it (logged).
  func load(_ name: String, _ hash: String, _ wav: Data) -> Int {
    let file = Growth.folder.appendingPathComponent("\(name)-\(hash).wav")
    if !FileManager.default.fileExists(atPath: file.path) {
      do {
        try FileManager.default.createDirectory(at: Growth.folder, withIntermediateDirectories: true)
        try wav.write(to: file, options: .atomic)
      } catch {
        NSLog("%@", "[growth] load.failed sound=\(name) status=write")
        return 0
      }
    }
    var id: SystemSoundID = 0
    let status = AudioServicesCreateSystemSoundID(file as CFURL, &id)
    if status != noErr {
      NSLog("%@", "[growth] load.failed sound=\(name) status=\(status)")
      return 0
    }
    NSLog("%@", "[growth] load sound=\(name)")
    return Int(id)
  }

  /// Plays the sound `load` gave `id` for, once. On the simulator it logs
  /// the sound by `name` and plays nothing.
  func play(_ id: Int, _ name: String) {
    #if targetEnvironment(simulator)
      NSLog("%@", "[growth] play sound=\(name) skipped=simulator")
    #else
      NSLog("%@", "[growth] play sound=\(name)")
      AudioServicesPlaySystemSound(SystemSoundID(id))
    #endif
  }

  private static let folder = FileManager.default
    .urls(for: .cachesDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("growth", isDirectory: true)
}
