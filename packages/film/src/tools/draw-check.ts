import { Array as Arr, Effect, Option, Order, Predicate, type Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import { isStandInCanvas, recorder, standInDom } from '../canvas/fixtures/stand-in.ts';
import type { RigNameMissing, RigUnloadable } from '../core/errors.ts';
import type { PuppetImages, PuppetUnloadable } from '../puppet/images.ts';
import { loadPuppets } from '../puppet/load.ts';
import { EDGES, shownEdges } from '../canvas/painting.ts';
import type { PaintingImages, PaintingUnloadable } from '../painting/images.ts';
import { loadPaintings } from '../painting/load.ts';
import { sceneMoments } from '../core/moments.ts';
import { loadRigs } from '../rive/load.ts';
import { RiveRuntimeBun } from '../rive/runtime-bun.ts';
import { FNV_START, fnvStep, fnvText } from '../core/random.ts';
import { framesOf, secondsAt } from '../core/time.ts';
import { inkOverFace } from './check.ts';
import { type DrawFinding, DrawThrew, FrameImpure, InkOverFace, PaintingEdge } from './findings.ts';

const fontPx = (font: string): number =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]), Number),
    () => 10,
  );

const measure = (font: string, text: string) => fontPx(font) * 0.5 * text.length;

const BLANK = { record: false, measure } as const;

const blank = () => recorder(1920, 1080, BLANK).ctx;

const sinkOf = (): Required<Pick<ProbeSink, 'texts' | 'inks' | 'faces' | 'paintings'>> => ({
  texts: [],
  inks: [],
  faces: [],
  paintings: [],
});

const UNLOGGED: ReadonlySet<PropertyKey> = new Set([
  'createLinearGradient',
  'createRadialGradient',
  'createConicGradient',
  'createPattern',
  'createImageData',
  'getImageData',
  'getTransform',
  'measureText',
  'isPointInPath',
  'isPointInStroke',
  'getLineDash',
]);

type Call = readonly [name: PropertyKey, args: ReadonlyArray<unknown>];

const kept = (args: ReadonlyArray<unknown>): ReadonlyArray<unknown> =>
  args.map((v) => {
    if (Predicate.isFunction(v)) return '<function>';
    if (isStandInCanvas(v)) return `<canvas ${v.made}>`;
    if (Predicate.isObject(v)) return '<object>';
    return v;
  });

const atOrigin = (key: PropertyKey, args: ReadonlyArray<unknown>) =>
  key === 'drawImage' && args.length === 3 && args[1] === 0 && args[2] === 0;

const logging = (
  onCall: (key: PropertyKey, args: ReadonlyArray<unknown>) => void,
  fresh: () => void,
): CanvasRenderingContext2D => {
  let paper = Option.none<unknown>();
  return recorder(1920, 1080, {
    ...BLANK,
    onCall: (key, args) => {
      if (UNLOGGED.has(key)) return;
      if (atOrigin(key, args)) {
        if (Option.isNone(paper)) paper = Option.some(args[0]);
        if (Option.contains(paper, args[0])) fresh();
      }
      onCall(key, args);
    },
  }).ctx;
};

const bits = new Float64Array(1);
const words = new Uint32Array(bits.buffer);

const nameHashes = new Map<PropertyKey, number>();
const nameHash = (key: PropertyKey) =>
  Option.getOrElse(Option.fromUndefinedOr(nameHashes.get(key)), () => {
    const h = fnvText(FNV_START, String(key));
    nameHashes.set(key, h);
    return h;
  });

const fingerprintAt = (film: Film, T: number, probe: ProbeSink) => {
  let hash = FNV_START;
  let calls = 0;
  const ctx = logging(
    (key, args) => {
      calls += 1;
      hash = fnvStep(hash, nameHash(key));
      for (const v of kept(args)) {
        if (Predicate.isNumber(v)) {
          bits[0] = v;
          hash = fnvStep(hash, words[0] ?? 0);
          hash = fnvStep(hash, words[1] ?? 0);
        } else hash = fnvText(hash, String(v));
      }
    },
    () => {
      hash = FNV_START;
      calls = 0;
    },
  );
  film.render(ctx, T, { captions: true, probe });
  return `${calls}:${hash >>> 0}`;
};

