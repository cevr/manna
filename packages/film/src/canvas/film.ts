import { Predicate, Result, Schema } from 'effect';
import { type Hand, boilTick } from './ink.ts';
import type { Hex } from './colour.ts';
import { DRIFT, type Drift, breathes, hearingCameras, insideCamera } from './camera.ts';
import type { Affine } from '../core/affine.ts';
import { type CaptionCue, sceneCaptions } from '../core/captions.ts';
import {
  type Placed,
  beatTime,
  everyTakeRecorded,
  filmEnd,
  layout,
  sceneIndexAt,
  transitionDur,
} from '../core/layout.ts';
import { CardsOverlap, FloodInTransition } from '../core/errors.ts';
import {
  type Knob,
  type Knobs,
  type ResolvedCue,
  type Point,
  type Sound,
  type Span,
  type Timed,
  type Timeline,
  type Timings,
  type Transition,
  type Word,
} from '../core/schema.ts';
import { cueKeys, cueProgress, endsLate, staggerAt, staggerProgress } from '../core/timeline.ts';
import {
  type Grain,
  type Offscreen,
  type PaperStyle,
  grain,
  keepAtMost,
  makeGrain,
  makeLight,
  makePaper,
  makeProduct,
  makeVignette,
  offscreen,
  shadeBy,
} from './paper.ts';
import {
  type BloomSheets,
  BloomStyle,
  GradeStyle,
  bloom,
  grade,
  gradeTables,
  makeBloom,
} from './grade.ts';
import { type Probe, type ProbeSink, probeOf, probing, recordPlate, recordText } from './probe.ts';
import {
  type Box,
  type CardSpec,
  type CardStyle,
  type CardWord,
  type VerseStyle,
  cardWords,
  floodBox,
} from './card.ts';
import { type LoadedRig, type PoseOf, type RivePropSpec, drawRig } from './rive.ts';
import {
  type LoadedPuppet,
  type PuppetDress,
  type PuppetLook,
  type PuppetPose,
  type PuppetSpec,
  drawPuppet,
} from './puppet.ts';
import {
  type LoadedPainting,
  type PaintingSpec,
  type Paintings,
  drawPainting,
} from './painting.ts';
import { seedOf } from '../core/random.ts';
import { CLOCK_EPSILON, type Key, clamp, ease, heardAtOrAfter, justBefore } from '../core/time.ts';

type KnobValue<V extends Knob> = V extends number ? number : Point;

type Rigs = Readonly<Record<string, RivePropSpec | undefined>>;

type NoRigs = Record<never, RivePropSpec>;

type Puppets = Readonly<Record<string, PuppetSpec | undefined>>;

type NoPuppets = Record<never, PuppetSpec>;

type NoPaintings = Record<never, PaintingSpec>;

export interface Frame<
  C extends string = string,
  K extends Knobs = Knobs,
  R extends Rigs = Rigs,
  P extends Puppets = Puppets,
  Pa extends Paintings = Paintings,
> {
  readonly ctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  readonly t: number;
  readonly dur: number;
  readonly T: number;
  readonly boil: number;
  readonly speech: { readonly start: number; readonly end: number };
  mark(name: string): number;
  cue(name: C): ResolvedCue;
  at(name: C): number;
  keys(name: C, frames: ReadonlyArray<Key>): number;
  stagger(name: C, i: number, n: number): number;
  staggerAt(name: C, at: number): number;
  knob<N extends keyof K & string>(name: N): KnobValue<K[N]>;
  rive<N extends keyof R & string>(name: N, pose: PoseOf<R[N]>): void;
  puppet<N extends keyof P & string>(
    name: N,
    pose: PuppetPose,
    look?: PuppetLook,
    dress?: PuppetDress,
  ): void;
  painting<N extends keyof Pa & string>(name: N): void;
  readonly words: ReadonlyArray<Word>;
  spoken(from: string, to?: string): number;
  hand(key: string | number): Hand;
  handsOf(of: KnobsOwner<Knobs>): (key: string | number) => Hand;
  knobsOf<K extends Knobs>(drawing: KnobsOwner<K>): KnobReader<K>;
}

function knobReader<K extends Knobs>(
  knobs: ReadonlyMap<string, Knob>,
  scene: string,
): KnobReader<K>;
function knobReader(knobs: ReadonlyMap<string, Knob>, scene: string) {
  return (name: string): Knob => {
    const k = knobs.get(name);
    if (k === undefined) throw new Error(`scene ${scene} has no knob "${name}"`);
    return k;
  };
}

interface KnobsOwner<K extends Knobs> {
  readonly draw: (f: never) => void;
  readonly knobs?: K;
}

type KnobReader<K extends Knobs> = <N extends keyof K & string>(name: N) => KnobValue<K[N]>;

const sceneHand = (scene: string, key: string | number, boil: number): Hand => ({
  boil,
  seed: Predicate.isNumber(key) ? key : seedOf(`${scene}:${key}`),
});

export interface SceneSpec extends Timed {
  readonly draw: (f: Frame) => Box | void;
  readonly rigs?: Rigs;
  readonly puppets?: Puppets;
  readonly paintings?: Paintings;
  readonly drift?: Drift | 0;
  readonly light?: Light | ((f: Frame) => Light);
  readonly cards?: ReadonlyArray<CardSpec<string, Frame>>;
}

export interface Light {
  readonly color: Hex;
  readonly edge?: Hex;
  readonly amount?: number;
  readonly vignette?: number;
}

