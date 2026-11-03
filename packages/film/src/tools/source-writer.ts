import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Ref,
  Result,
  Schema,
  Semaphore,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ContentStore, type StoreError } from './content-store.ts';
import {
  type FreshProcessFailed,
  SourceChanged,
  type SourceRefused,
  StepNotNewest,
  UndoUnavailable,
  newerFirst,
} from '../core/refusals.ts';
import { ChangeId, type RequestId } from '../core/schema.ts';
import { uniqueId } from '../core/unique.ts';
import {
  FormatFailed,
  type NamedFileMissing,
  type TakeAmbiguous,
  WriteUnverified,
} from './errors.ts';
import type { PlatformError } from 'effect/PlatformError';
import { FilmFolder } from './film-repo.ts';
import { collectWithin } from './process.ts';

export interface Follows {
  readonly bring: (
    from: string,
    to: string,
  ) => Effect.Effect<void, NamedFileMissing | TakeAmbiguous>;
  readonly putAway: (from: string, to: string) => Effect.Effect<void, StoreError | PlatformError>;
  readonly remake: Option.Option<Effect.Effect<Remade, FreshProcessFailed>>;
}

export interface Files {
  readonly file: Effect.Effect<void, StoreError>;
  readonly withdraw: Effect.Effect<void, StoreError>;
}

export type Remade = Option.Option<number>;

export interface Change {
  readonly id: ChangeId;
  readonly film: string;
  readonly scene: Option.Option<string>;
  readonly file: string;
  readonly target: string;
  readonly before: string;
  readonly after: string;
  readonly follows: Option.Option<Follows>;
  readonly files: Option.Option<Files>;
}

export interface Wrote {
  readonly scene: Option.Option<string>;
  readonly file: string;
  readonly target: string;
  readonly change: Option.Option<Change>;
}

interface Rewrite<E, A = void> {
  readonly film: string;
  readonly scene: Option.Option<string>;
  readonly file: string;
  readonly target: string;
  readonly edit: (source: string) => Result.Result<string, SourceRefused>;
  readonly verify: (
    after: string,
    before: string,
  ) => Result.Result<ReadonlyArray<string>, SourceRefused>;
  readonly check: (after: string) => Effect.Effect<A, E>;
  readonly follows?: Follows;
  readonly files?: Files;
}

export type RewriteError =
  | SourceRefused
  | FormatFailed
  | WriteUnverified
  | SourceChanged
  | StoreError;

interface LandedStep {
  readonly request: RequestId;
  readonly step: Change;
}

interface History {
  readonly undos: ReadonlyArray<Change>;
  readonly latest: Option.Option<Change>;
  readonly landed: ReadonlyArray<LandedStep>;
}

interface WriteHistory {
  readonly undo: Option.Option<Change>;
  readonly latest: Option.Option<Change>;
  readonly landed: ReadonlyArray<LandedStep>;
}

interface Landing {
  readonly n: number;
  readonly verb: 'write' | 'undo';
  readonly change: Change;
}

interface SourceWriterService {
  readonly write: <E, A = void>(
    rewrite: Rewrite<E, A>,
  ) => Effect.Effect<readonly [Option.Option<Change>, A, Remade], E | RewriteError>;
  readonly around: <A, E, R>(
    film: string,
    file: string,
    target: string,
    act: Effect.Effect<A, E, R>,
    follows?: Follows,
  ) => Effect.Effect<readonly [A, Option.Option<Change>], E | StoreError | FormatFailed, R>;
  readonly undo: (film: string, ask?: StepAsk) => Effect.Effect<Stepped, StepError>;
  readonly history: (film: string) => Effect.Effect<WriteHistory>;
  readonly landings: Effect.Effect<ReadonlyArray<Landing>>;
}

export interface StepAsk {
  readonly request?: RequestId;
  readonly change?: ChangeId;
}

type Stepped = readonly [Change, Remade];

export type StepError = UndoUnavailable | StepNotNewest | StoreError;

export const UNDO_DEPTH = 50;

const TOLD_KEPT = 200;

const emptyHistory: History = {
  undos: [],
  latest: Option.none(),
  landed: [],
};

const recordChange = (h: History, c: Change): History => ({
  ...h,
  undos: [...h.undos, c].slice(-UNDO_DEPTH),
  latest: Option.some(c),
});

const landedWith = (
  landed: ReadonlyArray<LandedStep>,
  request: Option.Option<RequestId>,
  step: Change,
): ReadonlyArray<LandedStep> =>
  Option.match(request, {
    onNone: () => landed,
    onSome: (id) => [...landed, { request: id, step }].slice(-UNDO_DEPTH),
  });

