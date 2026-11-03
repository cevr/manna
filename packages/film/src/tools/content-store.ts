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

export interface Manifest<A> {
  readonly file: string;
  readonly codec: Schema.Codec<A, string>;
  readonly empty: A;
}

export type StoreError = FileInvalid | StoreLocked | PlatformError;

const hostTag = (host: string): string => sha256Hex(host).slice(0, 12);

const partialOf = (file: string, pid: number, n: number, host: string): string =>
  `${file}.${pid}-${n}.${hostTag(host)}.partial`;

interface PartialWriter {
  readonly pid: number;
  readonly host: string;
}

const partialWriter = (name: string): Option.Option<PartialWriter> =>
  Option.flatMap(
    Option.fromNullishOr(/\.(\d+)-\d+\.([0-9a-f]{12})\.partial$/.exec(name)),
    (named) =>
      Option.zipWith(Arr.get(named, 1), Arr.get(named, 2), (pid, host) => ({
        pid: Number(pid),
        host,
      })),
  );

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

export const writeWhole = <E, R>(
  fs: FileSystem.FileSystem,
  file: string,
  write: (partial: string) => Effect.Effect<void, E, R>,
): Effect.Effect<void, E | PlatformError, R> =>
  writeWholeWith(fs, file, write, (partial) => fs.rename(partial, file));

interface Ensure<M, A, E, R> {
  readonly manifest: Manifest<M>;
  readonly hash: string;
  readonly force: boolean;
  readonly stored: (manifest: M) => Option.Option<string>;
  readonly produce: Effect.Effect<A, E, R>;
  readonly record: (manifest: M, made: A) => M;
}

const isStale = (stored: Option.Option<string>, hash: string, force: boolean): boolean =>
  force || !Option.contains(stored, hash);

const LOCK_TRIES = 250;
const LOCK_SPACING = Duration.millis(20);

const Held = Context.Reference<ReadonlySet<string>>('@manna/film/tools/ContentStore/Held', {
  defaultValue: () => new Set(),
});

const isAlive = (pid: number) =>
  Result.match(
    Result.try(() => process.kill(pid, 0)),
    {
      onSuccess: () => true,
      onFailure: (error) => Predicate.hasProperty(error, 'code') && error.code === 'EPERM',
    },
  );

interface ProcessesService {
  readonly host: string;
  readonly alive: (pid: number) => Effect.Effect<boolean>;
}

export const Processes = Context.Reference<ProcessesService>('@manna/film/tools/Processes', {
  defaultValue: () => ({ host: hostname(), alive: (pid) => Effect.sync(() => isAlive(pid)) }),
});

export const partialAbandoned = (name: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const writer = partialWriter(name);
    if (Option.isNone(writer)) return false;
    const processes = yield* Processes;
    if (writer.value.host !== hostTag(processes.host)) return false;
    return !(yield* processes.alive(writer.value.pid));
  });

interface ContentStoreService {
  readonly read: <A>(manifest: Manifest<A>) => Effect.Effect<A, StoreError>;
  readonly update: <A>(
    manifest: Manifest<A>,
    change: (current: A) => A,
  ) => Effect.Effect<A, StoreError>;
  readonly modify: <A, E>(
    manifest: Manifest<A>,
    change: (current: A) => Result.Result<A, E>,
  ) => Effect.Effect<A, E | StoreError>;
  readonly transact: <A, B, E, R>(
    manifest: Manifest<A>,
    change: (current: A) => Effect.Effect<readonly [B, A], E, R>,
  ) => Effect.Effect<B, E | StoreError, R>;
  readonly holding: <A, B, E, R>(
    manifest: Manifest<A>,
    use: (current: A) => Effect.Effect<B, E, R>,
  ) => Effect.Effect<B, E | StoreError, R>;
  readonly writeFile: (file: string, bytes: Uint8Array) => Effect.Effect<void, PlatformError>;
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
