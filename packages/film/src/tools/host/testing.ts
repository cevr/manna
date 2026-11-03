import {
  Array as Arr,
  ByteSize,
  type Console,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Queue,
  Stream,
} from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ContentStore } from '../content-store.ts';
import { ManifestLock, type ManifestLockService } from '../manifest-lock.ts';
import { folderStore } from '../media-store.ts';
import { PrivateStore } from '../private-store.ts';

const refusal = (_tag: PlatformError.SystemErrorTag, method: string, path: string, why?: string) =>
  PlatformError.systemError({
    _tag,
    module: 'FileSystem',
    method,
    pathOrDescriptor: path,
    description: why,
  });

const notFound = (method: string, path: string) => refusal('NotFound', method, path, 'ENOENT');

const pathDown = (path: string): ReadonlyArray<string> => {
  const parts = path.split('/');
  return parts.slice(1).map((_, i) => parts.slice(0, i + 2).join('/'));
};

type Held = 'file' | 'folder' | 'nothing';

const treeOn = (files: Map<string, Uint8Array>, folders: Set<string>) => {
  const holds = (path: string): Held => {
    if (files.has(path)) return 'file';
    const inside = (p: string) => p.startsWith(`${path}/`);
    if (folders.has(path) || [...files.keys()].some(inside) || [...folders].some(inside))
      return 'folder';
    return 'nothing';
  };
  const unplaceable = (
    method: string,
    path: string,
  ): Option.Option<PlatformError.PlatformError> => {
    const parent = path.slice(0, path.lastIndexOf('/'));
    if (parent === '') return Option.none();
    const held = holds(parent);
    if (held === 'nothing') return Option.some(notFound(method, path));
    if (held === 'file') return Option.some(refusal('BadResource', method, path, 'ENOTDIR'));
    return Option.none();
  };
  const realOf = (
    method: string,
    path: string,
  ): Effect.Effect<string, PlatformError.PlatformError> => {
    if (!path.startsWith('/')) return Effect.fail(notFound(method, path));
    const segments: Array<string> = [];
    for (const segment of path.split('/')) {
      if (segment === '..') segments.pop();
      else if (segment !== '' && segment !== '.') segments.push(segment);
    }
    const steps = segments.map((_, i) => `/${segments.slice(0, i + 1).join('/')}`);
    const through = Arr.findFirst(steps.slice(0, -1), (step) => holds(step) !== 'folder');
    if (Option.isSome(through) && holds(through.value) === 'file')
      return Effect.fail(refusal('BadResource', method, path, 'ENOTDIR'));
    const end = Option.getOrElse(Arr.last(steps), () => '/');
    if (Option.isSome(through) || (end !== '/' && holds(end) === 'nothing'))
      return Effect.fail(notFound(method, path));
    return Effect.succeed(end);
  };
  return { holds, unplaceable, realOf };
};

const keyed = <A>(
  path: string,
  use: (key: string) => Effect.Effect<A, PlatformError.PlatformError>,
) => Effect.suspend(() => use(path.replace(/(?<=.)\/+$/, '')));

const placed = <A>(
  method: string,
  path: string,
  use: (key: string) => Effect.Effect<A, PlatformError.PlatformError>,
) => {
  if (path.startsWith('/')) return keyed(path, use);
  return Effect.fail(
    PlatformError.badArgument({
      module: 'FileSystem',
      method,
      description: `the in-memory file system makes absolute paths only: ${path}`,
    }),
  );
};

interface WriteMode {
  readonly append: boolean;
  readonly exclusive: boolean;
}

const WRITE_MODES: Partial<Record<FileSystem.OpenFlag, WriteMode>> = {
  w: { append: false, exclusive: false },
  wx: { append: false, exclusive: true },
  a: { append: true, exclusive: false },
  ax: { append: true, exclusive: true },
};

