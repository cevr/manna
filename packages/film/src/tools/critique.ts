import {
  Array as Arr,
  Boolean as Bool,
  Cache,
  Cause,
  Clock,
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Layer,
  MutableHashMap,
  Option,
  Path,
  Result,
  Schema,
  Semaphore,
} from 'effect';
import {
  type CritiqueDrawn,
  type CritiqueFigure,
  CritiqueFinding,
  type CritiqueRead,
  type CritiqueRule,
  type CritiqueStaging,
  type QuotedSection,
  UNSTAGED,
  boardFileOf,
  critiqueMarkdown,
  critiquePacket,
  findingsOf,
} from '../core/critique.ts';
import { panelStagedAt } from '../core/board.ts';
import { sectionOf } from '../core/judge.ts';
import { type MatchTaken, hairBeardLine, matchLines } from '../core/match.ts';
import { BoardStore } from './board-store.ts';
import { Counsel } from './counsel.ts';
import { sha256Hex } from './digest.ts';
import { FilmName } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';

const FigureCritiqued = Schema.Struct({
  figure: Schema.String,
  findings: Schema.Array(CritiqueFinding),
  file: Schema.String,
});

export const CritiqueTaken = Schema.Struct({
  figures: Schema.Array(FigureCritiqued),
  cached: Schema.Boolean,
  skipped: Schema.optionalKey(Schema.String),
  rejected: Schema.Array(Schema.String),
});
export type CritiqueTaken = typeof CritiqueTaken.Type;

const KeptAnswer = Schema.fromJsonString(
  Schema.Struct({
    findings: Schema.Array(CritiqueFinding),
    rejected: Schema.Array(Schema.String),
  }),
);

class CritiqueRuleMissing extends Schema.TaggedError<CritiqueRuleMissing>()('CritiqueRuleMissing', {
  file: Schema.String,
  heading: Schema.String,
}) {
  override get message() {
    return `the critique quotes "${this.heading}" from ${this.file}, and the file has no such section: fix the heading in the app's critique rules`;
  }
}

interface SheetView {
  readonly figure: string;
  readonly concept: string;
  readonly sheet: string;
  readonly flagged: ReadonlyArray<string>;
  readonly file: string;
  readonly layout: Option.Option<string>;
}

interface SheetCritique {
  readonly drawn?: 'sheet' | 'render';
  readonly place: string;
  readonly kept: string;
  readonly views: ReadonlyArray<SheetView>;
}

interface CritiqueJob {
  readonly match: MatchTaken;
  readonly critique: Option.Option<CritiqueTaken>;
}

class CritiqueJobUnknown extends Schema.TaggedError<CritiqueJobUnknown>()('CritiqueJobUnknown', {
  handle: Schema.String,
}) {
  override get message() {
    return `no critique ${this.handle} is kept (a running one is kept until it ends, a finished one ${Duration.format(JOB_KEPT_FOR)} after, the last ${JOBS_KEPT} of them, and a lab restarted keeps none): start it again with the scene and the place`;
  }
}

interface CriticService {
  readonly critique: (taken: MatchTaken, staging: CritiqueStaging) => Effect.Effect<CritiqueTaken>;
  readonly start: (taken: MatchTaken, staging: CritiqueStaging) => Effect.Effect<string>;
  readonly job: (
    handle: string,
    within: Duration.Duration,
  ) => Effect.Effect<CritiqueJob, CritiqueJobUnknown>;
  readonly critiqueSheet: (sheet: SheetCritique) => Effect.Effect<CritiqueTaken>;
}

interface CritiqueAsk {
  readonly drawn: CritiqueDrawn;
  readonly place: string;
  readonly logged: string;
  readonly keptDir: string;
  readonly staging: CritiqueStaging;
  readonly figures: ReadonlyArray<{
    readonly figure: string;
    readonly concept: string;
    readonly drawnCrop: string;
    readonly flagged: ReadonlyArray<string>;
    readonly file: string;
    readonly layout: Option.Option<string>;
    readonly boundary: Option.Option<string>;
  }>;
}

