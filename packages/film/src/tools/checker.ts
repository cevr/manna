import { Array as Arr, Context, Effect, Layer, Option } from 'effect';
import type { Scope } from '../core/address.ts';
import { CLOCK_EPSILON, type Interval, secondsAt } from '../core/time.ts';
import { shortPhrases } from '../core/phrases.ts';
import type { ShortError } from '../core/errors.ts';
import type { LumaArea, Probed } from '../core/export-handle.ts';
import type { Short } from '../core/schema.ts';
import {
  type ResolvedShort,
  bandOf,
  SHORT_RULES,
  SHORT_WIDTH,
  type SafeZoneName,
  resolveShort,
  shortKey,
} from '../core/shorts.ts';
import { type PageOpenError, driftOf, lumaOf } from './browser.ts';
import {
  loopPicture,
  lumaDiff,
  mergeUnsafe,
  openFrames,
  shortStaticFindings,
  stillOpen,
  type TalkVertical,
  titleOpen,
  unsafeTexts,
  zoneFrames,
} from './short-check.ts';
import {
  HOLD,
  type HoldCandidate,
  type Sample,
  frameFindings,
  framesHeld,
  heldStill,
  holdCandidates,
  holdGrid,
  holdTicks,
  stillSpan,
  platesOffFrame,
  layoutSamples,
  mergeFindings,
} from './check.ts';
import type { FrameFailed, PageCrashed, PageError } from './errors.ts';
import { type LayoutFinding, type ShortFinding, StaticHold } from './findings.ts';
import { type LoadedFilm, type PlaceError, placeFilm } from './film-repo.ts';
import { type ExportPages, Pages } from './pages.ts';

type LayoutCheckError = PageOpenError | PageError | PageCrashed | FrameFailed | PlaceError;

interface LayoutCheckOptions {
  /** Pages probing at once. */
  readonly workers: number;
  /** The part of the film probed (`resolveAddress`): every scene for the whole film. */
  readonly scope: Scope;
  /** The server its pages draw on: a wedge's (`check --level`, `wedgeServer`), or none for the PreviewServer. */
  readonly server: Option.Option<string>;
}

type FrameError = PageOpenError | PageError | PageCrashed | FrameFailed;

/** Read frame `i` once however many runs reach it: `seen` keeps what it read. */
const once =
  <A>(seen: Map<number, A>, read: (i: number) => Effect.Effect<A, FrameError>) =>
  (i: number): Effect.Effect<A, FrameError> =>
    Option.match(Option.fromNullishOr(seen.get(i)), {
      onSome: (a) => Effect.succeed(a),
      onNone: () => read(i).pipe(Effect.tap((a) => Effect.sync(() => void seen.set(i, a)))),
    });

/**
 * A hold's frames as the checks read them: each probed, and its drift from
 * the anchor drawn frozen over `area`, read only once its probe holds still
 * against the anchor's (the pixels are asked only of a frame the marks
 * cannot tell moved).
 */
interface HoldReads {
  readonly probe: (i: number) => Effect.Effect<Probed, FrameError>;
  readonly drift: (anchor: number, i: number) => Effect.Effect<ReadonlyArray<number>, FrameError>;
  readonly area: LumaArea;
}

/** Whether frame `i` holds still against frame `anchor`, as probed and as drawn (`framesHeld`). */
const heldAgainst = (reads: HoldReads, anchor: number, i: number) =>
  Effect.gen(function* () {
    const probed = [yield* reads.probe(anchor), yield* reads.probe(i)];
    if (!heldStill(probed)) return false;
    const drifts = [yield* reads.drift(anchor, i)];
    return framesHeld(probed, { area: reads.area, drifts });
  });

/** How far each frame of `opening` after its first changed from the first, drawn frozen over `area` (`drift`). */
const openDrifts = (
  pages: ExportPages,
  workers: number,
  opening: ReadonlyArray<number>,
  area: LumaArea,
) =>
  Option.match(Arr.head(opening), {
    onNone: () => Effect.succeed<ReadonlyArray<ReadonlyArray<number>>>([]),
    onSome: (from) =>
      Effect.forEach(opening.slice(1), (i) => pages.use((page) => driftOf(page, from, i, area)), {
        concurrency: workers,
      }),
  });

