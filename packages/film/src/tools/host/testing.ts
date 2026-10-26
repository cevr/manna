// The host in memory for the tool tests: a file system that writes as a disk
// does for each flag it models (and one that crashes on a chosen write), a
// console that prints into a queue, the manifest locks, and the content and
// private stores over them. No disk.

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

/** A refusal of `method` on `path`, filed under the kind Effect gives Node's error (`why`, its code). */
const refusal = (_tag: PlatformError.SystemErrorTag, method: string, path: string, why?: string) =>
  PlatformError.systemError({
    _tag,
    module: 'FileSystem',
    method,
    pathOrDescriptor: path,
    description: why,
  });

const notFound = (method: string, path: string) => refusal('NotFound', method, path, 'ENOENT');

/** Every folder from the root down to `path`, `path` included. */
const pathDown = (path: string): ReadonlyArray<string> => {
  const parts = path.split('/');
  return parts.slice(1).map((_, i) => parts.slice(0, i + 2).join('/'));
};

/** What a path holds in the in-memory tree. */
type Held = 'file' | 'folder' | 'nothing';

/**
 * The in-memory tree over a map of path → bytes and the set of folders made:
 * what a path holds (a folder is there when made, or when a file or a folder
 * is made under it), and why a path cannot be made.
 */
const treeOn = (files: Map<string, Uint8Array>, folders: Set<string>) => {
  const holds = (path: string): Held => {
    if (files.has(path)) return 'file';
    const inside = (p: string) => p.startsWith(`${path}/`);
    if (folders.has(path) || [...files.keys()].some(inside) || [...folders].some(inside))
      return 'folder';
    return 'nothing';
  };
  /**
   * Why `path` cannot be made, as Node refuses it: its folder never made
   * (ENOENT) or a file (ENOTDIR); none when it can, a path at the root
   * included.
   */
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
  /**
   * Where `path` leads, as Node's `realpath` resolves it in a tree with no
   * links: its `.`, `..` and empty segments first, as `path.resolve` takes
   * them (so `nope/../a` is `a`, whether `nope` is there or not), then each
   * folder down to it. Refused as Node refuses it: a step through a file
   * (ENOTDIR), or one that is not there (ENOENT), a relative path among them.
   */
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

/** `use` given `path` as the tree keys it: with no trailing slash. */
const keyed = <A>(
  path: string,
  use: (key: string) => Effect.Effect<A, PlatformError.PlatformError>,
) => Effect.suspend(() => use(path.replace(/(?<=.)\/+$/, '')));

/**
 * `use` given `path` to make (`keyed`). A path that is not absolute (a
 * relative one, or a Windows one) is BadArgument: the in-memory file system
 * has no folder to make it in, so it refuses it rather than guess one. Read,
 * such a path is simply not there.
 */
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

/** How a write lands: over what is there or after it, and whether only a path not there takes it. */
interface WriteMode {
  readonly append: boolean;
  readonly exclusive: boolean;
}

/** The write flags this file system models; any other is refused, never taken for a plain write. */
const WRITE_MODES: Partial<Record<FileSystem.OpenFlag, WriteMode>> = {
  w: { append: false, exclusive: false },
  wx: { append: false, exclusive: true },
  a: { append: true, exclusive: false },
  ax: { append: true, exclusive: true },
};

/**
 * `path` written with `bytes` as `flag` says (`w` when none), as Node writes
 * it: NotFound when its folder was never made (ENOENT), BadResource when that
 * is a file (ENOTDIR) or `path` is a folder (EISDIR). `a` and `ax` add the
 * bytes after the file's; `wx` and `ax` (create, never replace) refuse a
 * path already there, a file or a folder, as AlreadyExists, as Node's
 * EEXIST: a lock taken that way is refused while another holds it. A flag
 * not modelled is BadArgument, naming it. The checks, the join and the set
 * are one synchronous step, so writes run at once all land, as on a disk.
 */
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
    // Set in the same synchronous step as the read above: no other write lands between.
    files.set(path, landed);
    return Effect.void;
  });

