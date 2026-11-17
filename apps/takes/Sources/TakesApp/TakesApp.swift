import AppKit
import SwiftUI
import TakesCore

/// Hands files opened from Finder or `open -a` to the model, and saves on quit.
final class AppDelegate: NSObject, NSApplicationDelegate {
  let model = AppModel()

  func applicationDidFinishLaunching(_ notification: Notification) {
    model.openAtLaunch(arguments: ProcessInfo.processInfo.arguments)
  }

  func application(_ application: NSApplication, open urls: [URL]) {
    urls.forEach(model.openFile)
  }

  func applicationWillTerminate(_ notification: Notification) {
    model.stopRecording()
    model.save()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }
}

@main
struct TakesApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

  var body: some Scene {
    Window(Takes.name, id: "main") {
      RootView(model: delegate.model)
        .frame(minWidth: 820, minHeight: 560)
    }
    .defaultSize(width: 1_100, height: 760)
    .commands { TakesCommands(model: delegate.model) }
  }
}

struct TakesCommands: Commands {
  let model: AppModel

  var body: some Commands {
    CommandGroup(replacing: .newItem) {
      Button("New Project…") { NewProjectPanel.run(model) }.keyboardShortcut("n")
      Button("Open Project…") { Panels.openProject(model) }.keyboardShortcut("o")
    }
    CommandGroup(replacing: .undoRedo) {
      Button("Undo") { model.undo() }.keyboardShortcut("z")
        .disabled(!model.editor.history.canUndo)
      Button("Redo") { model.redo() }.keyboardShortcut("z", modifiers: [.command, .shift])
        .disabled(!model.editor.history.canRedo)
    }
    CommandGroup(after: .importExport) {
      Button("Import Outline…") { Panels.importOutline(model) }
        .keyboardShortcut("i", modifiers: [.command, .shift]).disabled(!model.hasProject)
      Button("Import Audio…") { Panels.importAudio(model) }
        .keyboardShortcut("i").disabled(!model.hasProject)
      Divider()
      Button("Export") { model.export() }.keyboardShortcut("e").disabled(!model.hasProject)
      Button("Export To…") { Panels.exportTo(model) }
        .keyboardShortcut("e", modifiers: [.command, .shift]).disabled(!model.hasProject)
    }
    CommandMenu("Record") {
      Button(recordTitle(session: false)) { model.toggleRecording(session: false) }
        .keyboardShortcut("r").disabled(!model.hasProject)
      Button(recordTitle(session: true)) { model.toggleRecording(session: true) }
        .keyboardShortcut("r", modifiers: [.command, .shift]).disabled(!model.hasProject)
      Divider()
      Button("Play Beat") { model.togglePlay() }.keyboardShortcut("p")
      Button("Play Film") { model.playFilm() }.keyboardShortcut("p", modifiers: [.command, .shift])
      Button("Stop Playing") { model.stopPlaying() }.keyboardShortcut(".")
    }
  }

  private func recordTitle(session: Bool) -> String {
    if model.recording != nil { return "Stop Recording" }
    if session { return "Record Session" }
    return "Record Take"
  }
}
