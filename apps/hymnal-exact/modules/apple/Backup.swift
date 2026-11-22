import Foundation

/// The saved recordings' folder kept out of the device's backup, as the
/// current hymnal's `offline/backup.ios.ts` keeps its own: the folder, and
/// so all its children, is marked excluded before any recording is written,
/// and the mark is read back.
///
/// - `backup.exclude { path }`: `path` is an `app:/data/…` folder the data
///   module has made; answers `{ excluded: true }` once the mark reads back,
///   and refuses a path outside `app:/data` or one the mark did not hold on.
final class Backup {
    private static let prefix = "app:/data/"
    private let context: ExactModuleContext

    init(context: ExactModuleContext) {
        self.context = context
    }

    func later(_ request: [String: Any], reply: ExactReply) {
        guard let path = request["path"] as? String, path.hasPrefix(Self.prefix) else {
            return reply.fail("backup.exclude: not an app:/data path")
        }
        let names = path.dropFirst(Self.prefix.count).split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard !names.isEmpty, !names.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else {
            return reply.fail("backup.exclude: not an app:/data path")
        }
        var folder = names.reduce(context.data) { $0.appendingPathComponent($1, isDirectory: true) }
        do {
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try folder.setResourceValues(values)
            folder.removeCachedResourceValue(forKey: .isExcludedFromBackupKey)
            guard try folder.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true else {
                return reply.fail("backup.exclude: the mark did not hold")
            }
            reply.send(["excluded": true])
        } catch {
            reply.fail("backup.exclude: \(error.localizedDescription)")
        }
    }
}