const stepFits = (
  stack: ReadonlyArray<Change>,
  top: Change,
  asked: Option.Option<string>,
): Result.Result<void, StepNotNewest> => {
  if (Option.isNone(asked) || asked.value === top.id) return Result.void;
  const standing = stack.some((c) => c.id === asked.value);
  if (standing) return Result.fail(StepNotNewest.make({ reason: newerFirst(top.target) }));
  return Result.fail(StepNotNewest.make({ reason: "it is no longer in the film's changes" }));
};

export const FORMAT_LIMIT = Duration.seconds(20);

const sceneLog = (c: Change) =>
  Option.match(c.scene, { onNone: () => '', onSome: (scene) => ` scene=${scene}` });

export class SourceWriter extends Context.Service<SourceWriter, SourceWriterService>()(
  '@manna/film/tools/SourceWriter',
) {
  static readonly layer = Layer.effect(
    SourceWriter,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repo = yield* FilmFolder;
      const store = yield* ContentStore;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const writer = yield* Semaphore.make(1);
      const histories = yield* Ref.make(new Map<string, History>());
      const told = yield* Ref.make<ReadonlyArray<Landing>>([]);
      const tell = (verb: Landing['verb'], change: Change) =>
        Ref.update(told, (all) =>
          [
            ...all,
            {
              n: Option.match(Arr.last(all), { onNone: () => 1, onSome: (l) => l.n + 1 }),
              verb,
              change,
            },
          ].slice(-TOLD_KEPT),
        );

      const historyOf = (film: string) =>
        Effect.map(Ref.get(histories), (all) =>
          Option.getOrElse(Option.fromUndefinedOr(all.get(film)), () => emptyHistory),
        );
      const setHistory = (film: string, h: History) =>
        Ref.update(histories, (all) => new Map([...all, [film, h]]));

      const swap = (film: string, file: string, expected: string, next: string, target: string) =>
        store.modify({ file, codec: Schema.String, empty: '' }, (now) => {
          if (now !== expected)
            return Result.fail(SourceChanged.make({ file: shownIn(film, file), target }));
          return Result.succeed(next);
        });

      const shownIn = (film: string, file: string) => path.relative(repo.paths(film).dir, file);

      const shown = (c: Change) => shownIn(c.film, c.file);

      const format = (film: string, file: string, text: string) =>
        collectWithin(
          spawner,
          'oxfmt',
          ChildProcess.make('bunx', ['oxfmt', `--stdin-filepath=${file}`], {
            cwd: path.dirname(file),
            stdin: Stream.make(new TextEncoder().encode(text)),
            forceKillAfter: '5 seconds',
          }),
          FORMAT_LIMIT,
        ).pipe(
          Effect.mapError((error) =>
            FormatFailed.make({ file: shownIn(film, file), reason: error.message }),
          ),
          Effect.flatMap((done) => {
            if (done.exitCode === 0) return Effect.succeed(done.stdout);
            return Effect.fail(
              FormatFailed.make({
                file: shownIn(film, file),
                reason: `${done.stderr}${done.stdout}`.trim(),
              }),
            );
          }),
        );

      const record = (c: Change, event: string) =>
        Effect.gen(function* () {
          yield* setHistory(c.film, recordChange(yield* historyOf(c.film), c));
          yield* tell('write', c);
          yield* Effect.log(
            `${event} film=${c.film}${sceneLog(c)} target="${c.target}" file=${shown(c)}`,
          );
        });

      const write = <E, A = void>(rewrite: Rewrite<E, A>) =>
        writer.withPermits(1)(
          Effect.gen(function* () {
            const { file, target } = rewrite;
            const before = yield* fs.readFileString(file);
            const next = yield* Effect.fromResult(rewrite.edit(before));
            const after = yield* format(rewrite.film, file, next);
            const missed = Result.match(rewrite.verify(after, before), {
              onFailure: (e) => [e.reason],
              onSuccess: (m) => m,
            });
            if (missed.length > 0)
              return yield* WriteUnverified.make({
                file: shownIn(rewrite.film, file),
                target,
                reason: missed.join(', '),
              });
            const checked = yield* rewrite.check(after);
            if (after === before) {
              if ((yield* fs.readFileString(file)) !== before)
                return yield* SourceChanged.make({ file: shownIn(rewrite.film, file), target });
              return [Option.none<Change>(), checked, Option.none<number>()] as const;
            }
            const change: Change = {
              id: yield* uniqueId(ChangeId),
              film: rewrite.film,
              scene: rewrite.scene,
              file,
              target,
              before,
              after,
              follows: Option.fromUndefinedOr(rewrite.follows),
              files: Option.fromUndefinedOr(rewrite.files),
            };
            return yield* Effect.uninterruptible(
              Effect.gen(function* () {
                yield* swap(rewrite.film, file, before, after, target);
                yield* record(change, 'lab.write');
                yield* filed(change, 'file');
                const remade = yield* remake(change);
                return [Option.some(change), checked, remade] as const;
              }),
            );
          }),
        );

      const formattedOver = (film: string, file: string, acted: string, target: string) =>
        Effect.gen(function* () {
          const formatted = yield* format(film, file, acted);
          if (formatted === acted) return acted;
          return yield* swap(film, file, acted, formatted, target).pipe(
            Effect.as(formatted),
            Effect.catchTag('SourceChanged', () => Effect.succeed(acted)),
          );
        });

      const around = <A, E, R>(
        film: string,
        file: string,
        target: string,
        act: Effect.Effect<A, E, R>,
        follows?: Follows,
      ) =>
        writer.withPermits(1)(
          Effect.uninterruptible(
            Effect.gen(function* () {
              const before = yield* fs.readFileString(file);
              const done = yield* act;
              const acted = yield* fs.readFileString(file);
              const after = yield* formattedOver(film, file, acted, target);
              if (after === before) return [done, Option.none<Change>()] as const;
              const change: Change = {
                id: yield* uniqueId(ChangeId),
                film,
                scene: Option.none(),
                file,
                target,
                before,
                after,
                follows: Option.fromUndefinedOr(follows),
                files: Option.none(),
              };
              yield* record(change, 'lab.write');
              return [done, Option.some(change)] as const;
            }),
          ),
        );

      const putAway = (c: Change, from: string, to: string) =>
        Option.match(c.follows, {
          onNone: () => Effect.void,
          onSome: (follows) =>
            follows
              .putAway(from, to)
              .pipe(
                Effect.catch((error) =>
                  Effect.logWarning(
                    `lab.named.put-away.failed film=${c.film} target="${c.target}" reason=${error.message}`,
                  ),
                ),
              ),
        });

      const filed = (c: Change, way: keyof Files) =>
        Option.match(c.files, {
          onNone: () => Effect.void,
          onSome: (files) =>
            files[way].pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  `lab.files.${way}.failed film=${c.film} target="${c.target}" reason=${error.message}`,
                ),
              ),
            ),
        });

      const remake = (c: Change): Effect.Effect<Remade> =>
        Option.match(
          Option.flatMap(c.follows, (follows) => follows.remake),
          {
            onNone: () => Effect.succeedNone,
            onSome: (made) =>
              made.pipe(
                Effect.catch((error) =>
                  Effect.as(
                    Effect.logWarning(
                      `lab.remake.failed film=${c.film} target="${c.target}" reason=${error.message}`,
                    ),
                    Option.none<number>(),
                  ),
                ),
              ),
          },
        );

      const land = <E>(
        c: Change,
        from: string,
        to: string,
        changed: string,
        refused: (reason: string) => E,
      ) =>
        store.holding({ file: c.file, codec: Schema.String, empty: '' }, (now) =>
          Effect.gen(function* () {
            if (now !== from) return yield* Effect.fail(refused(changed));
            yield* Option.match(c.follows, {
              onNone: () => Effect.void,
              onSome: (follows) =>
                Effect.mapError(follows.bring(from, to), (missing) =>
                  refused(`${shown(c)} names ${missing.message}`),
                ),
            });
            yield* store.writeFile(c.file, new TextEncoder().encode(to));
            yield* putAway(c, from, to);
          }),
        );

      const undo = (film: string, { request, change }: StepAsk = {}) =>
        writer
          .withPermits(1)(
            Effect.uninterruptible(
              Effect.gen(function* () {
                const h = yield* historyOf(film);
                const top = Arr.last(h.undos);
                if (Option.isNone(top))
                  return yield* UndoUnavailable.make({
                    reason: `the lab has made no change to ${film} to undo`,
                  });
                const c = top.value;
                yield* Effect.fromResult(stepFits(h.undos, c, Option.fromUndefinedOr(change)));
                yield* land(
                  c,
                  c.after,
                  c.before,
                  `${shown(c)} has changed since the lab wrote ${c.target}`,
                  (reason) => UndoUnavailable.make({ reason }),
                );
                const made: Change = {
                  ...c,
                  target: `undo ${c.target}`,
                  before: c.after,
                  after: c.before,
                };
                yield* setHistory(film, {
                  ...h,
                  undos: h.undos.slice(0, -1),
                  latest: Option.some(made),
                  landed: landedWith(h.landed, Option.fromUndefinedOr(request), made),
                });
                yield* tell('undo', c);
                yield* Effect.log(
                  `lab.undo film=${film}${sceneLog(c)} target="${c.target}" file=${shown(c)}`,
                );
                yield* filed(c, 'withdraw');
                const remade = yield* remake(c);
                return [made, remade] as const;
              }),
            ),
          )
          .pipe(Effect.withSpan('SourceWriter.undo'));

      const history = (film: string) =>
        Effect.map(historyOf(film), (h): WriteHistory => ({
          undo: Arr.last(h.undos),
          latest: h.latest,
          landed: h.landed,
        }));

      return SourceWriter.of({ write, around, undo, history, landings: Ref.get(told) });
    }),
  );
}
