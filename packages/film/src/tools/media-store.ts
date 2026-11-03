import { Effect, type FileSystem, Option, type Path, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { writeWhole } from './content-store.ts';
import { sha256OfFile } from './digest.ts';
import { StoreFailed } from './errors.ts';

export interface StoredObject {
  readonly key: string;
  readonly size: number;
  readonly modified: string;
}

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

export interface StoredRead {
  readonly size: number;
  readonly start: number;
  readonly end: number;
  readonly stream: Stream.Stream<Uint8Array, StoreFailed>;
}

export interface MediaStoreService {
  readonly where: string;
  readonly hashOf: (key: string) => Effect.Effect<Option.Option<string>, StoreFailed>;
  readonly get: (key: string, to: string) => Effect.Effect<void, StoreFailed>;
  readonly put: (key: string, from: string) => Effect.Effect<void, StoreFailed>;
  readonly list: (prefix: string) => Effect.Effect<ReadonlyArray<StoredObject>, StoreFailed>;
  readonly read: (
    key: string,
    range: Option.Option<ByteRange>,
  ) => Effect.Effect<Option.Option<StoredRead>, StoreFailed>;
}

export interface PrivateFile {
  readonly key: string;
  readonly file: string;
  readonly sha256: string;
}

export interface Scores {
  readonly files: ReadonlyArray<PrivateFile>;
}

export const NO_SCORES: Scores = { files: [] };

export const scoreKey = (film: string, file: string): string => `scores/${film}/${file}`;

export const RENDERS = 'renders/';

export const renderKey = (
  path: Path.Path,
  outputs: string,
  file: string,
  under: Option.Option<string>,
): string =>
  Option.match(under, {
    onSome: (dir) => `${RENDERS}${dir.replace(/^\/+|\/+$/g, '')}/${path.basename(file)}`,
    onNone: () => {
      const rel = path.relative(outputs, file);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return `${RENDERS}${path.basename(file)}`;
      return `${RENDERS}${rel.split(path.sep).join('/')}`;
    },
  });

export const expandHome = (file: string, home: string): string => {
  if (file === '~') return home;
  if (file.startsWith('~/')) return `${home}${file.slice(1)}`;
  return file;
};

export const clampRange = (
  range: Option.Option<ByteRange>,
  size: number,
): Option.Option<ByteRange> =>
  Option.match(range, {
    onNone: () => Option.some({ start: 0, end: Math.max(0, size - 1) }),
    onSome: ({ start, end }) =>
      Option.liftPredicate({ start, end: Math.min(end, size - 1) }, (r) => r.start < size),
  });

export const folderStore = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
): MediaStoreService => {
  const failed =
    (op: string, key: string) =>
    (error: PlatformError): StoreFailed =>
      StoreFailed.make({ store: root, op, key, reason: error.message });
  const copyWhole = (from: string, to: string) =>
    Effect.gen(function* () {
      yield* fs.makeDirectory(path.dirname(to), { recursive: true });
      yield* writeWhole(fs, to, (partial) => fs.copyFile(from, partial));
    });
  const hashOf = (key: string) =>
    Effect.gen(function* () {
      const at = path.join(root, key);
      if (!(yield* fs.exists(at))) return Option.none<string>();
      return Option.some(yield* sha256OfFile(fs, at));
    }).pipe(Effect.mapError(failed('hash', key)));
  const list = (prefix: string) =>
    Effect.gen(function* () {
      if (!(yield* fs.exists(root))) return [];
      const found: Array<StoredObject> = [];
      for (const key of yield* fs.readDirectory(root, { recursive: true })) {
        if (!key.startsWith(prefix) || key.endsWith('.partial')) continue;
        const info = yield* fs.stat(path.join(root, key));
        if (info.type !== 'File') continue;
        found.push({
          key,
          size: Number(info.size),
          modified: Option.match(info.mtime, { onNone: () => '', onSome: (d) => d.toISOString() }),
        });
      }
      return found.toSorted((a, b) => a.key.localeCompare(b.key));
    }).pipe(Effect.mapError(failed('list', prefix)));
  const read = (key: string, range: Option.Option<ByteRange>) =>
    Effect.gen(function* () {
      const at = path.join(root, key);
      if (!(yield* fs.exists(at).pipe(Effect.mapError(failed('read', key)))))
        return Option.none<StoredRead>();
      const size = Number((yield* fs.stat(at).pipe(Effect.mapError(failed('read', key)))).size);
      const span = clampRange(range, size);
      if (Option.isNone(span))
        return yield* StoreFailed.make({
          store: root,
          op: 'read',
          key,
          reason: `the range starts past its ${size} bytes`,
        });
      const { start, end } = span.value;
      const stream = fs
        .stream(at, { offset: start, bytesToRead: end - start + 1 })
        .pipe(Stream.mapError(failed('read', key)));
      return Option.some<StoredRead>({ size, start, end, stream });
    });
  return {
    where: root,
    hashOf,
    get: (key, to) => copyWhole(path.join(root, key), to).pipe(Effect.mapError(failed('get', key))),
    put: (key, from) =>
      copyWhole(from, path.join(root, key)).pipe(Effect.mapError(failed('put', key))),
    list,
    read,
  };
};
