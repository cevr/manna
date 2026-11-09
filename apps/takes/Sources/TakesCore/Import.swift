import Foundation

extension Edit {
  /// A whole source as a new kept take on a beat; on a new beat, after the last, when `beat` is
  /// absent or not on the list.
  public static func take(
    of source: Source, on beat: BeatID?, in project: Project, name: String, created: Date,
    newBeat: BeatID = .make(), take: TakeID = .make(), clip: ClipID = .make()
  ) -> Edit {
    let clip = Clip(id: clip, source: source.id, inPoint: 0, outPoint: source.frames)
    let made = Take(id: take, name: name, created: created, clips: [clip])
    if let beat, project.document.beats.contains(where: { $0.id == beat }) {
      return .addTake(beat, made, keep: true)
    }
    let title = "Beat \(project.document.beats.count + 1)"
    return .batch([
      .addBeat(Beat(id: newBeat, title: title), at: nil), .addTake(newBeat, made, keep: true),
    ])
  }
}