const callsAt = (film: Film, T: number, probe: ProbeSink): ReadonlyArray<Call> => {
  const log: Call[] = [];
  const ctx = logging(
    (key, args) => log.push([key, kept(args)]),
    () => {
      log.length = 0;
    },
  );
  film.render(ctx, T, { captions: true, probe });
  return log;
};

const sameAt = (a: ReadonlyArray<Call>, b: ReadonlyArray<Call>, k: number) =>
  Option.exists(
    Option.all([Option.fromUndefinedOr(a[k]), Option.fromUndefinedOr(b[k])]),
    ([x, y]) =>
      x[0] === y[0] && x[1].length === y[1].length && x[1].every((v, i) => Object.is(v, y[1][i])),
  );

const shownAt = (log: ReadonlyArray<Call>, k: number) =>
  Option.match(Option.fromUndefinedOr(log[k]), {
    onNone: () => 'nothing',
    onSome: ([name, args]) => `${String(name)}(${args.map(String).join(', ')})`,
  });

const bothWays = <A>(
  film: Film,
  frame: number,
  at: (film: Film, T: number, probe: ProbeSink) => A,
  probe: ProbeSink,
) => {
  const T = (f: number) => secondsAt(f, film.fps);
  film.render(blank(), T(frame + 1), { captions: true });
  const afterNext = at(film, T(frame), sinkOf());
  film.render(blank(), T(Math.max(0, frame - 1)), { captions: true });
  const afterBefore = at(film, T(frame), probe);
  return { afterNext, afterBefore };
};

export const impureAt = (
  film: Film,
  frame: number,
  probe: ProbeSink = sinkOf(),
): Option.Option<string> => {
  const quick = bothWays(film, frame, fingerprintAt, probe);
  if (quick.afterNext === quick.afterBefore) return Option.none();
  const { afterNext, afterBefore } = bothWays(film, frame, callsAt, sinkOf());
  const length = Math.max(afterNext.length, afterBefore.length);
  const first = Arr.findFirst(
    Arr.makeBy(length, (k) => k),
    (k) => !sameAt(afterNext, afterBefore, k),
  );
  return Option.some(
    Option.match(first, {
      onNone: () =>
        `its calls hash ${quick.afterNext} after the next frame, ${quick.afterBefore} after the one before`,
      onSome: (k) =>
        `call ${k}: ${shownAt(afterNext, k)} after the next frame, ${shownAt(afterBefore, k)} after the one before`,
    }),
  );
};

interface DrawMoment {
  readonly scene: string;
  readonly at: string;
  readonly frame: number;
  readonly time: number;
  readonly pure: boolean;
}

const drawMoments = (film: Film): ReadonlyArray<DrawMoment> => {
  const fps = film.fps;
  const sampled = sceneMoments(film.placed, fps, { marks: false }).map((m) => ({
    ...m,
    pure: m.at.includes('start') || m.at.includes('60%'),
  }));
  const edges = film.placed.flatMap((p) => {
    const { first, last } = framesOf({ from: p.start, to: p.start + p.dur }, fps);
    const at = (label: string, frame: number): DrawMoment => ({
      scene: p.spec.id,
      at: label,
      frame,
      time: secondsAt(frame, fps),
      pure: false,
    });
    const mids = [...p.cues]
      .filter(([, c]) => c.end > c.start)
      .map(([cue, c]) =>
        at(
          `cue ${cue} mid`,
          Math.min(last, Math.max(first, Math.round((p.start + (c.start + c.end) / 2) * fps))),
        ),
      );
    const moments = [at('start', first), at('end', last), ...mids];
    if (Object.keys(p.spec.paintings ?? {}).length > 0)
      moments.push(
        at('breath peak', Math.min(last, Math.max(first, Math.round((p.start + p.dur / 2) * fps)))),
      );
    return moments;
  });
  return [...sampled, ...edges];
};