const writeInto = (
  files: Map<string, Uint8Array>,
  folders: Set<string>,
  method: string,
  asked: string,
  bytes: Uint8Array,
  flag: FileSystem.OpenFlag = 'w',
) =>
  placed(method, asked, (path) => {
    const modelled = Option.fromUndefinedOr(WRITE_MODES[flag]);
    if (Option.isNone(modelled))
      return Effect.fail(
        PlatformError.badArgument({
          module: 'FileSystem',
          method,
          description: `the in-memory file system models no '${flag}' write (only w, wx, a, ax): ${path}`,
        }),
      );
    const mode = modelled.value;
    const tree = treeOn(files, folders);
    const unplaced = tree.unplaceable(method, path);
    if (Option.isSome(unplaced)) return Effect.fail(unplaced.value);
    const held = tree.holds(path);
    if (mode.exclusive && held !== 'nothing')
      return Effect.fail(refusal('AlreadyExists', method, path, 'EEXIST'));
    if (held === 'folder') return Effect.fail(refusal('BadResource', method, path, 'EISDIR'));
    const landed = Option.match(
      Option.filter(Option.fromUndefinedOr(files.get(path)), () => mode.append),
      {
        onNone: () => bytes,
        onSome: (before) => {
          const joined = new Uint8Array(before.length + bytes.length);
          joined.set(before);
          joined.set(bytes, before.length);
          return joined;
        },
      },
    );
    files.set(path, landed);
    return Effect.void;
  });

const byteCount = (input: ByteSize.Input): number =>
  Number(ByteSize.toBigInt(ByteSize.fromInputUnsafe(input)));

const infoOf = (
  type: FileSystem.File.Type,
  size: number,
  mtime: Option.Option<number>,
): FileSystem.File.Info => ({
  type,
  mtime: Option.map(mtime, (at) => DateTime.toDate(DateTime.makeUnsafe(at))),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0n,
  ino: Option.none(),
  mode: 0o644,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(size),
  blksize: Option.none(),
  blocks: Option.none(),
});

