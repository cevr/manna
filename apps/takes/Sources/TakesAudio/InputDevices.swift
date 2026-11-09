import CoreAudio
import Foundation
import TakesCore

/// The Mac's audio devices, read from CoreAudio.
public enum InputDevices {
  /// Every device, inputs or not; `InputChoice` picks among those with input channels.
  public static func all() -> [InputDevice] {
    var address = globalAddress(kAudioHardwarePropertyDevices)
    let system = AudioObjectID(kAudioObjectSystemObject)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size) == noErr else {
      return []
    }
    var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
    guard AudioObjectGetPropertyData(system, &address, 0, nil, &size, &ids) == noErr else {
      return []
    }
    return ids.compactMap(device)
  }

  /// The UID of the system's default input.
  public static func defaultInputUID() -> String? {
    var address = globalAddress(kAudioHardwarePropertyDefaultInputDevice)
    var id = AudioDeviceID(0)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    guard
      AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &id) == noErr, id != 0
    else { return nil }
    return string(id, kAudioDevicePropertyDeviceUID)
  }

  static func device(_ id: AudioDeviceID) -> InputDevice? {
    guard let uid = string(id, kAudioDevicePropertyDeviceUID) else { return nil }
    return InputDevice(
      id: id, uid: uid, name: string(id, kAudioObjectPropertyName) ?? uid,
      inputChannels: inputChannels(id))
  }

  private static func globalAddress(_ selector: AudioObjectPropertySelector)
    -> AudioObjectPropertyAddress
  {
    AudioObjectPropertyAddress(
      mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain)
  }

  private static func string(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector)
    -> String?
  {
    var address = globalAddress(selector)
    var value: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    let status = withUnsafeMutablePointer(to: &value) { pointer in
      AudioObjectGetPropertyData(id, &address, 0, nil, &size, pointer)
    }
    guard status == noErr, let value else { return nil }
    return value.takeRetainedValue() as String
  }

  private static func inputChannels(_ id: AudioObjectID) -> Int {
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioDevicePropertyStreamConfiguration, mScope: kAudioObjectPropertyScopeInput,
      mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(id, &address, 0, nil, &size) == noErr, size > 0 else {
      return 0
    }
    let raw = UnsafeMutableRawPointer.allocate(
      byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
    defer { raw.deallocate() }
    guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, raw) == noErr else { return 0 }
    let list = UnsafeMutableAudioBufferListPointer(
      raw.assumingMemoryBound(to: AudioBufferList.self))
    return list.reduce(0) { $0 + Int($1.mNumberChannels) }
  }
}

/// Calls back on the main queue whenever a device is plugged in or out, until released.
public final class InputDeviceWatch {
  private let block: AudioObjectPropertyListenerBlock
  private var address = AudioObjectPropertyAddress(
    mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain)

  public init(_ onChange: @escaping @Sendable () -> Void) {
    block = { _, _ in onChange() }
    AudioObjectAddPropertyListenerBlock(
      AudioObjectID(kAudioObjectSystemObject), &address, DispatchQueue.main, block)
  }

  deinit {
    AudioObjectRemovePropertyListenerBlock(
      AudioObjectID(kAudioObjectSystemObject), &address, DispatchQueue.main, block)
  }
}