const vignetteOf = (light: Light | undefined) => clamp(light?.vignette ?? 1);

type SpanOf<K extends string> = Span extends infer S
  ? S extends { readonly after: string }
    ? Omit<S, 'after'> & { readonly after: K }
    : S extends { readonly with: string }
      ? Omit<S, 'with'> & { readonly with: K }
      : S
  : never;

type Closed<T extends Timeline> = { readonly [N in keyof T]: SpanOf<keyof T & string> };

type NoKnobs = Record<never, Knob>;

export const drawing = <
  const T extends Timeline,
  const K extends Knobs = NoKnobs,
  const R extends Rigs = NoRigs,
  const P extends Puppets = NoPuppets,
  const Pa extends Paintings = NoPaintings,
>(
  d: Omit<
    SceneSpec,
    | 'id'
    | 'say'
    | 'timeline'
    | 'knobs'
    | 'rigs'
    | 'puppets'
    | 'paintings'
    | 'draw'
    | 'light'
    | 'cards'
  > & {
    readonly timeline: T & Closed<T>;
    readonly knobs?: K;
    readonly rigs?: R;
    readonly puppets?: P;
    readonly paintings?: Pa;
    readonly draw: (f: Frame<keyof T & string, K, R, P, Pa>) => Box | void;
    readonly light?: Light | ((f: Frame<keyof T & string, K, R, P, Pa>) => Light);
    readonly cards?: ReadonlyArray<
      CardSpec<keyof T & string, Frame<keyof T & string, K, R, P, Pa>>
    >;
  },
) => d;

const Unit = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
const Length = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

export const CaptionStyle = Schema.Struct({
  font: Schema.String,
  color: Schema.String,
  plate: Schema.String,
  plateOpacity: Schema.optionalKey(Unit),
  plateHeight: Schema.optionalKey(Length),
  platePadding: Schema.optionalKey(Length),
  plateRadius: Schema.optionalKey(Length),
  bottom: Schema.optionalKey(Schema.Finite),
});
export type CaptionStyle = typeof CaptionStyle.Type;

export const FinishStyle = Schema.Struct({
  vignette: Schema.optionalKey(Unit),
  grain: Schema.optionalKey(Unit),
  grainSize: Schema.optionalKey(Count),
  grainTiles: Schema.optionalKey(Count),
  bloom: Schema.optionalKey(BloomStyle),
  grade: Schema.optionalKey(GradeStyle),
});
export type FinishStyle = typeof FinishStyle.Type;

const SceneDrift = Schema.Union([
  Schema.Literal(0),
  Schema.Struct({
    zoom: Schema.Finite.check(Schema.isGreaterThan(-1)),
    x: Schema.Finite,
  }),
]);

const Font = Schema.NonEmptyString;

const ShortStyle = Schema.Struct({
  hook: Schema.optionalKey(Schema.Struct({ font: Font, color: Schema.String })),
  caption: Schema.optionalKey(
    Schema.Struct({
      font: Font,
      color: Schema.String,
      highlight: Schema.optionalKey(Schema.String),
    }),
  ),
});
type ShortStyle = typeof ShortStyle.Type;

export interface ShortLook {
  readonly hook: { readonly font: string; readonly color: string };
  readonly caption: { readonly font: string; readonly color: string; readonly highlight: string };
}

export interface FilmSpec {
  readonly title: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps: number;
  readonly paper: PaperStyle;
  readonly shade: string;
  readonly finish?: FinishStyle;
  readonly scenes: ReadonlyArray<SceneSpec>;
  readonly timings?: Timings;
  readonly captions?: CaptionStyle;
  readonly audio?: string;
  readonly sound?: Sound;
  readonly palette?: Readonly<Record<string, string>>;
  readonly short?: ShortStyle;
  readonly card?: { readonly style: CardStyle; readonly verse?: VerseStyle };
}

interface KnobRead {
  readonly scene: string;
  readonly name: string;
  readonly value: Knob;
  readonly transform: Affine | undefined;
  readonly framed?: Affine;
  readonly aimed?: Affine;
}

interface Reads {
  readonly list: KnobRead[];
  readonly direct: boolean;
}

interface ClockReads {
  readonly cues: Map<string, Set<string>>;
  readonly marks: Map<string, Set<string>>;
}

const hearsOf = (clock: ClockReads, id: string) => {
  const of = (by: Map<string, Set<string>>) => {
    const had = by.get(id);
    if (had !== undefined) return had;
    const made = new Set<string>();
    by.set(id, made);
    return made;
  };
  return { cues: of(clock.cues), marks: of(clock.marks) };
};

const trimTo = (set: Set<string>, size: number) => {
  let kept = 0;
  for (const name of set) if (kept++ >= size) set.delete(name);
};

const HEARD_NOTHING = (): void => {};

const heardSince = (clock: ClockReads | undefined, id: string): (() => void) => {
  if (clock === undefined) return HEARD_NOTHING;
  const { cues, marks } = hearsOf(clock, id);
  const had = { cues: cues.size, marks: marks.size };
  return () => {
    trimTo(cues, had.cues);
    trimTo(marks, had.marks);
  };
};

export interface FootageRead {
  readonly source: string;
  readonly at: number;
}

export interface FootageFrames {
  readonly frame: (read: FootageRead) => CanvasImageSource | undefined;
}

