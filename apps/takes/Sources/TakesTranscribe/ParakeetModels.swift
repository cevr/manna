import FluidAudio
import Foundation
import TakesCore

/// Where the Parakeet TDT 0.6B v3 models Hex downloaded live; Takes only reads them.
public enum ParakeetModels {
  public static var directory: URL {
    FileManager.default.homeDirectoryForCurrentUser
      .appending(path: "Library/Application Support/FluidAudio/Models/parakeet-tdt-0.6b-v3")
  }

  public static var present: Bool {
    FileManager.default.fileExists(atPath: directory.path(percentEncoded: false))
  }
}