/** What probing across one hold candidate found, and how many frames it drew. */
interface HoldProbe {
  readonly holds: ReadonlyArray<StaticHold>;
  readonly frames: number;
}

/**
 * The last of `frames`, in order, that holds still against `anchor` before
 * one moves; `anchor` when the first moves. They are read `workers` at a
 * time, so a run grows on every page at once.
 */
const reach = (reads: HoldReads, workers: number, anchor: number, frames: ReadonlyArray<number>) =>
  Effect.gen(function* () {
    let still = anchor;
    for (const batch of Arr.chunksOf(frames, workers)) {
      const held = yield* Effect.forEach(batch, (i) => heldAgainst(reads, anchor, i), {
        concurrency: workers,
      });
      for (const [i, h] of Arr.zip(batch, held)) {
        if (!h) return still;
        still = i;
      }
    }
    return still;
  });

/**
 * A hold candidate is a `StaticHold` when a run of its boil ticks over
 * `HOLD` holds still against one of them: the longest such run is reported.
 * The grid ticks are probed first; where two in a row hold still, the run
 * grows from the first of them tick by tick each way until a tick moves, so
 * motion no cue declares ends a run and the still stretch after it is still
 * found. Most candidates that move show it at their grid.
 */
const confirmHold = (
  pages: ExportPages,
  workers: number,
  info: { readonly fps: number; readonly width: number; readonly height: number },
  hold: HoldCandidate,
): Effect.Effect<HoldProbe, FrameError> =>
  Effect.gen(function* () {
    const seen = new Map<number, Probed>();
    const area: LumaArea = { x: 0, y: 0, w: info.width, h: info.height, ...SHORT_RULES.loopGrid };
    const reads: HoldReads = {
      probe: once(seen, (i) => pages.call('probe', i)),
      drift: (anchor, i) => pages.use((page) => driftOf(page, anchor, i, area)),
      area,
    };
    const ticks = holdTicks(hold, info.fps);
    const grid = holdGrid(ticks);
    yield* Effect.forEach(grid, reads.probe, { concurrency: workers, discard: true });
    let longest: Interval = { from: hold.from, to: hold.from };
    let reached = -1;
    for (const [tick, next] of Arr.zip(grid, grid.slice(1))) {
      if (tick <= reached) continue;
      if (!(yield* heldAgainst(reads, tick, next))) continue;
      const at = ticks.indexOf(tick);
      const hi = yield* reach(reads, workers, tick, ticks.slice(at + 1));
      const lo = yield* reach(reads, workers, tick, ticks.slice(0, at).reverse());
      const run = stillSpan(hold, ticks, lo, hi, info.fps);
      reached = hi;
      if (run.to - run.from > longest.to - longest.from) longest = run;
    }
    const { from, to } = longest;
    if (to - from <= HOLD + CLOCK_EPSILON) return { holds: [], frames: seen.size };
    return {
      holds: [StaticHold.make({ scene: hold.scene, from, to, max: HOLD })],
      frames: seen.size,
    };
  });

interface ShortCheckOptions {
  /** Pages probing at once. */
  readonly workers: number;
  /** The safe zone its text is held to. */
  readonly zone: SafeZoneName;
  /** Only what its words tell: no frame is probed (the page is opened for its frame rate alone). */
  readonly static: boolean;
}

type ShortCheckError = LayoutCheckError | ShortError;