export interface RenderOptions {
  readonly captions?: boolean;
  readonly footage?: FootageFrames;
  readonly knobs?: KnobRead[];
  readonly clock?: ClockReads;
  readonly probe?: ProbeSink;
}

export interface Film {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly duration: number;
  readonly placed: ReadonlyArray<Placed<SceneSpec>>;
  readonly audio: string | undefined;
  readonly sound: Sound | undefined;
  readonly palette: Readonly<Record<string, string>>;
  readonly allRecorded: boolean;
  readonly look: FilmLook;
  sceneAt(T: number): Placed<SceneSpec>;
  readonly cardAt?: (T: number) => boolean;
  readonly footageAt?: (T: number) => ReadonlyArray<FootageRead>;
  readonly filmTimed?: (T: number) => boolean;
  render(ctx: CanvasRenderingContext2D, T: number, opts?: RenderOptions): void;
  readonly rigs: FilmRigs;
  readonly puppets: FilmPuppets;
  readonly paintings: FilmPaintings;
}

interface FilmPuppets {
  readonly declared: ReadonlyArray<PuppetSpec>;
  readonly stand: (loaded: ReadonlyMap<PuppetSpec, LoadedPuppet>) => () => void;
}

interface FilmPaintings {
  readonly declared: ReadonlyArray<PaintingSpec>;
  readonly stand: (loaded: ReadonlyMap<PaintingSpec, LoadedPainting>) => () => void;
}

interface FilmRigs {
  readonly declared: ReadonlyArray<RivePropSpec>;
  readonly stand: (loaded: ReadonlyMap<RivePropSpec, LoadedRig>) => () => void;
}

type Finish = Required<Omit<FinishStyle, 'bloom' | 'grade'>> & {
  readonly bloom: BloomStyle | undefined;
  readonly grade: GradeStyle | undefined;
};

interface FilmLook {
  readonly paper: PaperStyle;
  readonly shade: string;
  readonly finish: Finish;
  readonly short: ShortLook;
  readonly card: FilmSpec['card'];
}

const affineOf = (m: DOMMatrix): Affine => [m.a, m.b, m.c, m.d, m.e, m.f];

const finishOf = (declared: FinishStyle = {}): Finish => {
  const f = Schema.decodeSync(FinishStyle)(declared);
  return {
    vignette: f.vignette ?? 0.28,
    grain: f.grain ?? 0.03,
    grainSize: f.grainSize ?? 256,
    grainTiles: f.grainTiles ?? 6,
    bloom: f.bloom,
    grade: f.grade,
  };
};

const captionOf = (declared: CaptionStyle): Required<CaptionStyle> => {
  const c = Schema.decodeSync(CaptionStyle)(declared);
  return {
    font: c.font,
    color: c.color,
    plate: c.plate,
    plateOpacity: c.plateOpacity ?? 0.82,
    plateHeight: c.plateHeight ?? 60,
    platePadding: c.platePadding ?? 26,
    plateRadius: c.plateRadius ?? 12,
    bottom: c.bottom ?? 86,
  };
};

const QUOTE_GOLD = '#e6b347';

const shortOf = (declared: ShortStyle = {}, shade: string): ShortLook => {
  const s = Schema.decodeSync(ShortStyle)(declared);
  return {
    hook: s.hook ?? { font: '600 60px serif', color: shade },
    caption: {
      font: s.caption?.font ?? '600 58px sans-serif',
      color: s.caption?.color ?? shade,
      highlight: s.caption?.highlight ?? QUOTE_GOLD,
    },
  };
};

export const SHEETS_KEPT = 4;

const SINK_MARK = { texts: 0, inks: 0, faces: 0, hands: 0, paintings: 0 };

const markSink = (sink: ProbeSink | undefined) => {
  SINK_MARK.texts = sink?.texts.length ?? 0;
  SINK_MARK.inks = sink?.inks.length ?? 0;
  SINK_MARK.faces = sink?.faces?.length ?? 0;
  SINK_MARK.hands = sink?.hands?.length ?? 0;
  SINK_MARK.paintings = sink?.paintings?.length ?? 0;
};

const rewindSink = (sink: ProbeSink | undefined) => {
  if (sink === undefined) return;
  sink.texts.length = SINK_MARK.texts;
  sink.inks.length = SINK_MARK.inks;
  if (sink.faces !== undefined) sink.faces.length = SINK_MARK.faces;
  if (sink.hands !== undefined) sink.hands.length = SINK_MARK.hands;
  if (sink.paintings !== undefined) sink.paintings.length = SINK_MARK.paintings;
};

interface SetCard {
  readonly spec: CardSpec<string, Frame>;
  readonly words: ReadonlyArray<CardWord>;
}

interface BreathNow {
  through: number;
  drift: Drift | 0;
  outer: boolean;
  readonly width: number;
  readonly height: number;
}

const floodInTransition = (
  p: Placed<SceneSpec>,
  next: Placed<SceneSpec> | undefined,
  cues: ReadonlyMap<string, ResolvedCue>,
): Result.Result<ReadonlyMap<string, ResolvedCue>, FloodInTransition> => {
  const enter = transitionDur(p.spec.enter);
  for (const card of p.spec.cards ?? []) {
    const flood = card.flood;
    const c = flood === undefined ? undefined : cues.get(flood.cue);
    if (flood === undefined || c === undefined) continue;
    const refused = (side: 'into' | 'out', at: number, edge: number) =>
      Result.fail(
        FloodInTransition.make({
          scene: p.spec.id,
          cue: flood.cue,
          side,
          next: next?.spec.id ?? '',
          at,
          edge,
        }),
      );
    if (p.index > 0 && c.start < enter) return refused('into', c.start, enter);
    if (next !== undefined && transitionDur(next.spec.enter) > 0 && endsLate(c, p.dur))
      return refused('out', c.end, p.dur);
  }
  return Result.succeed(cues);
};

