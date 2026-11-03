import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Random,
  Result,
  Schedule,
  Schema,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { hostname } from 'node:os';
import { sha256Hex } from './digest.ts';
import { FileInvalid, StoreLocked } from './errors.ts';
import { ManifestLock } from './manifest-lock.ts';

/** A manifest file, its codec, and what it holds before anything is generated. */
export interface Manifest<A> {
  readonly file: string;
  readonly codec: Schema.Codec<A, string>;
  readonly empty: A;
}

export type StoreError = FileInvalid | StoreLocked | PlatformError;

/** A host as a partial's name carries it: twelve hex digits of its name's SHA-256, free of dots. */
const hostTag = (host: string): string => sha256Hex(host).slice(0, 12);

/**
 * The partial process `pid` on `host` writes `file` through
 * (`writeWholeWith`): `<file>.<pid>-<n>.<host tag>.partial`.
 */
const partialOf = (file: string, pid: number, n: number, host: string): string =>
  `${file}.${pid}-${n}.${hostTag(host)}.partial`;

/** Who writes a partial: its pid, and its host's tag. */
interface PartialWriter {
  readonly pid: number;
  readonly host: string;
}

/**
 * The writer of a partial (`writeWholeWith`), read from its name; none for
 * a name that does not carry both (`<file>.partial`, or
 * `<file>.<pid>-<n>.partial`, which names no host).
 */
const partialWriter = (name: string): Option.Option<PartialWriter> =>
  Option.flatMap(
    Option.fromNullishOr(/\.(\d+)-\d+\.([0-9a-f]{12})\.partial$/.exec(name)),
    (named) =>
      Option.zipWith(Arr.get(named, 1), Arr.get(named, 2), (pid, host) => ({
        pid: Number(pid),
        host,
      })),
  );

/**
 * `file` written whole by `write`, which writes the partial it is handed:
 * a name of this writer's own beside `file`, landed by `land` once written
 * (a rename over `file`, made under a lock or beside another file's write),
 * and removed when the write or the landing fails or is interrupted.
 */
export const writeWholeWith = <E, R, L, LR>(
  fs: FileSystem.FileSystem,
  file: string,
  write: (partial: string) => Effect.Effect<void, E, R>,
  land: (partial: string) => Effect.Effect<void, L, LR>,
): Effect.Effect<void, E | L | PlatformError, R | LR> =>
  Effect.gen(function* () {
    const { host } = yield* Processes;
    const partial = partialOf(file, process.pid, yield* Random.nextIntBetween(0, 1e9), host);
    yield* Effect.gen(function* () {
      yield* write(partial);
      yield* land(partial);
    }).pipe(Effect.onError(() => Effect.ignore(fs.remove(partial, { force: true }))));
  });

/** `file` written whole by `write` (`writeWholeWith`), its partial renamed over it once written. */
export const writeWhole = <E, R>(
  fs: FileSystem.FileSystem,
  file: string,
  write: (partial: string) => Effect.Effect<void, E, R>,
): Effect.Effect<void, E | PlatformError, R> =>
  writeWholeWith(fs, file, write, (partial) => fs.rename(partial, file));

/** One generated asset, requested by the hash of what makes it. */
interface Ensure<M, A, E, R> {
  readonly manifest: Manifest<M>;
  /** The hash of the request. */
  readonly hash: string;
  /** Produce even when the stored hash matches. */
  readonly force: boolean;
  /** The hash stored for this asset, if any. */
  readonly stored: (manifest: M) => Option.Option<string>;
  readonly produce: Effect.Effect<A, E, R>;
  /** Record the new asset in the manifest. */
  readonly record: (manifest: M, made: A) => M;
}

/** Whether an asset must be (re)made. */
const isStale = (stored: Option.Option<string>, hash: string, force: boolean): boolean =>
  force || !Option.contains(stored, hash);

/** How often, and how many times, a writer tries another process's lock before giving up. */
const LOCK_TRIES = 250;
const LOCK_SPACING = Duration.millis(20);

/** The manifests whose locks the running change holds, in its fiber and those it forks. */
const Held = Context.Reference<ReadonlySet<string>>('@manna/film/tools/ContentStore/Held', {
  defaultValue: () => new Set(),
});