interface CheckerService {
  /**
   * Probe every sampled frame and return what collides, one finding per pair
   * and scene; then probe across each hold candidate and return the ones that
   * hold still.
   */
  readonly layout: (
    film: LoadedFilm,
    options: LayoutCheckOptions,
  ) => Effect.Effect<ReadonlyArray<LayoutFinding>, LayoutCheckError>;
  /** A short on the film's frames, at the rate the film declares: the frames its page draws and the renderer cuts. */
  readonly cut: (film: LoadedFilm, short: Short) => Effect.Effect<ResolvedShort, ShortCheckError>;
  /**
   * Check a short, resolved on the film's frames: what its words tell (its
   * length, its first word, its loop's silence); then, unless `static`, its
   * page probed every half second and at each phrase's first frame for text
   * past the safe zone, the open for motion and the film's title card, and
   * its first and last frames' band for the loop.
   */
  readonly short: (
    film: LoadedFilm,
    short: Short,
    options: ShortCheckOptions,
  ) => Effect.Effect<ReadonlyArray<ShortFinding>, ShortCheckError>;
  /**
   * A talk's page probed every half second and at each phrase's first frame
   * for text past every platform's zone (`platforms`), and its open for motion
   * (its footage moving is motion), only over the film seconds `span` covers
   * when it has one (`--scene`, `--act`): the open only where it lies in it.
   * What its words tell is the static leg's (`talkWords`).
   */
  readonly talk: (
    film: LoadedFilm,
    talk: TalkVertical,
    options: { readonly workers: number; readonly span: Option.Option<Interval> },
  ) => Effect.Effect<ReadonlyArray<ShortFinding>, LayoutCheckError>;
}