const cardsOverlap = (
  p: Placed<SceneSpec>,
  cues: ReadonlyMap<string, ResolvedCue>,
): Result.Result<ReadonlyMap<string, ResolvedCue>, CardsOverlap> => {
  const spans = (p.spec.cards ?? [])
    .flatMap((card) => {
      const c = cues.get(card.cue);
      return c === undefined ? [] : [{ cue: card.cue, start: c.start, end: c.end }];
    })
    .sort((a, b) => a.start - b.start);
  for (const [i, first] of spans.entries())
    for (const second of spans.slice(i + 1))
      if (second.start < first.end - CLOCK_EPSILON)
        return Result.fail(
          CardsOverlap.make({
            scene: p.spec.id,
            first: first.cue,
            second: second.cue,
            from: first.start,
            to: first.end,
            at: second.start,
          }),
        );
  return Result.succeed(cues);
};

const cardsHold = (
  p: Placed<SceneSpec>,
  next: Placed<SceneSpec> | undefined,
  cues: ReadonlyMap<string, ResolvedCue>,
): Result.Result<ReadonlyMap<string, ResolvedCue>, FloodInTransition | CardsOverlap> =>
  Result.flatMap(cardsOverlap(p, cues), (held) => floodInTransition(p, next, held));

export const createFilm = (spec: FilmSpec): Film => {
  const width = spec.width ?? 1920;
  const height = spec.height ?? 1080;
  const fps = spec.fps;
  const placed = Result.getOrThrow(layout(spec.scenes, spec.timings, fps));
  const duration = filmEnd(placed);
  const allRecorded = everyTakeRecorded(placed);
  const finish = finishOf(spec.finish);
  const drifts = new Map<string, Drift | 0>(
    placed.map((p) => [
      p.spec.id,
      p.spec.drift === undefined ? DRIFT : Schema.decodeSync(SceneDrift)(p.spec.drift),
    ]),
  );
  const captions = spec.captions === undefined ? undefined : captionOf(spec.captions);
  const short = shortOf(spec.short, spec.shade);
  const cards = new Map<string, ReadonlyArray<SetCard>>();
  for (const p of placed) {
    const declared = p.spec.cards ?? [];
    if (declared.length === 0) continue;
    const set = declared.map((spec): SetCard => {
      const words = cardWords(p.spec.id, p.voice, p.speechStart, spec);
      if (Result.isFailure(words)) throw new Error(words.failure);
      return { spec, words: words.success };
    });
    cards.set(p.spec.id, set);
    const held = cardsHold(p, placed[p.index + 1], p.cues);
    if (Result.isFailure(held)) throw new Error(held.failure.message);
  }

  let assets:
    | {
        paper: HTMLCanvasElement;
        grain: Grain;
        vignette: HTMLCanvasElement;
        a: Offscreen;
        b: Offscreen;
        bloom: BloomSheets | undefined;
      }
    | undefined;
  const getAssets = () =>
    (assets ??= {
      paper: makePaper(width, height, spec.paper),
      grain: makeGrain(finish.grainSize, finish.grainTiles, spec.paper.seed + 99, width, height),
      vignette: makeVignette(width, height, spec.shade, finish.vignette),
      a: offscreen(width, height),
      b: offscreen(width, height),
      bloom: finish.bloom === undefined ? undefined : makeBloom(width, height),
    });
  const graded = finish.grade === undefined ? undefined : gradeTables(finish.grade);

  const lights = new Map<string, HTMLCanvasElement>();
  const lightSheet = (light: Light) => {
    const edge = light.edge ?? light.color;
    const key = `${light.color} ${edge}`;
    const have = lights.get(key);
    if (have !== undefined) return have;
    return keepAtMost(lights, key, makeLight(width, height, light.color, edge), SHEETS_KEPT);
  };
  const lightUp = (ctx: CanvasRenderingContext2D, light: Light) => {
    const amount = clamp(light.amount ?? 1);
    if (amount > 0) shadeBy(ctx, lightSheet(light), amount);
  };
  const litVignettes = new Map<string, HTMLCanvasElement>();
  const litVignette = (light: Light, amount: number) => {
    const key = `${light.color} ${light.edge ?? light.color} ${amount}`;
    const have = litVignettes.get(key);
    if (have !== undefined) return have;
    const made = makeProduct(width, height, lightSheet(light), amount, getAssets().vignette);
    return keepAtMost(litVignettes, key, made, SHEETS_KEPT);
  };
  const lightAndVignette = (
    ctx: CanvasRenderingContext2D,
    light: Light | undefined,
    fixed: boolean,
  ) => {
    const amount = clamp(light?.amount ?? 1);
    const share = vignetteOf(light);
    if (light === undefined || amount <= 0) vignetteAt(ctx, share);
    else if (fixed && share === 1) shadeBy(ctx, litVignette(light, amount));
    else {
      lightUp(ctx, light);
      vignetteAt(ctx, share);
    }
  };

  const vignetteAt = (ctx: CanvasRenderingContext2D, share: number) => {
    if (share > 0) shadeBy(ctx, getAssets().vignette, share);
  };

  const transitionVignette = (
    ctx: CanvasRenderingContext2D,
    pan: boolean,
    p: number,
    from: number,
    to: number,
    outX: number,
    inX: number,
  ) => {
    if (from === to) return vignetteAt(ctx, from);
    if (!pan) return vignetteAt(ctx, from + (to - from) * p);
    for (const [x, share] of [
      [outX, from],
      [inX, to],
    ] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, width, height);
      ctx.clip();
      vignetteAt(ctx, share);
      ctx.restore();
    }
  };

  const sceneAt = (T: number): Placed<SceneSpec> => {
    const p = placed[sceneIndexAt(placed, T)];
    if (p === undefined) throw new Error('film has no scenes');
    return p;
  };

  const drawnScenes = new Map<(f: never) => void, Array<Placed<SceneSpec>>>();
  for (const q of placed) {
    const same = drawnScenes.get(q.spec.draw);
    if (same === undefined) drawnScenes.set(q.spec.draw, [q]);
    else same.push(q);
  }

  const drawnBy = (draw: (f: never) => void, by: string) => {
    const found = drawnScenes.get(draw) ?? [];
    const one = found[0];
    if (one === undefined || found.length > 1)
      throw new Error(
        `scene ${by}: f.knobsOf and f.handsOf take the drawing of one scene; ${found.length} scenes draw it (${found.map((q) => q.spec.id).join(', ')})`,
      );
    return one;
  };

  const declaredRigs = [
    ...new Set(
      placed.flatMap((q) =>
        Object.values(q.spec.rigs ?? {}).filter((r): r is RivePropSpec => r !== undefined),
      ),
    ),
  ];
  const none: ReadonlyMap<RivePropSpec, LoadedRig> = new Map();
  let stands: ReadonlyArray<ReadonlyMap<RivePropSpec, LoadedRig>> = [];
  let standing = none;
  const rigs: FilmRigs = {
    declared: declaredRigs,
    stand: (loaded) => {
      stands = [...stands, loaded];
      standing = loaded;
      return () => {
        stands = stands.filter((up) => up !== loaded);
        standing = stands.at(-1) ?? none;
      };
    },
  };

  const declaredPuppets = [
    ...new Set(
      placed.flatMap((q) =>
        Object.values(q.spec.puppets ?? {}).filter((r): r is PuppetSpec => r !== undefined),
      ),
    ),
  ];
  const noPuppets: ReadonlyMap<PuppetSpec, LoadedPuppet> = new Map();
  let puppetStands: ReadonlyArray<ReadonlyMap<PuppetSpec, LoadedPuppet>> = [];
  let puppetsStanding = noPuppets;
  const puppets: FilmPuppets = {
    declared: declaredPuppets,
    stand: (loaded) => {
      puppetStands = [...puppetStands, loaded];
      puppetsStanding = loaded;
      return () => {
        puppetStands = puppetStands.filter((up) => up !== loaded);
        puppetsStanding = puppetStands.at(-1) ?? noPuppets;
      };
    },
  };

  const declaredPaintings = [
    ...new Set(placed.flatMap((q) => Object.values(q.spec.paintings ?? {}))),
  ];
  const noPaintings: ReadonlyMap<PaintingSpec, LoadedPainting> = new Map();
  let paintingStands: ReadonlyArray<ReadonlyMap<PaintingSpec, LoadedPainting>> = [];
  let paintingsStanding = noPaintings;
  const paintings: FilmPaintings = {
    declared: declaredPaintings,
    stand: (loaded) => {
      paintingStands = [...paintingStands, loaded];
      paintingsStanding = loaded;
      return () => {
        paintingStands = paintingStands.filter((up) => up !== loaded);
        paintingsStanding = paintingStands.at(-1) ?? noPaintings;
      };
    },
  };

  const captionsOf =
    captions === undefined ? undefined : new Map(placed.map((p) => [p, sceneCaptions(p)]));

  const localWords = new Map(
    placed.map((p) => [
      p,
      p.voice.words.map((w) => ({
        ...w,
        start: w.start + p.speechStart,
        end: w.end + p.speechStart,
      })),
    ]),
  );

  let hearing: ClockReads | undefined;

  const frameOf = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    reads: Reads | undefined,
    unframed: number[],
  ): Frame => {
    const t = beatTime(p, T);
    const words = localWords.get(p) ?? [];
    const hears = hearing === undefined ? undefined : hearsOf(hearing, p.spec.id);
    const frame: Frame = {
      ctx,
      w: width,
      h: height,
      t,
      dur: p.dur,
      T,
      boil,
      speech: { start: p.speechStart, end: p.speechStart + p.voice.duration },
      mark: (name) => {
        const at = p.voice.marks.get(name);
        if (at === undefined) throw new Error(`scene ${p.spec.id} has no mark {${name}}`);
        hears?.marks.add(name);
        return p.speechStart + at;
      },
      cue: (name) => {
        const c = p.cues.get(name);
        if (c === undefined) throw new Error(`scene ${p.spec.id} has no cue "${name}"`);
        hears?.cues.add(name);
        return c;
      },
      at: (name) => cueProgress(frame.cue(name), t),
      keys: (name, frames) => cueKeys(frame.cue(name), t, frames),
      stagger: (name, i, n) => staggerProgress(frame.cue(name), t, i, n),
      staggerAt: (name, at) => staggerAt(frame.cue(name), t, at),
      knob: (name) => {
        const k = p.knobs.get(name);
        if (k === undefined) throw new Error(`scene ${p.spec.id} has no knob "${name}"`);
        if (reads?.direct === true && !insideCamera(ctx)) unframed.push(reads.list.length);
        reads?.list.push({
          scene: p.spec.id,
          name,
          value: k,
          transform: reads.direct ? affineOf(ctx.getTransform()) : undefined,
        });
        return k;
      },
      rive: (name, pose) => {
        const spec = p.spec.rigs?.[name];
        if (spec === undefined) throw new Error(`scene ${p.spec.id} has no rig "${name}"`);
        const rig = standing.get(spec);
        if (rig === undefined)
          throw new Error(
            `scene ${p.spec.id}: rig "${name}" (${spec.key}) is not loaded: a film's rigs load with it, before its first frame (loadRigs)`,
          );
        const why = drawRig(ctx, spec, rig, pose);
        if (why !== undefined) throw new Error(`scene ${p.spec.id}: ${why}`);
      },
      puppet: (name, pose, look, dress) => {
        const spec = p.spec.puppets?.[name];
        if (spec === undefined) throw new Error(`scene ${p.spec.id} has no puppet "${name}"`);
        const loaded = puppetsStanding.get(spec);
        if (loaded === undefined)
          throw new Error(
            `scene ${p.spec.id}: puppet "${name}" (${spec.key}) is not loaded: a film's puppets load with it, before its first frame (loadPuppets)`,
          );
        const why = drawPuppet(ctx, spec, loaded, pose, look, dress);
        if (why !== undefined) throw new Error(`scene ${p.spec.id}: ${why}`);
      },
      painting: (name) => {
        const spec = p.spec.paintings?.[name];
        if (spec === undefined) throw new Error(`scene ${p.spec.id} has no painting "${name}"`);
        const loaded = paintingsStanding.get(spec);
        if (loaded === undefined)
          throw new Error(
            `scene ${p.spec.id}: painting ${spec.key} is not loaded (loadPaintings): a film's paintings load with it, before its first frame`,
          );
        drawPainting(ctx, spec, loaded, probeOf(ctx));
      },
      hand: (key) => sceneHand(p.spec.id, key, boil),
      handsOf: (of) => {
        const id = drawnBy(of.draw, p.spec.id).spec.id;
        return (key) => sceneHand(id, key, boil);
      },
      knobsOf: <K extends Knobs>(of: KnobsOwner<K>) => {
        const q = drawnBy(of.draw, p.spec.id);
        return knobReader<K>(q.knobs, q.spec.id);
      },
      words,
      spoken: (from, to) => {
        const a = frame.mark(from);
        const b = to === undefined ? p.speechStart + p.voice.duration : frame.mark(to);
        const inside = words.filter((w) => heardAtOrAfter(w, a) && w.start < justBefore(b));
        if (inside.length === 0) return t >= b ? 1 : 0;
        let heard = 0;
        for (const w of inside) heard += clamp((t - w.start) / Math.max(0.05, w.end - w.start));
        return heard / inside.length;
      },
    };
    return frame;
  };

  const drawScene = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    reads: Reads | undefined,
  ) => {
    const unframed: number[] = [];
    const frameReads = (list: KnobRead[], inside: DOMMatrix, aimed: DOMMatrix) => {
      for (const i of unframed) {
        const read = list[i];
        if (read !== undefined)
          list[i] = { ...read, framed: affineOf(inside), aimed: affineOf(aimed) };
      }
      unframed.length = 0;
    };
    const frame = frameOf(ctx, p, T, boil, reads, unframed);
    drawnFrame = frame;
    drawnBox = undefined;
    ctx.save();
    const heard =
      reads?.direct === true
        ? (inside: DOMMatrix, aimed: DOMMatrix) => frameReads(reads.list, inside, aimed)
        : undefined;
    const shot = hearingCameras(ctx, heard, breath, () => {
      drawnBox = p.spec.draw(frame);
    });
    ctx.restore();
    const light = p.spec.light;
    drawnFixed = !Predicate.isFunction(light);
    drawnLight = Predicate.isFunction(light) ? light(frame) : light;
    return shot;
  };

  let drawnLight: Light | undefined;
  let drawnFixed = true;
  let drawnFrame: Frame | undefined;
  let drawnBox: Box | void;

  const breath: BreathNow = { through: 0, drift: DRIFT, outer: false, width, height };
  const still: BreathNow = { through: 0, drift: 0, outer: false, width, height };

  const cueOf = (p: Placed<SceneSpec>, name: string) => {
    const c = p.cues.get(name);
    if (c === undefined) throw new Error(`scene ${p.spec.id} has no cue "${name}"`);
    return c;
  };

  const holds = (p: Placed<SceneSpec>, name: string, T: number) => {
    const c = cueOf(p, name);
    const t = beatTime(p, T);
    return t >= c.start && t < c.end;
  };

  const cardsOf = (p: Placed<SceneSpec>): ReadonlyArray<SetCard> => cards.get(p.spec.id) ?? [];

  const carded = (p: Placed<SceneSpec>, T: number): SetCard | undefined =>
    cardsOf(p).find((card) => holds(p, card.spec.cue, T));

  const drawCard = (
    ctx: CanvasRenderingContext2D,
    card: SetCard,
    f: Frame,
    probe: Probe | undefined,
  ) => {
    ctx.save();
    probing(ctx, probe, () =>
      hearingCameras(ctx, undefined, still, () => card.spec.draw(f, card.words)),
    );
    ctx.restore();
  };

  const cardFrame = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    card: SetCard,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
  ) => {
    ctx.drawImage(getAssets().paper, 0, 0);
    drawCard(ctx, card, frameOf(ctx, p, T, boil, reads, []), probe);
  };

  const cardToEnd = (p: Placed<SceneSpec>): SetCard | undefined => {
    const ending = cardsOf(p).flatMap((card) => {
      const c = p.cues.get(card.spec.cue);
      return c === undefined ? [] : [{ card, end: c.end }];
    });
    const last = ending.reduce<(typeof ending)[number] | undefined>(
      (best, e) => (best === undefined || e.end > best.end ? e : best),
      undefined,
    );
    return last !== undefined && p.dur - last.end <= CLOCK_EPSILON ? last.card : undefined;
  };

  const cardLayer = (
    target: Offscreen,
    p: Placed<SceneSpec>,
    card: SetCard,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
  ) => {
    target.ctx.setTransform(1, 0, 0, 1, 0, 0);
    target.ctx.globalAlpha = 1;
    target.ctx.globalCompositeOperation = 'source-over';
    cardFrame(target.ctx, p, card, T, boil, probe, reads);
    return target.c;
  };

  const floodOver = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
  ) => {
    const f = drawnFrame;
    if (f === undefined) return;
    const card = cardsOf(p).find(
      (c) => c.spec.flood !== undefined && holds(p, c.spec.flood.cue, T),
    );
    const flood = card?.spec.flood;
    if (card === undefined || flood === undefined) return;
    const from = drawnBox;
    if (from === undefined)
      throw new Error(
        `scene ${p.spec.id}: its card floods in over "${flood.cue}", but its draw returned no box to flood from`,
      );
    const frame = ctx.getTransform();
    const at = cueProgress(cueOf(p, flood.cue), beatTime(p, T));
    const box = floodBox(from, ctx.canvas.width, ctx.canvas.height, at);
    const mask = flood.mask;
    if (mask !== undefined) {
      const { b } = getAssets();
      b.ctx.setTransform(1, 0, 0, 1, 0, 0);
      b.ctx.globalAlpha = 1;
      b.ctx.globalCompositeOperation = 'source-over';
      b.ctx.clearRect(0, 0, width, height);
      b.ctx.setTransform(frame);
      drawCard(b.ctx, card, frameOf(b.ctx, p, T, boil, reads, []), probe);
      b.ctx.setTransform(1, 0, 0, 1, 0, 0);
      b.ctx.globalCompositeOperation = 'destination-in';
      mask(b.ctx, box, at, f);
      b.ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(b.c, 0, 0);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.setTransform(frame);
    drawCard(ctx, card, f, probe);
    ctx.restore();
  };

  const unshot = new Set<string>();

  const sheet = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
  ) => {
    const { paper } = getAssets();
    const id = p.spec.id;
    breath.through = p.dur > 0 ? beatTime(p, T) / p.dur : 0;
    breath.drift = drifts.get(id) ?? DRIFT;
    const moving = p.spec.storyboard !== true && breathes(breath);
    breath.outer = moving && unshot.has(id);
    const sink = probe?.sink;
    markSink(sink);
    const read = reads?.list.length ?? 0;
    const unhear = heardSince(hearing, id);
    ctx.drawImage(paper, 0, 0);
    let shot = false;
    probing(ctx, probe, () => {
      shot = drawScene(ctx, p, T, boil, reads);
    });
    if (moving && shot === breath.outer) {
      rewindSink(sink);
      if (reads !== undefined) reads.list.length = read;
      unhear();
      breath.outer = !shot;
      ctx.drawImage(paper, 0, 0);
      probing(ctx, probe, () => drawScene(ctx, p, T, boil, reads));
    }
    if (moving && shot) unshot.delete(id);
    else if (moving) unshot.add(id);
  };

  const layer = (
    target: Offscreen,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
  ) => {
    target.ctx.setTransform(1, 0, 0, 1, 0, 0);
    target.ctx.globalAlpha = 1;
    target.ctx.globalCompositeOperation = 'source-over';
    sheet(target.ctx, p, T, boil, probe, reads);
    if (drawnLight !== undefined) lightUp(target.ctx, drawnLight);
    return target.c;
  };

  const finishFrame = (ctx: CanvasRenderingContext2D, boil: number) => {
    const sheets = getAssets().bloom;
    if (finish.bloom !== undefined && sheets !== undefined)
      bloom(ctx, sheets, finish.bloom, width, height);
    if (graded !== undefined) grade(ctx, graded, width, height);
    grain(ctx, getAssets().grain, boil, width, height, finish.grain);
  };

  const captionOver = (
    ctx: CanvasRenderingContext2D,
    cur: Placed<SceneSpec>,
    local: number,
    voice: Probe | undefined,
  ) => {
    if (captions === undefined) return;
    const style = captions;
    probing(ctx, voice === undefined ? undefined : { ...voice, caption: true }, () =>
      caption(ctx, captionsOf?.get(cur) ?? [], local - cur.speechStart, width, height, style),
    );
  };

  const composite = (
    ctx: CanvasRenderingContext2D,
    enter: Exclude<Transition, { readonly kind: 'cut' }>,
    out: HTMLCanvasElement,
    inn: HTMLCanvasElement,
    p: number,
    dx: number,
    dir: number,
  ) => {
    switch (enter.kind) {
      case 'fade':
        ctx.drawImage(out, 0, 0);
        ctx.globalAlpha = p;
        ctx.drawImage(inn, 0, 0);
        break;
      case 'pan':
        ctx.drawImage(out, dx, 0);
        ctx.drawImage(inn, dx + dir * width, 0);
        break;
      case 'ink':
        ctx.drawImage(out, 0, 0);
        inkWipe(ctx, inn, p, width, height, enter.color ?? spec.shade);
        break;
    }
  };

  const render = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions = {}) => {
    const { a, b } = getAssets();
    const boil = boilTick(T);
    const cur = sceneAt(T);
    const prev = placed[cur.index - 1];
    const enter = cur.spec.enter;
    const tr = transitionDur(enter);
    const local = beatTime(cur, T);
    const sink = opts.probe;
    const knobs = opts.knobs;
    hearing = opts.clock;
    const reads = (direct: boolean): Reads | undefined =>
      knobs === undefined ? undefined : { list: knobs, direct };
    const probe = (p: Placed<SceneSpec>, dx: number, alpha: number): Probe | undefined =>
      sink === undefined ? undefined : { sink, scene: p.spec.id, dx, alpha };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const shown = carded(cur, T);
    if (shown !== undefined) {
      cardFrame(ctx, cur, shown, T, boil, probe(cur, 0, 1), reads(true));
    } else if (prev === undefined || enter === undefined || enter.kind === 'cut' || local >= tr) {
      sheet(ctx, cur, T, boil, probe(cur, 0, 1), reads(true));
      lightAndVignette(ctx, drawnLight, drawnFixed);
      floodOver(ctx, cur, T, boil, probe(cur, 0, 1), reads(true));
    } else {
      const p = ease.inOutCubic(clamp(local / tr));
      const dir = enter.kind === 'pan' ? (enter.dir ?? 1) : 1;
      const dx = enter.kind === 'pan' ? -dir * p * width : 0;
      const fading = enter.kind === 'pan' ? 0 : 1;
      const leaving = cardToEnd(prev);
      const outProbe = probe(prev, dx, 1 - fading * p);
      const out =
        leaving === undefined
          ? layer(a, prev, T, boil, outProbe, reads(false))
          : cardLayer(a, prev, leaving, T, boil, outProbe, reads(false));
      const from = leaving === undefined ? vignetteOf(drawnLight) : 0;
      const inn = layer(
        b,
        cur,
        T,
        boil,
        probe(cur, enter.kind === 'pan' ? dx + dir * width : 0, 1 - fading * (1 - p)),
        reads(false),
      );
      composite(ctx, enter, out, inn, p, dx, dir);
      const to = vignetteOf(drawnLight);
      transitionVignette(ctx, enter.kind === 'pan', p, from, to, dx, dx + dir * width);
    }

    finishFrame(ctx, boil);
    if (opts.captions === true && shown === undefined)
      captionOver(ctx, cur, local, probe(cur, 0, 1));
    ctx.restore();
  };

  return {
    title: spec.title,
    width,
    height,
    fps,
    duration,
    placed,
    audio: allRecorded ? spec.audio : undefined,
    sound: spec.sound,
    palette: spec.palette ?? {},
    allRecorded,
    look: { paper: spec.paper, shade: spec.shade, finish, short, card: spec.card },
    sceneAt,
    cardAt: (T) => carded(sceneAt(T), T) !== undefined,
    render,
    rigs,
    puppets,
    paintings,
  };
};

