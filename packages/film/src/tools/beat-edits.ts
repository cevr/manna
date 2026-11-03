import { Boolean as Bool, Clock, Context, Effect, Layer, Option, Path, Ref, Result } from 'effect';
import {
  AGENTS_AFTER,
  type HoldEdge,
  type MovedBefore,
  heldAlready,
  heldTo,
  heldWithin,
  heldWords,
  holdUnchanged,
  holdWritten,
  movedWords,
  undone,
  workFiled,
} from '../core/beat-edit.ts';
import type { Said } from '../core/production.ts';
import { HoldUnchanged, SourceRefused } from '../core/refusals.ts';
import type { FilmTimeline, FilmVersion } from '../core/timeline-schema.ts';
import { onTheMs } from '../core/time.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { FilmTimelines, type TimelineError } from './film-timeline.ts';
import { ProductionStore } from './production-store.ts';
import {
  SCRIPT_FILE,
  editHold,
  editOrder,
  holdMissed,
  holdTarget,
  moveTarget,
  orderMissed,
} from './script-source.ts';
import {
  type Change,
  type Files,
  type RewriteError,
  type StepAsk,
  type StepError,
  SourceWriter,
  UNDO_DEPTH,
} from './source-writer.ts';

interface MoveAsk {
  readonly film: string;
  readonly version: Option.Option<number>;
  readonly beat: string;
  readonly before: MovedBefore;
  readonly by: string;
}

interface HoldAsk {
  readonly film: string;
  readonly version: Option.Option<number>;
  readonly beat: string;
  readonly edge: HoldEdge;
  readonly seconds: number;
  readonly by: string;
}

export interface Edited {
  readonly change: Option.Option<Change>;
  readonly target: string;
  readonly said: string;
}

type EditError = TimelineError | RewriteError | SourceRefused | HoldUnchanged;

interface BeatEditsService {
  readonly move: (ask: MoveAsk) => Effect.Effect<Edited, EditError>;
  readonly hold: (ask: HoldAsk) => Effect.Effect<Edited, EditError>;
  readonly undo: (film: string, ask: StepAsk) => Effect.Effect<Edited, StepError | EditError>;
}

const scriptOf = (
  dir: string,
  version: FilmVersion,
  target: string,
  join: (...parts: ReadonlyArray<string>) => string,
): Result.Result<string, SourceRefused> => {
  if (version.files === 'folder') return Result.succeed(join(dir, `v${version.n}`, SCRIPT_FILE));
  if (version.files === 'film') return Result.succeed(join(dir, SCRIPT_FILE));
  return Result.fail(
    SourceRefused.make({
      file: SCRIPT_FILE,
      target,
      reason: `version ${version.n} keeps no script of its own: a later version replaced it in place`,
    }),
  );
};

type Lane = FilmTimeline['lanes'][number];

const isScript = (l: Lane): l is Extract<Lane, { readonly track: 'script' }> =>
  l.track === 'script';
const isSound = (l: Lane): l is Extract<Lane, { readonly track: 'sound' }> => l.track === 'sound';

const scriptClips = (timeline: FilmTimeline) =>
  timeline.lanes.filter(isScript).flatMap((l) => l.clips);

const partsOf = (timeline: FilmTimeline) => [
  timeline.bands.map((b) => ({ from: b.from, name: b.name })),
  timeline.lanes
    .filter(isSound)
    .flatMap((l) => l.clips)
    .map((c) => ({ from: c.from, name: c.movement })),
];

type Words = ReadonlyMap<string, ReadonlyMap<string, string>>;

const wordsKept = (all: Words, film: string, id: string, said: string): Words => {
  const own = Option.getOrElse(
    Option.fromUndefinedOr(all.get(film)),
    (): ReadonlyMap<string, string> => new Map(),
  );
  return new Map([...all, [film, new Map([...own, [id, said] as const].slice(-UNDO_DEPTH))]]);
};

const setBy = (target: string) => target.replace(/^undo /, '');