interface Prepared {
  readonly ask: CritiqueAsk;
  readonly hash: string;
  readonly kept: string;
}

const JOBS_KEPT = 32;

const JOB_KEPT_FOR = Duration.hours(1);

const COUNSEL_RUNS = 4;

const handleOf = (names: ReadonlyArray<string>): string => sha256Hex(names.join('\n')).slice(0, 16);

interface Job {
  readonly match: MatchTaken;
  readonly done: Deferred.Deferred<CritiqueTaken>;
}

const diedAs = (why: string): CritiqueTaken => ({
  figures: [],
  cached: false,
  skipped: `the critique died: ${why}`,
  rejected: [],
});

const jobsIn = Effect.gen(function* () {
  const scope = yield* Effect.scope;
  const running = MutableHashMap.empty<string, Job>();
  const finished = yield* Cache.makeWith<string, Job, CritiqueJobUnknown>(
    (handle) => Effect.fail(CritiqueJobUnknown.make({ handle })),
    {
      capacity: JOBS_KEPT,
      timeToLive: Exit.match({ onSuccess: () => JOB_KEPT_FOR, onFailure: () => Duration.zero }),
    },
  );
  const starting = yield* Semaphore.make(1);
  const start = (handle: string, match: MatchTaken, work: Effect.Effect<CritiqueTaken>) =>
    Semaphore.withPermits(
      starting,
      1,
    )(
      Effect.gen(function* () {
        if (MutableHashMap.has(running, handle)) return handle;
        const job: Job = { match, done: yield* Deferred.make<CritiqueTaken>() };
        MutableHashMap.set(running, handle, job);
        yield* Effect.forkIn(
          Effect.interruptible(
            Effect.exit(
              Effect.tapCause(work, (cause) =>
                Effect.logWarning(
                  `critique.skipped handle=${handle} reason=the critique died: ${Cause.pretty(cause)}`,
                ),
              ),
            ).pipe(
              Effect.flatMap((exit) =>
                Deferred.succeed(
                  job.done,
                  Exit.match(exit, {
                    onSuccess: (answer) => answer,
                    onFailure: (cause) => diedAs(Cause.pretty(cause)),
                  }),
                ),
              ),
              Effect.andThen(Cache.set(finished, handle, job)),
              Effect.andThen(Effect.sync(() => MutableHashMap.remove(running, handle))),
            ),
          ),
          scope,
        );
        return handle;
      }).pipe(Effect.uninterruptible),
    );
  const job = (handle: string, within: Duration.Duration) =>
    Effect.gen(function* () {
      const one = yield* Option.match(MutableHashMap.get(running, handle), {
        onSome: Effect.succeed,
        onNone: () => Cache.get(finished, handle),
      });
      const critique = yield* Bool.match(Duration.isZero(within), {
        onTrue: () => Effect.when(Deferred.await(one.done), Deferred.isDone(one.done)),
        onFalse: () => Effect.timeoutOption(Deferred.await(one.done), within),
      });
      return { match: one.match, critique } satisfies CritiqueJob;
    });
  return { start, job };
});

const flaggedOf = (m: MatchTaken['figures'][number]): ReadonlyArray<string> =>
  matchLines(m)
    .slice(1)
    .map((line) => line.trim());

const figuresOf = (ask: CritiqueAsk): ReadonlyArray<CritiqueFigure> =>
  ask.figures.map((f) => ({
    figure: f.figure,
    concept: `${f.figure}-concept.png`,
    scene: `${f.figure}-${ask.drawn}.png`,
    flagged: f.flagged,
    layout: f.layout,
    boundary: f.boundary,
  }));