const inkWipe = (
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  p: number,
  w: number,
  h: number,
  color: string,
) => {
  const span = w + h * 0.6 + 400;
  const edge = -200 + p * span;
  const ragged = (y: number, off: number) =>
    edge - (y / h) * h * 0.6 + off + Math.sin(y * 0.021 + off) * 18 + Math.sin(y * 0.063) * 9;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  for (let y = -10; y <= h + 10; y += 20) ctx.lineTo(ragged(y, 0), y);
  ctx.lineTo(-10, h + 10);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9 * Math.sin(Math.PI * p);
  ctx.beginPath();
  for (let y = -10; y <= h + 10; y += 20) ctx.lineTo(ragged(y, 0), y);
  for (let y = h + 10; y >= -10; y -= 20) ctx.lineTo(ragged(y, 140 + Math.sin(y * 0.013) * 40), y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const caption = (
  ctx: CanvasRenderingContext2D,
  cues: ReadonlyArray<CaptionCue>,
  t: number,
  w: number,
  h: number,
  style: Required<CaptionStyle>,
) => {
  const line = cues.find((c) => t >= c.start && t < c.end);
  if (line === undefined) return;
  const text = line.text;
  ctx.save();
  ctx.font = style.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const y = h - style.bottom;
  const left = w / 2 - tw / 2 - style.platePadding;
  const top = y - style.plateHeight / 2;
  const pw = tw + 2 * style.platePadding;
  ctx.globalAlpha = style.plateOpacity;
  ctx.fillStyle = style.plate;
  ctx.beginPath();
  ctx.roundRect(left, top, pw, style.plateHeight, style.plateRadius);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = style.color;
  ctx.fillText(text, w / 2, y + 1);
  const probe = probeOf(ctx);
  if (probe !== undefined) {
    recordPlate(ctx, probe, left, top, pw, style.plateHeight, style.plateOpacity);
    recordText(ctx, probe, text, left, top, pw, style.plateHeight, style.plateOpacity);
  }
  ctx.restore();
};
