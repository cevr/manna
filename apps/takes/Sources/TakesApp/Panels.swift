import AppKit
import TakesCore
import UniformTypeIdentifiers

/// The open and save panels the menus and toolbar use.
enum Panels {
  static func openProject(_ model: AppModel) {
    if let url = choose(folders: true, types: [], prompt: "Open Project") { model.open(url) }
  }

  static func importOutline(_ model: AppModel) {
    let types = [UTType(filenameExtension: "md"), .plainText].compactMap(\.self)
    if let url = choose(folders: false, types: types, prompt: "Import Outline") {
      model.importOutline(url)
    }
  }

  static func importAudio(_ model: AppModel) {
    if let url = choose(folders: false, types: [.audio], prompt: "Import Audio") {
      model.importAudio(url)
    }
  }

  static func exportTo(_ model: AppModel) {
    if let url = choose(folders: true, types: [], prompt: "Export Here") { model.export(to: url) }
  }

  private static func choose(folders: Bool, types: [UTType], prompt: String) -> URL? {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = folders
    panel.canChooseFiles = !folders
    panel.canCreateDirectories = folders
    panel.allowsMultipleSelection = false
    panel.prompt = prompt
    if !types.isEmpty { panel.allowedContentTypes = types }
    guard panel.runModal() == .OK else { return nil }
    return panel.url
  }
}

/// Asks for a new project's name; it goes in `~/Documents/Takes/<name>/`.
enum NewProjectPanel {
  static func run(_ model: AppModel) {
    let alert = NSAlert()
    alert.messageText = "New Project"
    alert.informativeText = "The project is a folder in ~/Documents/Takes."
    let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
    field.placeholderString = "Name"
    alert.accessoryView = field
    alert.addButton(withTitle: "Create")
    alert.addButton(withTitle: "Cancel")
    alert.window.initialFirstResponder = field
    guard alert.runModal() == .alertFirstButtonReturn else { return }
    model.newProject(named: field.stringValue)
  }
}