/** Whether process `pid` is running: signal 0 checks without sending anything. */
const isAlive = (pid: number) =>
  Result.match(
    Result.try(() => process.kill(pid, 0)),
    {
      onSuccess: () => true,
      onFailure: (error) => Predicate.hasProperty(error, 'code') && error.code === 'EPERM',
    },
  );

/** The processes a partial's writer is judged among: this host's name, and whether a pid on it runs. */
interface ProcessesService {
  readonly host: string;
  readonly alive: (pid: number) => Effect.Effect<boolean>;
}

/**
 * This host's processes (`process.kill(pid, 0)`, `os.hostname()`): what
 * says whether a partial's writer is gone. Tests set it.
 */
export const Processes = Context.Reference<ProcessesService>('@manna/film/tools/Processes', {
  defaultValue: () => ({ host: hostname(), alive: (pid) => Effect.sync(() => isAlive(pid)) }),
});

/**
 * Whether the partial `name` was left by a writer that is gone: a pid on
 * this host that no longer runs. Every other partial is kept: one written on
 * another host (its pid means nothing here), and one that names no host
 * (`<file>.<pid>-<n>.partial`, on any host) or no writer at all (`<file>.partial`), whose writer cannot be
 * told. A stale partial blocks no writer and is git-ignored, while removing
 * a live one loses its write, so a partial is removed only when its writer
 * is known to be gone.
 */
export const partialAbandoned = (name: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const writer = partialWriter(name);
    if (Option.isNone(writer)) return false;
    const processes = yield* Processes;
    if (writer.value.host !== hostTag(processes.host)) return false;
    return !(yield* processes.alive(writer.value.pid));
  });

interface ContentStoreService {
  /** The manifest as stored, or its empty value when there is no file yet. */
  readonly read: <A>(manifest: Manifest<A>) => Effect.Effect<A, StoreError>;
  /** Read, change and write the manifest back, one writer at a time across processes. */
  readonly update: <A>(
    manifest: Manifest<A>,
    change: (current: A) => A,
  ) => Effect.Effect<A, StoreError>;
  /**
   * Read, change and write the manifest back, one writer at a time across
   * processes; a change that fails writes nothing and fails the call. What the
   * change decides from (an entry by its hash, say) is read under the same
   * lock as the write, so no other update lands between them.
   */
  readonly modify: <A, E>(
    manifest: Manifest<A>,
    change: (current: A) => Result.Result<A, E>,
  ) => Effect.Effect<A, E | StoreError>;
  /**
   * `modify` with an effect for a change: it may write files of its own (a
   * note's still) under the manifest's lock, and answers `B` beside the
   * manifest it leaves.
   */
  readonly transact: <A, B, E, R>(
    manifest: Manifest<A>,
    change: (current: A) => Effect.Effect<readonly [B, A], E, R>,
  ) => Effect.Effect<B, E | StoreError, R>;
  /**
   * `use` of the manifest as it is, holding its lock (the one its
   * `transact` takes), in this process and across processes, without
   * rewriting it: for what changes the files a manifest names (a take put
   * away, or brought back with the text that names it) and must not
   * interleave with a change of the manifest. What `use` decides from is
   * read under that lock. A lock taken again inside itself (a `holding` or
   * `transact` of the same file within `use`) dies naming the file, rather
   * than waiting on itself.
   */
  readonly holding: <A, B, E, R>(
    manifest: Manifest<A>,
    use: (current: A) => Effect.Effect<B, E, R>,
  ) => Effect.Effect<B, E | StoreError, R>;
  /** Write a file whole: a reader never sees half of it. */
  readonly writeFile: (file: string, bytes: Uint8Array) => Effect.Effect<void, PlatformError>;
  /** Produce the asset unless its stored hash is current, then record it. `None` when skipped. */
  readonly ensure: <M, A, E, R>(
    request: Ensure<M, A, E, R>,
  ) => Effect.Effect<Option.Option<A>, E | StoreError, R>;
}