const askOfMatch = (taken: MatchTaken, staging: CritiqueStaging, path: Path.Path): CritiqueAsk => ({
  drawn: 'scene',
  staging,
  place: `${taken.scene} ${taken.at}, t=${taken.time.toFixed(2)}, build ${taken.build}`,
  logged: `scene=${taken.scene} at=${taken.at}`,
  keptDir: Option.match(Arr.head(taken.figures), {
    onNone: () => '',
    onSome: (m) => path.join(path.dirname(path.dirname(path.dirname(m.table))), 'critique'),
  }),
  figures: taken.figures.map((m) => ({
    figure: m.figure,
    concept: m.crops.concept,
    drawnCrop: m.crops.scene,
    flagged: flaggedOf(m),
    file: `${m.table.replace(/\.md$/, '')}.critique.md`,
    layout: Option.none(),
    boundary: hairBeardLine(m.rows),
  })),
});

const askOfSheet = (sheet: SheetCritique): CritiqueAsk => ({
  drawn: sheet.drawn ?? 'sheet',
  staging: UNSTAGED,
  place: sheet.place,
  logged: `sheet="${sheet.place}"`,
  keptDir: sheet.kept,
  figures: sheet.views.map((v) => ({
    figure: v.figure,
    concept: v.concept,
    drawnCrop: v.sheet,
    flagged: v.flagged,
    file: v.file,
    layout: v.layout,
    boundary: Option.none(),
  })),
});

const orUnstaged = <A, E extends { readonly message: string }, R>(
  found: Effect.Effect<Option.Option<A>, E, R>,
  what: string,
  taken: MatchTaken,
) =>
  found.pipe(
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning(
          `critique.unstaged scene=${taken.scene} at=${taken.at} part=${what} reason=${error.message}`,
        ),
        Option.none<A>(),
      ),
    ),
  );

export const stagingAt = Effect.fn('Critic.stagingAt')(function* (name: string, taken: MatchTaken) {
  const named = Schema.decodeOption(FilmName)(name);
  if (Option.isNone(named)) {
    yield* Effect.logWarning(
      `critique.unstaged scene=${taken.scene} at=${taken.at} part=film reason=${name} is no film's name`,
    );
    return UNSTAGED;
  }
  const film = named.value;
  const board = yield* BoardStore;
  const fresh = yield* FreshFilm;
  const panel = yield* orUnstaged(
    board.read(film).pipe(
      Effect.map((file) => panelStagedAt(file, taken.scene, taken.marks, taken.time)),
      Effect.flatMap((staged) =>
        Option.match(staged, {
          onNone: () => Effect.succeedNone,
          onSome: ({ panel: p, shown }) =>
            Effect.map(board.image(film, shown.file), (image) => Option.some({ id: p.id, image })),
        }),
      ),
    ),
    'board',
    taken,
  );
  const picture = yield* orUnstaged(
    Effect.map(fresh.script(film), (beats) =>
      Option.flatMap(
        Arr.findFirst(beats, (beat) => beat.id === taken.scene),
        (beat) => Option.fromUndefinedOr(beat.picture),
      ),
    ),
    'script',
    taken,
  );
  return { panel, picture } satisfies CritiqueStaging;
});

