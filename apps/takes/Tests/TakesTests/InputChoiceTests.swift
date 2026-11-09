import TakesCore
import Testing

private let wave = InputDevice(id: 1, uid: "wave", name: "Elgato Wave:3", inputChannels: 1)
private let builtIn = InputDevice(
  id: 2, uid: "builtin", name: "MacBook Pro Microphone", inputChannels: 1)
private let phone = InputDevice(id: 3, uid: "phone", name: "iPhone Microphone", inputChannels: 1)
private let speakers = InputDevice(id: 4, uid: "speakers", name: "Speakers", inputChannels: 0)

@Test func `the remembered input wins when it is plugged in`() {
  #expect(
    InputChoice.choose([wave, builtIn], remembered: "builtin", systemDefault: "wave") == builtIn)
}

@Test func `else the Elgato Wave:3, else the system default, else the first input`() {
  #expect(
    InputChoice.choose([builtIn, wave], remembered: "gone", systemDefault: "builtin") == wave)
  #expect(
    InputChoice.choose([builtIn, phone], remembered: "gone", systemDefault: "phone") == phone)
  #expect(
    InputChoice.choose([speakers, builtIn, phone], remembered: "", systemDefault: "x") == builtIn)
}

@Test func `devices without input channels are never chosen`() {
  #expect(InputChoice.choose([speakers], remembered: "speakers", systemDefault: "speakers") == nil)
  let named = InputDevice(id: 5, uid: "out", name: "Elgato Wave:3", inputChannels: 0)
  #expect(InputChoice.choose([named, phone], remembered: "out", systemDefault: "out") == phone)
}
