import {
  ByteSize,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  PlatformError,
  Ref,
  Stream,
} from 'effect';

import { CallSequence, type ServiceCall } from './sequence-recorder.js';

const createFileError = (method: string, path: string, message: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    module: 'FileSystem',
    method,
    pathOrDescriptor: path,
    description: message,
  });

export interface MockFileSystemConfig {
  files: Record<string, string | Uint8Array>;
  directories?: string[];
}

export interface MockFileSystemState {
  files: Map<string, string | Uint8Array>;
  directories: Set<string>;
}

export const createMockFileSystemLayer = (config: MockFileSystemConfig) => {
  const state: MockFileSystemState = {
    files: new Map(Object.entries(config.files)),
    directories: new Set(config.directories ?? []),
  };

  for (const path of state.files.keys()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      state.directories.add(parts.slice(0, i).join('/'));
    }
  }

  const layer = Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const callRef = yield* CallSequence;
      const recordCallSync = (call: ServiceCall): Effect.Effect<void> =>
        Ref.update(callRef, (calls) => [...calls, call]);

      const stat = (path: string) =>
        Effect.gen(function* () {
          const exists = state.files.has(path) || state.directories.has(path);
          if (!exists) {
            return yield* createFileError('stat', path, `File not found: ${path}`);
          }
          const isDirectory = state.directories.has(path);
          let size = state.files.get(path)?.length ?? 0;
          if (isDirectory) {
            size = 0;
          }
          const now = yield* DateTime.nowAsDate;
          let type: 'Directory' | 'File' = 'File';
          if (isDirectory) {
            type = 'Directory';
          }
          return {
            type,
            mtime: Option.some(now),
            atime: Option.some(now),
            birthtime: Option.some(now),
            dev: 0n,
            ino: Option.some(0n),
            mode: 0o644,
            nlink: Option.some(1n),
            uid: Option.some(0),
            gid: Option.some(0),
            rdev: Option.some(0n),
            size: ByteSize.bytes(size),
            blksize: Option.some(ByteSize.bytes(4096)),
            blocks: Option.some(1n),
          };
        });

      const baseFs: FileSystem.FileSystem = FileSystem.make({
        access: () => Effect.void,
        chmod: () => Effect.void,
        chown: () => Effect.void,
        copy: () => Effect.void,
        copyFile: () => Effect.void,
        link: () => Effect.void,
        symlink: () => Effect.void,
        readLink: () => Effect.succeed(''),
        realPath: (path) => Effect.succeed(path),
        rename: () => Effect.void,
        stat,
        lstat: stat,
        readDirectoryEntries: (path) =>
          Effect.map(baseFs.readDirectory(path), (names) =>
            names.map((name): FileSystem.DirectoryEntry => {
              if (state.directories.has(`${path}/${name}`)) return { name, type: 'Directory' };
              return { name, type: 'File' };
            }),
          ),
        truncate: () => Effect.void,
        utimes: () => Effect.void,
        watch: () => Stream.die('watch not implemented in mock'),
        open: () => Effect.die('open not implemented in mock'),

        readFile: (path: string) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.readFile', path });
            const content = Option.fromNullishOr(state.files.get(path));
            if (Option.isNone(content)) {
              return yield* createFileError('readFile', path, `File not found: ${path}`);
            }
            if (content.value instanceof Uint8Array) {
              return content.value;
            }
            return new TextEncoder().encode(content.value);
          }),

        writeFile: (path: string, data: Uint8Array) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.writeFile', path });
            state.files.set(path, data);
            const parts = path.split('/');
            for (let i = 1; i < parts.length; i++) {
              state.directories.add(parts.slice(0, i).join('/'));
            }
          }),

        makeDirectory: (path: string) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.makeDirectory', path });
            state.directories.add(path);
          }),

        makeTempDirectory: () => Effect.succeed('/tmp/test-temp'),
        makeTempDirectoryScoped: () => Effect.succeed('/tmp/test-temp-scoped'),
        makeTempFile: () => Effect.succeed('/tmp/test-temp-file'),
        makeTempFileScoped: () => Effect.succeed('/tmp/test-temp-file-scoped'),

        readDirectory: (path: string) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.readDirectory', path });
            const entries: string[] = [];
            let prefix = `${path}/`;
            if (path.endsWith('/')) {
              prefix = path;
            }

            for (const filePath of state.files.keys()) {
              if (filePath.startsWith(prefix)) {
                const relativePath = filePath.slice(prefix.length);
                const firstPart = relativePath.split('/')[0];
                if (firstPart && !entries.includes(firstPart)) {
                  entries.push(firstPart);
                }
              }
            }

            for (const dirPath of state.directories) {
              if (dirPath.startsWith(prefix)) {
                const relativePath = dirPath.slice(prefix.length);
                const firstPart = relativePath.split('/')[0];
                if (firstPart && !entries.includes(firstPart)) {
                  entries.push(firstPart);
                }
              }
            }

            return entries;
          }),

        remove: (path: string) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.remove', path });
            state.files.delete(path);
            state.directories.delete(path);
          }),
      });

      const mockFs: FileSystem.FileSystem = {
        ...baseFs,
        exists: (path) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.exists', path });
            return state.files.has(path) || state.directories.has(path);
          }),
        readFileString: (path) =>
          Effect.gen(function* () {
            yield* recordCallSync({ _tag: 'FileSystem.readFileString', path });
            const content = Option.fromNullishOr(state.files.get(path));
            if (Option.isNone(content)) {
              return yield* createFileError('readFileString', path, `File not found: ${path}`);
            }
            if (content.value instanceof Uint8Array) {
              return new TextDecoder().decode(content.value);
            }
            return content.value;
          }),
        writeFileString: (path, content) =>
          Effect.gen(function* () {
            yield* recordCallSync({
              _tag: 'FileSystem.writeFileString',
              path,
              content,
            });
            state.files.set(path, content);
            const parts = path.split('/');
            for (let i = 1; i < parts.length; i++) {
              state.directories.add(parts.slice(0, i).join('/'));
            }
          }),
      };

      return mockFs;
    }),
  );

  return {
    layer,
    state,
  };
};