/** A byte count as a number. */
const byteCount = (input: ByteSize.Input): number =>
  Number(ByteSize.toBigInt(ByteSize.fromInputUnsafe(input)));

/** What `stat` answers: a path's kind, its size, and its mtime when the test keeps one. */
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

/**
 * File operations over a map of path → bytes, and `folders`, the set of
 * folders made (a folder with files in it exists whether made or not), so a
 * test can see a folder left empty. Each refuses what Node's file system
 * refuses, filed under the same kind: the contract in `testing.test.ts` runs
 * every one against both. One thing it does not model: a link copies the
 * bytes, so a write in place through one name is not seen through the other
 * (no tool writes through a linked name).
 */
const memoryOps = (
  files: Map<string, Uint8Array>,
  folders = new Set<string>(),
  mtimes: ReadonlyMap<string, number> = new Map(),
) => {
  const tree = treeOn(files, folders);
  /** A folder in `directory` (`/tmp`, unless given) no other call has made: `<prefix><n>`. */
  const tempFolder = (prefix = 'tmp-', directory = '/tmp') => {
    let n = 1;
    while (folders.has(`${directory}/${prefix}${n}`)) n += 1;
    const dir = `${directory}/${prefix}${n}`;
    folders.add(dir);
    return dir;
  };
  /** Every path at or under `path`: the folder's own and all it holds. */
  const atOrUnder = (path: string) => (p: string) => p === path || p.startsWith(`${path}/`);
  /** `path` gone, with everything under it. */
  const drop = (path: string) => {
    for (const file of [...files.keys()].filter(atOrUnder(path))) files.delete(file);
    for (const folder of [...folders].filter(atOrUnder(path))) folders.delete(folder);
  };
  /**
   * The bytes of the file at `key`: NotFound when nothing is there, and
   * `ofFolder` for a folder (Node's EISDIR to a read).
   */
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
  /**
   * An empty file in a folder of its own, made in `directory` (`/tmp`, unless
   * given; NotFound when no folder is there), as Node's `makeTempFile` makes it.
   */
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
    // Whether a path is there; a path below a file is refused (ENOTDIR), as Node's stat does.
    exists: (path) =>
      keyed(path, (key) => {
        if (tree.holds(key) !== 'nothing') return Effect.succeed(true);
        const below = [...files.keys()].some((file) => key.startsWith(`${file}/`));
        if (below) return Effect.fail(refusal('BadResource', 'exists', key, 'ENOTDIR'));
        return Effect.succeed(false);
      }),
    // The path as the tree resolves it (it holds no links), or Node's refusal.
    realPath: (path) => keyed(path, (key) => tree.realOf('realPath', key)),
    readFile: (path) => bytesAt('readFile', path),
    readFileString: (path) =>
      Effect.map(bytesAt('readFileString', path), (bytes) => new TextDecoder().decode(bytes)),
    writeFile: (path, data, options) =>
      writeInto(files, folders, 'writeFile', path, data, options?.flag),
    writeFileString: (path, data, options) =>
      writeInto(files, folders, 'writeFileString', path, text(data), options?.flag),
    // A file's bytes written whole at another path, as Node's `copyFile` writes them; a
    // folder is refused as Bun refuses it, its kind unknown.
    copyFile: (from, to) =>
      Effect.flatMap(
        keyed(from, (key) =>
          fileAt('copyFile', key, () => refusal('Unknown', 'copyFile', key, 'EISDIR')),
        ),
        (bytes) => writeInto(files, folders, 'copyFile', to, bytes.slice()),
      ),
    // Made as Node's `mkdir` makes it: one folder in a folder that is there
    // (ENOENT when not, EEXIST when the path is taken), or with `recursive`
    // every folder down to it (ENOTDIR through a file, EEXIST on one).
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
    // Moved as Node's `rename` moves it, into a folder that is there: a file
    // over a file (EISDIR over a folder); a folder, with all it holds, to a
    // path that is free or an empty folder (ENOTDIR over a file, ENOTEMPTY
    // over a folder holding anything, EINVAL into itself).
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
    // Removed as Node's `rm` removes it: NotFound for nothing there unless
    // `force`; a folder, empty or not, with everything in it only when
    // `recursive` asks (Node's ERR_FS_EISDIR, which Effect files as Unknown).
    remove: (path, options) =>
      keyed(path, (key) => {
        const held = tree.holds(key);
        if (held === 'nothing' && options?.force === true) return Effect.void;
        if (held === 'nothing') return Effect.fail(notFound('remove', key));
        if (held === 'folder' && options?.recursive !== true)
          return Effect.fail(refusal('Unknown', 'remove', key, 'ERR_FS_EISDIR'));
        return Effect.sync(() => drop(key));
      }),
    // A new folder each call, as the system's are.
    makeTempDirectory: (options) => Effect.sync(() => tempFolder(options?.prefix)),
    // The same, gone with everything in it when the scope closes, as the system's is.
    makeTempDirectoryScoped: (options) =>
      Effect.acquireRelease(
        Effect.sync(() => tempFolder(options?.prefix)),
        (dir) => Effect.sync(() => drop(dir)),
      ),
    // An empty file in a new folder, as Node's are; the scoped one gone, its
    // folder and all, when the scope closes.
    makeTempFile: (options) => tempFile('makeTempFile', options),
    makeTempFileScoped: (options) =>
      Effect.acquireRelease(tempFile('makeTempFileScoped', options), (file) =>
        Effect.sync(() => drop(file.slice(0, file.lastIndexOf('/')))),
      ),
    // The names in a folder, made or holding a file, or with `recursive`
    // every path under it; NotFound for nothing there, BadResource for a
    // file (ENOTDIR).
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
    // A second name for a file, where nothing is (EEXIST when taken), in a
    // folder that is there. Its bytes are copied (see above).
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
    // A file's size and kind, as a file server reads them before it answers a range,
    // a folder's kind, and its mtime when the test keeps one (`mtimes`).
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
    // A file's bytes from `offset`, `bytesToRead` of them when given, as one chunk.
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

/**
 * A file system over a map of path → bytes, the set of folders made in it,
 * and the mtimes the test keeps (none for a file it keeps none for).
 */
export const memoryFileSystem = (
  files: Map<string, Uint8Array>,
  folders: Set<string> = new Set(),
  mtimes: ReadonlyMap<string, number> = new Map(),
) => FileSystem.layerNoop(memoryOps(files, folders, mtimes));

/**
 * `files`, whose `nth` write, rename or remove (counting from 1) fails as a
 * crash would, and every one after it: the process is gone, so nothing after
 * it lands, not even a cleanup that catches the failure. Every op before it has landed. `nth` 0 never crashes. `ops()` counts the
 * writes, renames and removes attempted so far.
 */
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
  /** A write the count leaves out (a text file, a folder, a link): after the crash it lands no more than the rest. */
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

/** A private store in the folder `root`, on whatever disk the test gives: nothing reaches a bucket. */
export const privateFolder = (root: string) =>
  Layer.effect(
    PrivateStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      return PrivateStore.of({ store: Effect.succeed(folderStore(fs, path, root)) });
    }),
  );

/**
 * Manifest locks held in memory, as one host's kernel holds them: every
 * store built over the same one is another process, as far as its locks
 * know. A holder lets go when its change ends, however it ends.
 */
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

/** Manifest locks in memory (`memoryManifestLock`), fresh each time the layer is built. */
export const memoryLocks = Layer.sync(ManifestLock, memoryManifestLock);

/** A store over `files`, its locks in memory, its own. */
export const storeLayer = (files: Map<string, Uint8Array>) =>
  ContentStore.layer.pipe(Layer.provide([memoryFileSystem(files), Path.layer, memoryLocks]));

/** The console a run prints to: each line it logs, offered to `lines`. */
export const printingTo = (lines: Queue.Queue<string>): Console.Console => ({
  ...globalThis.console,
  log: (...args: ReadonlyArray<unknown>) => {
    Queue.offerUnsafe(lines, args.map(String).join(' '));
  },
});