export class ContentStore extends Context.Service<ContentStore, ContentStoreService>()(
  '@manna/film/tools/ContentStore',
) {
  static readonly layer = Layer.effect(
    ContentStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const locks = yield* ManifestLock;
      /** One writer at a time in this process, per manifest. */
      const writers = new Map<string, Semaphore.Semaphore>();
      const writerOf = (file: string) =>
        Option.getOrElse(Option.fromUndefinedOr(writers.get(file)), () => {
          const made = Semaphore.makeUnsafe(1);
          writers.set(file, made);
          return made;
        });

      const writeFile = Effect.fn('ContentStore.writeFile')(function* (
        file: string,
        bytes: Uint8Array,
      ) {
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* writeWhole(fs, file, (partial) => fs.writeFile(partial, bytes));
      });

      /**
       * Take `file`'s lock for one change, trying again while another holds
       * it; what lets it go. A writer that tries its every try fails as
       * StoreLocked, and says so.
       */
      const take = (file: string) =>
        locks.take(file).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.retry({
            while: (error) => error._tag === 'NoSuchElementError',
            times: LOCK_TRIES,
            schedule: Schedule.spaced(LOCK_SPACING),
          }),
          Effect.catchTag('NoSuchElementError', () =>
            Effect.andThen(
              Effect.logWarning(
                `store.lock.held file=${file} reason="another writer held it past every try"`,
              ),
              Effect.fail(StoreLocked.make({ file })),
            ),
          ),
        );

      /**
       * `change` holding `file`'s lock, in this process and across processes.
       * Taken again inside `change`, it dies naming the file: it would wait on
       * itself, in this process's queue or on its own lock, forever.
       */
      const locked = <A, E, R>(file: string, change: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          const held = yield* Held;
          if (held.has(file))
            return yield* Effect.die(
              `ContentStore: the lock of ${file} is taken again by a change that holds it`,
            );
          return yield* Effect.acquireUseRelease(
            fs
              .makeDirectory(path.dirname(file), { recursive: true })
              .pipe(Effect.andThen(take(file))),
            () => Effect.provideService(change, Held, new Set([...held, file])),
            (release) => release,
          ).pipe(writerOf(file).withPermits(1));
        });

      const read = Effect.fn('ContentStore.read')(function* <A>(manifest: Manifest<A>) {
        if (!(yield* fs.exists(manifest.file))) return manifest.empty;
        const text = yield* fs.readFileString(manifest.file);
        return yield* Schema.decodeEffect(manifest.codec)(text).pipe(
          Effect.mapError((error) =>
            FileInvalid.make({ file: manifest.file, reason: error.message }),
          ),
        );
      });

      const transact = <A, B, E, R>(
        manifest: Manifest<A>,
        change: (current: A) => Effect.Effect<readonly [B, A], E, R>,
      ) =>
        locked(
          manifest.file,
          Effect.gen(function* () {
            const [answer, next] = yield* change(yield* read(manifest));
            const text = yield* Schema.encodeEffect(manifest.codec)(next).pipe(
              Effect.mapError((error) =>
                FileInvalid.make({ file: manifest.file, reason: error.message }),
              ),
            );
            yield* writeFile(manifest.file, new TextEncoder().encode(text));
            return answer;
          }),
        ).pipe(Effect.withSpan('ContentStore.transact'));

      const holding = <A, B, E, R>(
        manifest: Manifest<A>,
        use: (current: A) => Effect.Effect<B, E, R>,
      ) =>
        locked(manifest.file, Effect.flatMap(read(manifest), use)).pipe(
          Effect.withSpan('ContentStore.holding'),
        );

      const modify = <A, E>(manifest: Manifest<A>, change: (current: A) => Result.Result<A, E>) =>
        transact(manifest, (current: A) =>
          Effect.map(Effect.fromResult(change(current)), (next) => [next, next] as const),
        );

      const update = <A>(manifest: Manifest<A>, change: (current: A) => A) =>
        modify(manifest, (current: A) => Result.succeed(change(current)));

      const ensure = Effect.fn('ContentStore.ensure')(function* <M, A, E, R>(
        request: Ensure<M, A, E, R>,
      ) {
        const current = yield* read(request.manifest);
        if (!isStale(request.stored(current), request.hash, request.force)) return Option.none<A>();
        const made = yield* request.produce;
        yield* update(request.manifest, (m) => request.record(m, made));
        return Option.some(made);
      });

      return ContentStore.of({
        read,
        update,
        modify,
        transact,
        holding,
        writeFile,
        ensure,
      });
    }),
  );
}