const paintingEdges = (
  sample: { readonly time: number; readonly at: string },
  probe: ProbeSink,
  frame: { readonly width: number; readonly height: number },
): ReadonlyArray<PaintingEdge> =>
  (probe.paintings ?? []).flatMap((mark) => {
    const edges = shownEdges(mark.quad, frame.width, frame.height).filter(
      (edge) => !mark.open.includes(edge),
    );
    if (edges.length === 0) return [];
    return [
      PaintingEdge.make({
        scene: mark.scene,
        time: sample.time,
        at: sample.at,
        painting: mark.key,
        edges,
      }),
    ];
  });

const drawAt = (film: Film, m: DrawMoment): Effect.Effect<ReadonlyArray<DrawFinding>> => {
  const where = { scene: m.scene, time: m.time, at: m.at };
  const sample = { ...where, frame: m.frame };
  const probe = sinkOf();
  const frame = { width: film.width, height: film.height };
  return Effect.sync((): ReadonlyArray<DrawFinding> => {
    if (!m.pure) {
      film.render(blank(), m.time, { captions: true, probe });
      return [...inkOverFace(sample, probe, frame), ...paintingEdges(sample, probe, frame)];
    }
    const impure = Option.map(impureAt(film, m.frame, probe), (why) =>
      FrameImpure.make({ ...where, why }),
    );
    return [
      ...Option.toArray(impure),
      ...inkOverFace(sample, probe, frame),
      ...paintingEdges(sample, probe, frame),
    ];
  }).pipe(
    Effect.catchDefect((defect) =>
      Effect.succeed([DrawThrew.make({ ...where, why: String(defect) })]),
    ),
  );
};

const mergeFaces = (found: ReadonlyArray<DrawFinding>): ReadonlyArray<DrawFinding> => {
  const faces = Arr.groupBy(
    found.filter((f) => f._tag === 'InkOverFace'),
    (f) => f.scene,
  );
  const merged = Object.values(faces).map((same) => {
    const first = Arr.headNonEmpty(Arr.sortWith(same, (f) => f.time, Order.Number));
    return InkOverFace.make({
      scene: first.scene,
      time: first.time,
      at: first.at,
      x: first.x,
      y: first.y,
      size: first.size,
      strokes: Math.max(...same.map((f) => f.strokes)),
      texts: Arr.dedupe(same.flatMap((f) => f.texts)),
      frames: new Set(same.map((f) => f.time)).size,
    });
  });
  return [
    ...found.filter((f) => f._tag !== 'InkOverFace'),
    ...Arr.sortWith(merged, (f) => f.time, Order.Number),
  ];
};

const mergeEdges = (found: ReadonlyArray<DrawFinding>): ReadonlyArray<DrawFinding> => {
  const shown = found.filter((f) => f._tag === 'PaintingEdge');
  const merged = Object.values(Arr.groupBy(shown, (f) => f.scene)).flatMap((scene) =>
    Object.values(Arr.groupBy(scene, (f) => f.painting)).map((group) => {
      const first = Arr.headNonEmpty(Arr.sortWith(group, (f) => f.time, Order.Number));
      const seen = new Set(group.flatMap((f) => f.edges));
      return PaintingEdge.make({ ...first, edges: EDGES.filter((edge) => seen.has(edge)) });
    }),
  );
  return [
    ...found.filter((f) => f._tag !== 'PaintingEdge'),
    ...Arr.sortWith(merged, (f) => f.time, Order.Number),
  ];
};

export const drawFindings = (
  build: () => Film,
  scenes: ReadonlySet<string> = new Set(),
): Effect.Effect<
  ReadonlyArray<DrawFinding>,
  RigUnloadable | RigNameMissing | PuppetUnloadable | PaintingUnloadable,
  Scope.Scope | PuppetImages | PaintingImages
> =>
  Effect.gen(function* () {
    yield* standInDom(BLANK);
    const film = yield* loadPaintings(yield* loadPuppets(yield* loadRigs(build())));
    const moments = drawMoments(film).filter((m) => scenes.size === 0 || scenes.has(m.scene));
    const found = yield* Effect.forEach(moments, (m) => drawAt(film, m));
    return mergeEdges(mergeFaces(found.flat()));
  }).pipe(Effect.provide(RiveRuntimeBun));

export const momentCounts = (film: Film) => {
  const moments = drawMoments(film);
  return { moments: moments.length, pure: moments.filter((m) => m.pure).length };
};