export class Critic extends Context.Service<Critic, CriticService>()('@manna/film/tools/Critic') {
  static readonly layer = (rules: ReadonlyArray<CritiqueRule>) =>
    Layer.effect(
      Critic,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const counsel = yield* Counsel;
        const counselRuns = yield* Semaphore.make(COUNSEL_RUNS);

        const sections: ReadonlyArray<QuotedSection> = yield* Effect.forEach(rules, (rule) =>
          Effect.gen(function* () {
            const text = yield* fs
              .readFileString(rule.file)
              .pipe(
                Effect.mapError(() =>
                  CritiqueRuleMissing.make({ file: rule.file, heading: rule.heading }),
                ),
              );
            const section = yield* Effect.fromOption(sectionOf(text, rule.heading)).pipe(
              Effect.mapError(() =>
                CritiqueRuleMissing.make({ file: rule.file, heading: rule.heading }),
              ),
            );
            return { file: path.basename(rule.file), heading: rule.heading, text: section };
          }),
        );

        const asked = (ask: CritiqueAsk, kept: string): Effect.Effect<CritiqueRead, string> =>
          Effect.scoped(
            Effect.gen(function* () {
              const dir = yield* fs.makeTempDirectoryScoped();
              const figures = figuresOf(ask);
              yield* Effect.forEach(ask.figures, (f) =>
                Effect.all([
                  fs.copyFile(f.concept, path.join(dir, `${f.figure}-concept.png`)),
                  fs.copyFile(f.drawnCrop, path.join(dir, `${f.figure}-${ask.drawn}.png`)),
                ]),
              );
              yield* Effect.forEach(
                Option.toArray(
                  Option.zipWith(
                    ask.staging.panel,
                    boardFileOf(ask.staging),
                    (p, file) => [p.image, file] as const,
                  ),
                ),
                ([image, file]) => fs.copyFile(image, path.join(dir, file)),
              );
              const packet = path.join(dir, 'packet.md');
              yield* fs.writeFileString(
                packet,
                critiquePacket(ask.drawn, ask.place, figures, sections, ask.staging),
              );
              return packet;
            }).pipe(
              Effect.mapError((error) => `the packet cannot be written: ${error.message}`),
              Effect.flatMap((packet) =>
                Semaphore.withPermits(
                  counselRuns,
                  1,
                )(counsel.ask(packet, path.join(path.dirname(kept), 'counsel'))).pipe(
                  Effect.mapError((error) => error.message),
                ),
              ),
              Effect.flatMap((answer) =>
                Effect.fromResult(
                  findingsOf(
                    answer.text,
                    ask.figures.map((f) => f.figure),
                  ),
                ),
              ),
              Effect.tap((read) =>
                Schema.encodeEffect(KeptAnswer)({
                  findings: [...read.findings],
                  rejected: [...read.rejected],
                }).pipe(
                  Effect.flatMap((json) => fs.writeFileString(kept, json)),
                  Effect.ignore,
                ),
              ),
            ),
          );

        const keptAnswer = (kept: string) =>
          fs.readFileString(kept).pipe(
            Effect.flatMap((text) => Schema.decodeEffect(KeptAnswer)(text)),
            Effect.option,
          );

        const prepared = (ask: CritiqueAsk): Effect.Effect<Prepared, string> =>
          Effect.gen(function* () {
            const crops = yield* Effect.forEach(ask.figures, (f) =>
              Effect.all([fs.readFile(f.concept), fs.readFile(f.drawnCrop)]).pipe(
                Effect.map(([concept, drawn]) => [sha256Hex(concept), sha256Hex(drawn)]),
                Effect.mapError((error) => `${f.figure}'s crops cannot be read: ${error.message}`),
              ),
            );
            const staged = yield* Option.match(ask.staging.panel, {
              onNone: () => Effect.succeed({ ask, board: [] }),
              onSome: (p) =>
                fs.readFile(p.image).pipe(
                  Effect.map((bytes) => ({ ask, board: [sha256Hex(bytes)] })),
                  Effect.catch((error) =>
                    Effect.as(
                      Effect.logWarning(
                        `critique.unstaged ${ask.logged} part=board reason=${error.message}`,
                      ),
                      {
                        ask: { ...ask, staging: { ...ask.staging, panel: Option.none() } },
                        board: [],
                      },
                    ),
                  ),
                ),
            });
            const hash = sha256Hex(
              [
                critiquePacket(ask.drawn, '', figuresOf(staged.ask), sections, staged.ask.staging),
                ...crops.flat(),
                ...staged.board,
              ].join('\n'),
            );
            yield* fs
              .makeDirectory(ask.keptDir, { recursive: true })
              .pipe(Effect.mapError((error) => error.message));
            return {
              ask: staged.ask,
              hash,
              kept: path.join(ask.keptDir, `${hash.slice(0, 32)}.json`),
            };
          }).pipe(
            Effect.catchDefect((defect) =>
              Effect.fail(`the critique died: ${Cause.pretty(Cause.die(defect))}`),
            ),
          );

        const answered = (ready: Prepared) =>
          Effect.gen(function* () {
            const before = yield* keptAnswer(ready.kept);
            if (Option.isSome(before)) return { read: before.value, cached: true };
            return { read: yield* asked(ready.ask, ready.kept), cached: false };
          }).pipe(
            Effect.catchDefect((defect) =>
              Effect.fail(`the critique died: ${Cause.pretty(Cause.die(defect))}`),
            ),
          );

        const critiquedFrom = Effect.fn('Critic.critiqued')(function* (
          ask: CritiqueAsk,
          ready: Result.Result<Prepared, string>,
        ) {
          if (ask.figures.length === 0)
            return { figures: [], cached: false, rejected: [] } satisfies CritiqueTaken;
          const started = yield* Clock.currentTimeMillis;
          const read = yield* Result.match(ready, {
            onFailure: (why) => Effect.succeed(Result.fail(why)),
            onSuccess: (p) => Effect.result(answered(p)),
          });
          const findings = Result.map(read, (r) => r.read);
          const figures = yield* Effect.forEach(ask.figures, (f) =>
            Effect.gen(function* () {
              yield* fs
                .writeFileString(f.file, critiqueMarkdown(f.figure, ask.place, findings))
                .pipe(Effect.ignore);
              return {
                figure: f.figure,
                findings: Result.match(findings, {
                  onFailure: () => [],
                  onSuccess: (r) => r.findings.filter((x) => x.figure === f.figure),
                }),
                file: f.file,
              };
            }),
          );
          const cached = Result.match(read, { onFailure: () => false, onSuccess: (r) => r.cached });
          yield* Result.match(read, {
            onFailure: (why) =>
              Effect.logWarning(
                `critique.skipped ${ask.logged} figures=${figures.length} reason=${why}`,
              ),
            onSuccess: (r) =>
              Effect.flatMap(Clock.currentTimeMillis, (now) =>
                Effect.log(
                  `critique ${ask.logged} figures=${figures.length} findings=${r.read.findings.length} rejected=${r.read.rejected.length} cached=${r.cached} ms=${now - started}`,
                ),
              ),
          });
          return Result.match(read, {
            onFailure: (skipped): CritiqueTaken => ({ figures, cached, skipped, rejected: [] }),
            onSuccess: (r): CritiqueTaken => ({ figures, cached, rejected: r.read.rejected }),
          });
        });

        const critiqued = (ask: CritiqueAsk) =>
          Effect.flatMap(Effect.result(prepared(ask)), (ready) => critiquedFrom(ask, ready));

        const jobs = yield* jobsIn;

        return Critic.of({
          critique: (taken, staging) => critiqued(askOfMatch(taken, staging, path)),
          start: (taken, staging) =>
            Effect.gen(function* () {
              const ask = askOfMatch(taken, staging, path);
              const ready = yield* Effect.result(prepared(ask));
              const handle = handleOf([
                Result.match(ready, { onFailure: () => 'unread', onSuccess: (p) => p.hash }),
                ...ask.figures.map((f) => `${path.dirname(f.file)} ${f.figure}`),
              ]);
              return yield* jobs.start(handle, taken, critiquedFrom(ask, ready));
            }),
          job: jobs.job,
          critiqueSheet: (sheet) => critiqued(askOfSheet(sheet)),
        });
      }),
    );

  static readonly skipping = (reason: string) =>
    Layer.effect(
      Critic,
      Effect.gen(function* () {
        const skipped: CritiqueTaken = {
          figures: [],
          cached: false,
          skipped: reason,
          rejected: [],
        };
        const jobs = yield* jobsIn;
        return Critic.of({
          critique: () => Effect.succeed(skipped),
          start: (taken) =>
            jobs.start(
              handleOf([taken.scene, ...taken.figures.map((f) => f.figure)]),
              taken,
              Effect.succeed(skipped),
            ),
          job: jobs.job,
          critiqueSheet: () => Effect.succeed(skipped),
        });
      }),
    );
}