const memoryOps = (
  files: Map<string, Uint8Array>,
  folders = new Set<string>(),
  mtimes: ReadonlyMap<string, number> = new Map(),
) => {
  const tree = treeOn(files, folders);
  const tempFolder = (prefix = 'tmp-', directory = '/tmp') => {
    let n = 1;
    while (folders.has(`${directory}/${prefix}${n}`)) n += 1;
    const dir = `${directory}/${prefix}${n}`;
    folders.add(dir);
    return dir;
  };
  const atOrUnder = (path: string) => (p: string) => p === path || p.startsWith(`${path}/`);
  const drop = (path: string) => {
    for (const file of [...files.keys()].filter(atOrUnder(path))) files.delete(file);
    for (const folder of [...folders].filter(atOrUnder(path))) folders.delete(folder);
  };
  const fileAt = (
    method: string,
    key: string,
    ofFolder = () => refusal('BadResource', method, key, 'EISDIR'),
  ) =>
    Effect.fromOption(Option.fromUndefinedOr(files.get(key)), () => {
      if (tree.holds(key) === 'folder') return ofFolder();
      return notFound(method, key);
    });
  const bytesAt = (method: string, path: string) => keyed(path, (key) => fileAt(method, key));
  const tempFile = (
    method: string,
    options?: { readonly directory?: string; readonly prefix?: string; readonly suffix?: string },
  ) =>
    placed(method, options?.directory ?? '/tmp', (directory) => {
      if (directory !== '/tmp' && tree.holds(directory) !== 'folder')
        return Effect.fail(notFound(method, directory));
      return Effect.sync(() => {
        const file = `${tempFolder(options?.prefix, directory)}/file${options?.suffix ?? ''}`;
        files.set(file, new Uint8Array(0));
        return file;
      });
    });
  return {
    exists: (path) =>
      keyed(path, (key) => {
        if (tree.holds(key) !== 'nothing') return Effect.succeed(true);
        const below = [...files.keys()].some((file) => key.startsWith(`${file}/`));
        if (below) return Effect.fail(refusal('BadResource', 'exists', key, 'ENOTDIR'));
        return Effect.succeed(false);
      }),
    realPath: (path) => keyed(path, (key) => tree.realOf('realPath', key)),
    readFile: (path) => bytesAt('readFile', path),
    readFileString: (path) =>
      Effect.map(bytesAt('readFileString', path), (bytes) => new TextDecoder().decode(bytes)),
    writeFile: (path, data, options) =>
      writeInto(files, folders, 'writeFile', path, data, options?.flag),
    writeFileString: (path, data, options) =>
      writeInto(files, folders, 'writeFileString', path, text(data), options?.flag),
    copyFile: (from, to) =>
      Effect.flatMap(
        keyed(from, (key) =>
          fileAt('copyFile', key, () => refusal('Unknown', 'copyFile', key, 'EISDIR')),
        ),
        (bytes) => writeInto(files, folders, 'copyFile', to, bytes.slice()),
      ),
    makeDirectory: (path, options) =>
      placed('makeDirectory', path, (key) => {
        const recursive = options?.recursive === true;
        const held = tree.holds(key);
        if (held === 'file' || (held === 'folder' && !recursive))
          return Effect.fail(refusal('AlreadyExists', 'makeDirectory', key, 'EEXIST'));
        if (!recursive)
          return Option.match(tree.unplaceable('makeDirectory', key), {
            onSome: Effect.fail,
            onNone: () => Effect.sync(() => void folders.add(key)),
          });
        const down = pathDown(key);
        if (down.some((folder) => tree.holds(folder) === 'file'))
          return Effect.fail(refusal('BadResource', 'makeDirectory', key, 'ENOTDIR'));
        return Effect.sync(() => {
          for (const folder of down) folders.add(folder);
        });
      }),
    rename: (from, to) =>
      keyed(from, (source) =>
        placed('rename', to, (target) => {
          const moving = tree.holds(source);
          if (moving === 'nothing') return Effect.fail(notFound('rename', source));
          const unplaced = tree.unplaceable('rename', target);
          if (Option.isSome(unplaced)) return Effect.fail(unplaced.value);
          const there = tree.holds(target);
          if (moving === 'file') {
            if (there === 'folder')
              return Effect.fail(refusal('BadResource', 'rename', target, 'EISDIR'));
            return Effect.map(fileAt('rename', source), (bytes) => {
              files.delete(source);
              files.set(target, bytes);
            });
          }
          if (atOrUnder(source)(target))
            return Effect.fail(refusal('Unknown', 'rename', target, 'EINVAL'));
          if (there === 'file')
            return Effect.fail(refusal('BadResource', 'rename', target, 'ENOTDIR'));
          const holding = [...files.keys(), ...folders].some((p) => p.startsWith(`${target}/`));
          if (holding) return Effect.fail(refusal('Unknown', 'rename', target, 'ENOTEMPTY'));
          return Effect.sync(() => {
            const moved = (p: string) => `${target}${p.slice(source.length)}`;
            const movedFiles = [...files].filter(([p]) => atOrUnder(source)(p));
            const movedFolders = [...folders].filter(atOrUnder(source));
            drop(source);
            for (const [p, bytes] of movedFiles) files.set(moved(p), bytes);
            for (const folder of [target, ...movedFolders.map(moved)]) folders.add(folder);
          });
        }),
      ),
    remove: (path, options) =>
      keyed(path, (key) => {
        const held = tree.holds(key);
        if (held === 'nothing' && options?.force === true) return Effect.void;
        if (held === 'nothing') return Effect.fail(notFound('remove', key));
        if (held === 'folder' && options?.recursive !== true)
          return Effect.fail(refusal('Unknown', 'remove', key, 'ERR_FS_EISDIR'));
        return Effect.sync(() => drop(key));
      }),
    makeTempDirectory: (options) => Effect.sync(() => tempFolder(options?.prefix)),
    makeTempDirectoryScoped: (options) =>
      Effect.acquireRelease(
        Effect.sync(() => tempFolder(options?.prefix)),
        (dir) => Effect.sync(() => drop(dir)),
      ),
    makeTempFile: (options) => tempFile('makeTempFile', options),
    makeTempFileScoped: (options) =>
      Effect.acquireRelease(tempFile('makeTempFileScoped', options), (file) =>
        Effect.sync(() => drop(file.slice(0, file.lastIndexOf('/')))),
      ),
    readDirectory: (path, options) =>
      keyed(path, (key) => {
        const held = tree.holds(key);
        if (held === 'nothing') return Effect.fail(notFound('readDirectory', key));
        if (held === 'file')
          return Effect.fail(refusal('BadResource', 'readDirectory', key, 'ENOTDIR'));
        const under = [...files.keys(), ...folders]
          .filter((p) => p.startsWith(`${key}/`))
          .map((p) => p.slice(key.length + 1).split('/'));
        const depth = (parts: ReadonlyArray<string>) => {
          if (options?.recursive === true) return parts.length;
          return 1;
        };
        const names = under.flatMap((parts) =>
          parts.slice(0, depth(parts)).map((_, i) => parts.slice(0, i + 1).join('/')),
        );
        return Effect.succeed([...new Set(names)]);
      }),
    link: (from, to) =>
      keyed(from, (source) =>
        placed('link', to, (target) =>
          Effect.flatMap(
            fileAt('link', source, () => refusal('Unknown', 'link', source, 'EPERM')),
            (bytes) => {
              const unplaced = tree.unplaceable('link', target);
              if (Option.isSome(unplaced)) return Effect.fail(unplaced.value);
              if (tree.holds(target) !== 'nothing')
                return Effect.fail(refusal('AlreadyExists', 'link', target, 'EEXIST'));
              return Effect.sync(() => void files.set(target, bytes.slice()));
            },
          ),
        ),
      ),
    stat: (path) =>
      keyed(path, (key) => {
        const held = tree.holds(key);
        if (held === 'nothing') return Effect.fail(notFound('stat', key));
        const mtime = Option.fromUndefinedOr(mtimes.get(key));
        return Effect.succeed(
          Option.match(Option.fromUndefinedOr(files.get(key)), {
            onSome: (bytes) => infoOf('File', bytes.byteLength, mtime),
            onNone: () => infoOf('Directory', 0, mtime),
          }),
        );
      }),
    stream: (path, options) =>
      Stream.fromEffect(bytesAt('stream', path)).pipe(
        Stream.map((bytes) => {
          const from = Option.getOrElse(
            Option.map(Option.fromNullishOr(options?.offset), byteCount),
            () => 0,
          );
          const count = Option.map(Option.fromNullishOr(options?.bytesToRead), byteCount);
          return bytes.slice(
            from,
            Option.getOrElse(
              Option.map(count, (n) => from + n),
              () => bytes.byteLength,
            ),
          );
        }),
      ),
  } satisfies Partial<FileSystem.FileSystem>;
};

