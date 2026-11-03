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
import { type PageOpenError, lumaOf } from './browser.ts';
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
  readonly workers: number;
  readonly scope: Scope;
  readonly server: Option.Option<string>;
}

type ProbeFrame = (
  i: number,
) => Effect.Effect<Probed, PageOpenError | PageError | PageCrashed | FrameFailed>;

const probedOnce =
  (pages: ExportPages, seen: Map<number, Probed>): ProbeFrame =>
  (i) =>
    Option.match(Option.fromNullishOr(seen.get(i)), {
      onSome: (probed) => Effect.succeed(probed),
      onNone: () =>
        pages
          .call('probe', i)
          .pipe(Effect.tap((probed) => Effect.sync(() => void seen.set(i, probed)))),
    });

interface HoldProbe {
  readonly holds: ReadonlyArray<StaticHold>;
  readonly frames: number;
}

const reach = (
  probeAt: ProbeFrame,
  workers: number,
  anchor: Probed,
  from: number,
  frames: ReadonlyArray<number>,
) =>
  Effect.gen(function* () {
    let still = from;
    for (const batch of Arr.chunksOf(frames, workers)) {
      const probed = yield* Effect.forEach(batch, probeAt, { concurrency: workers });
      for (const [i, p] of Arr.zip(batch, probed)) {
        if (!heldStill([anchor, p])) return still;
        still = i;
      }
    }
    return still;
  });

const confirmHold = (
  pages: ExportPages,
  workers: number,
  fps: number,
  hold: HoldCandidate,
): Effect.Effect<HoldProbe, PageOpenError | PageError | PageCrashed | FrameFailed> =>
  Effect.gen(function* () {
    const seen = new Map<number, Probed>();
    const probeAt = probedOnce(pages, seen);
    const ticks = holdTicks(hold, fps);
    const grid = holdGrid(ticks);
    yield* Effect.forEach(grid, probeAt, { concurrency: workers, discard: true });
    let longest: Interval = { from: hold.from, to: hold.from };
    let reached = -1;
    for (const [tick, next] of Arr.zip(grid, grid.slice(1))) {
      if (tick <= reached) continue;
      const anchor = yield* probeAt(tick);
      if (!heldStill([anchor, yield* probeAt(next)])) continue;
      const at = ticks.indexOf(tick);
      const hi = yield* reach(probeAt, workers, anchor, tick, ticks.slice(at + 1));
      const lo = yield* reach(probeAt, workers, anchor, tick, ticks.slice(0, at).reverse());
      const run = stillSpan(hold, ticks, lo, hi, fps);
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
  readonly workers: number;
  readonly zone: SafeZoneName;
  readonly static: boolean;
}

type ShortCheckError = LayoutCheckError | ShortError;

interface CheckerService {
  readonly layout: (
    film: LoadedFilm,
    options: LayoutCheckOptions,
  ) => Effect.Effect<ReadonlyArray<LayoutFinding>, LayoutCheckError>;
  readonly cut: (film: LoadedFilm, short: Short) => Effect.Effect<ResolvedShort, ShortCheckError>;
  readonly short: (
    film: LoadedFilm,
    short: Short,
    options: ShortCheckOptions,
  ) => Effect.Effect<ReadonlyArray<ShortFinding>, ShortCheckError>;
  readonly talk: (
    film: LoadedFilm,
    talk: TalkVertical,
    options: { readonly workers: number; readonly span: Option.Option<Interval> },
  ) => Effect.Effect<ReadonlyArray<ShortFinding>, LayoutCheckError>;
}

export class Checker extends Context.Service<Checker, CheckerService>()(
  '@manna/film/tools/Checker',
) {
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
              (hold) => confirmHold(pool, workers, info.fps, hold),
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
            const open = yield* Effect.forEach(openFrames(info.fps), probeAt, {
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
            const [first, last] = yield* Effect.all([lumaAt(0), lumaAt(info.frames - 1)], {
              concurrency: 2,
            });
            const findings = [
              ...words,
              ...unsafe,
              ...Option.toArray(stillOpen(cut.id, open, SHORT_RULES.motionBy)),
              ...Option.toArray(titled),
              ...Option.toArray(loopPicture(cut.id, first, last)),
            ];
            yield* Effect.log(
              `check.short film=${name} short=${cut.id} zone=${options.zone} frames=${frames.length + open.length + 2} loop=${lumaDiff(first, last).toFixed(3)} findings=${findings.length}`,
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
            const open = yield* Effect.forEach(openFrames(info.fps).filter(inSpan), probeAt, {
              concurrency: workers,
            });
            const findings = [
              ...unsafe,
              ...Option.toArray(stillOpen(vertical.id, open, SHORT_RULES.motionBy)),
            ];
            yield* Effect.log(
              `check.talk film=${vertical.id} zone=platforms frames=${frames.length + open.length} findings=${findings.length}`,
            );
            return findings;
          }),
        );
      });

      return Checker.of({ layout, cut, short, talk });
    }),
  ).pipe(Layer.provide(Pages.layer));
}
