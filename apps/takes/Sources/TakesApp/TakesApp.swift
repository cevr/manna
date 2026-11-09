import SwiftUI
import TakesCore

@main
struct TakesApp: App {
  var body: some Scene {
    WindowGroup(Takes.name) {
      Text(Takes.name)
        .frame(minWidth: 480, minHeight: 320)
    }
  }
}