export const memoryFileSystem = (
  files: Map<string, Uint8Array>,
  folders: Set<string> = new Set(),
  mtimes: ReadonlyMap<string, number> = new Map(),
) => FileSystem.layerNoop(memoryOps(files, folders, mtimes));

export const crashingFileSystem = (files: Map<string, Uint8Array>, nth: number) => {
  const ops = memoryOps(files);
  let count = 0;
  const gone = () => nth > 0 && count >= nth;
  const crashed = (method: string, path: string) =>
    PlatformError.systemError({
      _tag: 'Unknown',
      module: 'FileSystem',
      method,
      pathOrDescriptor: path,
      description: 'crash',
    });
  const after = (method: string, path: string) =>
    Effect.suspend(() => {
      if (gone()) return Effect.fail(crashed(method, path));
      return Effect.void;
    });
  const crash = (method: string, path: string) =>
    Effect.suspend(() => {
      count += 1;
      return after(method, path);
    });
  const layer = FileSystem.layerNoop({
    ...ops,
    writeFile: (path, data, options) =>
      crash('writeFile', path).pipe(Effect.andThen(ops.writeFile(path, data, options))),
    rename: (from, to) => crash('rename', from).pipe(Effect.andThen(ops.rename(from, to))),
    remove: (path, options) =>
      crash('remove', path).pipe(Effect.andThen(ops.remove(path, options))),
    writeFileString: (path, data, options) =>
      after('writeFileString', path).pipe(Effect.andThen(ops.writeFileString(path, data, options))),
    makeDirectory: (path, options) =>
      after('makeDirectory', path).pipe(Effect.andThen(ops.makeDirectory(path, options))),
    link: (from, to) => after('link', to).pipe(Effect.andThen(ops.link(from, to))),
  });
  return { layer, ops: () => count };
};

export const text = (s: string) => new TextEncoder().encode(s);

export const privateFolder = (root: string) =>
  Layer.effect(
    PrivateStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      return PrivateStore.of({ store: Effect.succeed(folderStore(fs, path, root)) });
    }),
  );

export const memoryManifestLock = (): ManifestLockService => {
  const held = new Set<string>();
  return {
    take: (file) =>
      Effect.sync(() => {
        if (held.has(file)) return Option.none();
        held.add(file);
        return Option.some(Effect.sync(() => void held.delete(file)));
      }),
  };
};

export const memoryLocks = Layer.sync(ManifestLock, memoryManifestLock);

export const storeLayer = (files: Map<string, Uint8Array>) =>
  ContentStore.layer.pipe(Layer.provide([memoryFileSystem(files), Path.layer, memoryLocks]));

export const printingTo = (lines: Queue.Queue<string>): Console.Console => ({
  ...globalThis.console,
  log: (...args: ReadonlyArray<unknown>) => {
    Queue.offerUnsafe(lines, args.map(String).join(' '));
  },
});