export class BeatEdits extends Context.Service<BeatEdits, BeatEditsService>()(
  '@manna/film/tools/BeatEdits',
) {
  static readonly layer = Layer.effect(
    BeatEdits,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const folder = yield* FilmFolder;
      const timelines = yield* FilmTimelines;
      const writer = yield* SourceWriter;
      const productions = yield* ProductionStore;
      const films = yield* Effect.context<FilmFolder>();
      const words = yield* Ref.make<Words>(new Map());

      const filing = (production: Option.Option<string>, said: string, by: string, at: number) =>
        Option.map(production, (p): Files => {
          const text = workFiled(said);
          const note: Said = {
            _tag: 'Noted',
            at,
            text,
            quote: Option.none(),
            set: Option.none(),
            point: Option.none(),
            variant: Option.none(),
            ask: Option.none(),
            picks: Option.none(),
            by: Option.some(by),
          };
          const isIt = (s: Said) =>
            s._tag === 'Noted' && s.at === at && s.text === text && Option.contains(s.by, by);
          return {
            file: Effect.asVoid(
              productions.modify(p, (current) =>
                Result.succeed({
                  ...current,
                  said: [...current.said.filter((s) => !isIt(s)), note].sort((a, b) => a.at - b.at),
                }),
              ),
            ),
            withdraw: Effect.asVoid(
              productions.modify(p, (current) =>
                Result.succeed({ ...current, said: current.said.filter((s) => !isIt(s)) }),
              ),
            ),
          };
        });

      const versionOf = Effect.fn('BeatEdits.versionOf')(function* (
        film: FilmName,
        version: Option.Option<number>,
        target: string,
      ) {
        const timeline = yield* timelines.timeline(film, version);
        const file = yield* Effect.fromResult(
          scriptOf(folder.paths(film).dir, timeline.version, target, (...parts) =>
            path.join(...parts),
          ),
        );
        return { timeline, file };
      });

      const written = Effect.fn('BeatEdits.written')(function* (
        film: FilmName,
        timeline: FilmTimeline,
        at: {
          readonly file: string;
          readonly beat: string;
          readonly target: string;
          readonly said: string;
          readonly already: string;
          readonly by: string;
        },
        edit: (source: string) => Result.Result<string, SourceRefused>,
        verify: (
          after: string,
          before: string,
        ) => Result.Result<ReadonlyArray<string>, SourceRefused>,
      ) {
        const now = yield* Clock.currentTimeMillis;
        const files = filing(Option.fromUndefinedOr(timeline.production), at.said, at.by, now);
        const [change] = yield* writer.write({
          film,
          scene: Option.some(at.beat),
          file: at.file,
          target: at.target,
          edit,
          verify,
          check: () => Effect.void,
          ...Option.match(files, { onNone: () => ({}), onSome: (f) => ({ files: f }) }),
        });
        yield* Option.match(change, {
          onNone: () => Effect.void,
          onSome: (c) => Ref.update(words, (all) => wordsKept(all, film, c.id, at.said)),
        });
        yield* Effect.logInfo(
          `[studio] edit film=${film} target="${at.target}" by="${at.by}" landed=${Option.isSome(change)}`,
        );
        const said = Option.match(change, {
          onNone: () => at.already,
          onSome: () => `${at.said} ${AGENTS_AFTER}`,
        });
        return { change, target: at.target, said } satisfies Edited;
      });

      const move = Effect.fn('BeatEdits.move')(function* (ask: MoveAsk) {
        const film = yield* filmNamed(ask.film).pipe(Effect.provideContext(films));
        const target = moveTarget(ask.beat, ask.before);
        const { timeline, file } = yield* versionOf(film, ask.version, target);
        const parts = partsOf(timeline);
        return yield* written(
          film,
          timeline,
          {
            file,
            beat: ask.beat,
            target,
            said: movedWords(ask.beat, ask.before),
            already: `${ask.beat} is already there.`,
            by: ask.by,
          },
          (source) => editOrder(source, ask.beat, ask.before, parts),
          (after, before) => orderMissed(after, before, ask.beat, ask.before),
        );
      });

      const hold = Effect.fn('BeatEdits.hold')(function* (ask: HoldAsk) {
        const film = yield* filmNamed(ask.film).pipe(Effect.provideContext(films));
        const target = holdTarget(ask.beat, ask.edge);
        const { timeline, file } = yield* versionOf(film, ask.version, target);
        const clip = yield* Effect.fromOption(
          Option.fromUndefinedOr(scriptClips(timeline).find((c) => c.beat === ask.beat)),
        ).pipe(
          Effect.mapError(() =>
            SourceRefused.make({
              file: SCRIPT_FILE,
              target,
              reason: `the script has no beat "${ask.beat}"`,
            }),
          ),
        );
        const now = onTheMs(clip.hold[ask.edge]);
        const value = heldWithin(ask.edge, ask.seconds, now);
        yield* Option.match(holdUnchanged(clip, ask.edge, value), {
          onNone: () => Effect.void,
          onSome: (reason) => HoldUnchanged.make({ beat: ask.beat, edge: ask.edge, reason }),
        });
        const as = holdWritten(ask.edge, value);
        const already = value === now && !clip.hold.declared.includes(ask.edge);
        return yield* written(
          film,
          timeline,
          {
            file,
            beat: ask.beat,
            target,
            said: heldWords(ask.beat, ask.edge, now, heldTo(clip, ask.edge, value).hold[ask.edge]),
            already: heldAlready(ask.beat, ask.edge, value),
            by: ask.by,
          },
          (source) =>
            Bool.match(already, {
              onTrue: () => Result.succeed(source),
              onFalse: () => editHold(source, ask.beat, ask.edge, as),
            }),
          (after) =>
            Bool.match(already, {
              onTrue: () => Result.succeed<ReadonlyArray<string>>([]),
              onFalse: () => holdMissed(after, ask.beat, ask.edge, as),
            }),
        );
      });

      const undo = Effect.fn('BeatEdits.undo')(function* (name: string, ask: StepAsk) {
        const film = yield* filmNamed(name).pipe(Effect.provideContext(films));
        const [change] = yield* writer.undo(film, ask);
        const kept = Option.flatMap(
          Option.fromUndefinedOr((yield* Ref.get(words)).get(film)),
          (own) => Option.fromUndefinedOr(own.get(change.id)),
        );
        const said = Option.getOrElse(kept, () => `${setBy(change.target)}.`);
        yield* Effect.logInfo(`[studio] undo film=${film} target="${change.target}"`);
        return {
          change: Option.some(change),
          target: change.target,
          said: undone(said),
        } satisfies Edited;
      });

      return BeatEdits.of({ move, hold, undo });
    }),
  );
}
