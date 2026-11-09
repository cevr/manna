/// An audio device as the input picker sees it.
public struct InputDevice: Hashable, Sendable, Identifiable {
  /// The CoreAudio device id: valid while the device stays plugged in.
  public var id: UInt32
  /// The persistent id the choice is remembered by; names can repeat.
  public var uid: String
  public var name: String
  public var inputChannels: Int

  public init(id: UInt32, uid: String, name: String, inputChannels: Int) {
    self.id = id
    self.uid = uid
    self.name = name
    self.inputChannels = inputChannels
  }
}

/// Which input records.
public enum InputChoice {
  public static let preferredName = "Elgato Wave:3"

  /// The remembered input when present; else the Elgato Wave:3; else the system default; else the
  /// first input. Devices with no input channels are never chosen.
  public static func choose(
    _ devices: [InputDevice], remembered: String?, systemDefault: String?
  ) -> InputDevice? {
    let inputs = devices.filter { $0.inputChannels > 0 }
    return inputs.first { $0.uid == remembered }
      ?? inputs.first { $0.name == preferredName }
      ?? inputs.first { $0.uid == systemDefault }
      ?? inputs.first
  }
}