export class Checker extends Context.Service<Checker, CheckerService>()(
  '@manna/film/tools/Checker',
) {
  /** On pages of its own (`Pages`), in the `Browser`, on the app's `PreviewServer`. */
  static readonly layer = Layer.effect(
    Checker,
    Effect.gen(function* () {
      const pages = yield* Pages;

      const layout = Effect.fn('Checker.layout')(function* (
        film: LoadedFilm,
        options: LayoutCheckOptions,
      ) {
        const placed = yield* placeFilm(film);
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const workers = Math.max(1, options.workers);
            const pool = yield* pages.open(film.paths.name, {
              workers,
              captions: true,
              server: options.server,
            });
            const info = pool.info;
            const chosen = new Set(options.scope.scenes.map((p) => p.spec.id));
            const samples = layoutSamples(placed, info.fps).filter((s) => chosen.has(s.scene));
            const probe = (sample: Sample) =>
              pool.use((page) =>
                Effect.gen(function* () {
                  const probed = yield* page.call('probe', sample.frame);
                  if (platesOffFrame(sample, probed, info).length === 0)
                    return frameFindings(sample, probed, info);
                  const next = yield* page.call(
                    'probe',
                    Math.min(sample.frame + 1, info.frames - 1),
                  );
                  return frameFindings(sample, probed, info, next);
                }),
              );
            const found = yield* Effect.forEach(samples, probe, { concurrency: workers });
            const findings = mergeFindings(found.flat());
            yield* Effect.log(
              `check.layout film=${film.paths.name} frames=${samples.length} findings=${findings.length}`,
            );
            const candidates = holdCandidates(placed).filter((c) => chosen.has(c.scene));
            const probed = yield* Effect.forEach(
              candidates,
              (hold) => confirmHold(pool, workers, info, hold),
              { concurrency: workers },
            );
            const holds = probed.flatMap((p) => p.holds);
            const frames = probed.reduce((n, p) => n + p.frames, 0);
            yield* Effect.log(
              `check.hold film=${film.paths.name} candidates=${candidates.length} frames=${frames} holds=${holds.length}`,
            );
            return [...findings, ...holds];
          }),
        );
      });

      /**
       * The short resolved on the film's layout, at the rate the film declares
       * (the one its page draws at): the frames the renderer draws, and its
       * phrases.
       */
      const resolved = Effect.fnUntraced(function* (film: LoadedFilm, declared: Short) {
        const placed = yield* placeFilm(film);
        const cut = yield* Effect.fromResult(resolveShort(placed, declared));
        return { cut, phrases: shortPhrases(placed, cut) };
      });

      const cut = Effect.fn('Checker.cut')(function* (film: LoadedFilm, declared: Short) {
        return (yield* resolved(film, declared)).cut;
      });

      const short = Effect.fn('Checker.short')(function* (
        film: LoadedFilm,
        declared: Short,
        options: ShortCheckOptions,
      ) {
        const name = film.paths.name;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const workers = Math.max(1, options.workers);
            const { cut, phrases } = yield* resolved(film, declared);
            const words = shortStaticFindings(cut, phrases);
            if (options.static) return words;
            const pool = yield* pages.open(shortKey(name, declared.id), {
              workers,
              captions: true,
              server: Option.none(),
            });
            const info = pool.info;
            const { title, band } = yield* Effect.map(
              pages.open(name, { workers: 1, captions: true, server: Option.none() }),
              (whole) => ({ title: whole.title, band: bandOf(whole.info) }),
            );
            const k = info.width / SHORT_WIDTH;
            const probeAt = (i: number) => pool.call('probe', i);
            const frames = zoneFrames(cut, phrases);
            const probed = yield* Effect.forEach(frames, probeAt, { concurrency: workers });
            const unsafe = mergeUnsafe(
              Arr.zip(frames, probed).flatMap(([i, p]) =>
                unsafeTexts(cut.id, options.zone, secondsAt(i, info.fps), p, k),
              ),
            );
            const opening = openFrames(info.fps);
            const open = yield* Effect.forEach(opening, probeAt, {
              concurrency: workers,
            });
            const titled = Option.flatMap(Arr.head(open), (first) =>
              titleOpen(cut.id, first, title),
            );
            const frame: LumaArea = {
              x: 0,
              y: band.top,
              w: band.width,
              h: band.height,
              ...SHORT_RULES.loopGrid,
            };
            const lumaAt = (i: number) => pool.use((page) => lumaOf(page, i, frame));
            const drifts = yield* openDrifts(pool, workers, opening, frame);
            const [first, last] = yield* Effect.all([lumaAt(0), lumaAt(info.frames - 1)], {
              concurrency: 2,
            });
            const findings = [
              ...words,
              ...unsafe,
              ...Option.toArray(
                stillOpen(cut.id, open, SHORT_RULES.motionBy, { area: frame, drifts }),
              ),
              ...Option.toArray(titled),
              ...Option.toArray(loopPicture(cut.id, first, last)),
            ];
            yield* Effect.log(
              `check.short film=${name} short=${cut.id} zone=${options.zone} frames=${frames.length + open.length + drifts.length + 3} loop=${lumaDiff(first, last).toFixed(3)} findings=${findings.length}`,
            );
            return findings;
          }),
        );
      });

      const talk = Effect.fn('Checker.talk')(function* (
        film: LoadedFilm,
        { film: vertical, phrases }: TalkVertical,
        { workers, span }: { readonly workers: number; readonly span: Option.Option<Interval> },
      ) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const pool = yield* pages.open(film.paths.name, {
              workers: Math.max(1, workers),
              captions: true,
              server: Option.none(),
            });
            const { info } = pool;
            const k = info.width / SHORT_WIDTH;
            const probeAt = (i: number) => pool.call('probe', i);
            const inSpan = (i: number) =>
              Option.match(span, {
                onNone: () => true,
                onSome: ({ from, to }) =>
                  secondsAt(i, info.fps) + CLOCK_EPSILON >= from &&
                  secondsAt(i, info.fps) + CLOCK_EPSILON < to,
              });
            const frames = zoneFrames(
              { duration: vertical.duration, fps: info.fps },
              phrases,
            ).filter(inSpan);
            const probed = yield* Effect.forEach(frames, probeAt, { concurrency: workers });
            const unsafe = mergeUnsafe(
              Arr.zip(frames, probed).flatMap(([i, p]) =>
                unsafeTexts(vertical.id, 'platforms', secondsAt(i, info.fps), p, k),
              ),
            );
            const opening = openFrames(info.fps).filter(inSpan);
            const open = yield* Effect.forEach(opening, probeAt, { concurrency: workers });
            const area: LumaArea = {
              x: 0,
              y: 0,
              w: info.width,
              h: info.height,
              ...SHORT_RULES.loopGrid,
            };
            const drifts = yield* openDrifts(pool, workers, opening, area);
            const findings = [
              ...unsafe,
              ...Option.toArray(
                stillOpen(vertical.id, open, SHORT_RULES.motionBy, { area, drifts }),
              ),
            ];
            yield* Effect.log(
              `check.talk film=${vertical.id} zone=platforms frames=${frames.length + open.length + drifts.length + 1} findings=${findings.length}`,
            );
            return findings;
          }),
        );
      });

      return Checker.of({ layout, cut, short, talk });
    }),
  ).pipe(Layer.provide(Pages.layer));
}
