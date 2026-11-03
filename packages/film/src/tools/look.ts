import { Array as Arr, Option, Order, Result } from 'effect';
import { type Placed, filmEnd } from '../core/layout.ts';
import { CLOCK_EPSILON, frameAtOrAfter, secondsAt } from '../core/time.ts';
import type { Stretch } from '../core/acts.ts';
import { type AddressError, resolveAddress } from '../core/address.ts';
import type { Act } from '../core/schema.ts';
import type { FaceMark, GripShares, HandMark } from '../core/export-handle.ts';
import { type FrameSize, seenFace } from './check.ts';
import { ChaptersInvalid } from './errors.ts';
import {
  ColourScript,
  FaceSmall,
  HandFar,
  HandHidden,
  HandJump,
  HeldShare,
  type LookFinding,
} from './findings.ts';
import type { LoadedFilm } from './film-repo.ts';

export const THUMB_W = 64;
export const THUMB_H = 36;
export const THUMB_BYTES = THUMB_W * THUMB_H * 4;
export const LOOK_STEP = 0.5;
const HELD_DIFF = 2;
export const HELD_MAX = 0.4;
const DARK_LUMA = 60;
export const FACE_SHARE = 1 / 3;
const HUES = 5;
const BIN_BITS = 3;
const BINS = 1 << (3 * BIN_BITS);

export interface LookSample {
  readonly scene: string;
  readonly frame: number;
  readonly T: number;
}

export interface Drawn {
  readonly thumb: Uint8Array;
  readonly faces: ReadonlyArray<FaceMark>;
  readonly hands: ReadonlyArray<HandMark>;
}

export const lookSamples = (
  placed: ReadonlyArray<Placed>,
  fps: number,
  frames: number,
): ReadonlyArray<LookSample> =>
  placed.flatMap((p) =>
    Arr.makeBy(Math.max(1, frameAtOrAfter(p.dur / LOOK_STEP, 1)), (k) => {
      const T = p.start + k * LOOK_STEP;
      return { scene: p.spec.id, frame: Math.min(frames - 1, Math.round(T * fps)), T };
    }),
  );

interface Light {
  readonly frames: number;
  readonly luma: number;
  readonly dark: number;
  readonly saturation: number;
  readonly bins: Float64Array;
}

type Sum = { -readonly [K in keyof Light]: Light[K] };

const emptyLight = (): Sum => ({
  frames: 0,
  luma: 0,
  dark: 0,
  saturation: 0,
  bins: new Float64Array(BINS * 4),
});

const addLight = (a: Light, b: Light): Light => {
  const bins = new Float64Array(BINS * 4);
  for (let i = 0; i < bins.length; i++) bins[i] = (a.bins[i] ?? 0) + (b.bins[i] ?? 0);
  return {
    frames: a.frames + b.frames,
    luma: a.luma + b.luma,
    dark: a.dark + b.dark,
    saturation: a.saturation + b.saturation,
    bins,
  };
};

const binOf = (r: number, g: number, b: number) =>
  ((r >> (8 - BIN_BITS)) << (2 * BIN_BITS)) |
  ((g >> (8 - BIN_BITS)) << BIN_BITS) |
  (b >> (8 - BIN_BITS));

const readThumb = (thumb: Uint8Array, into: Sum): Float32Array => {
  const px = THUMB_W * THUMB_H;
  const grey = new Float32Array(px);
  let luma = 0;
  let saturation = 0;
  for (let i = 0; i < px; i++) {
    const r = thumb[i * 4] ?? 0;
    const g = thumb[i * 4 + 1] ?? 0;
    const b = thumb[i * 4 + 2] ?? 0;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    grey[i] = y;
    luma += y;
    const hi = Math.max(r, g, b);
    saturation += (hi - Math.min(r, g, b)) / Math.max(1, hi);
    const bin = binOf(r, g, b) * 4;
    into.bins[bin] = (into.bins[bin] ?? 0) + 1;
    into.bins[bin + 1] = (into.bins[bin + 1] ?? 0) + r;
    into.bins[bin + 2] = (into.bins[bin + 2] ?? 0) + g;
    into.bins[bin + 3] = (into.bins[bin + 3] ?? 0) + b;
  }
  into.frames += 1;
  into.luma += luma / px;
  into.saturation += saturation / px;
  into.dark += Number(luma / px < DARK_LUMA);
  return grey;
};

const greyDiff = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / Math.max(1, a.length);
};

interface SceneLook {
  readonly scene: string;
  readonly start: number;
  readonly dur: number;
  readonly judged: boolean;
  readonly light: Light;
  readonly seconds: number;
  readonly held: number;
  readonly heldFrom: number;
  readonly heldTo: number;
  readonly face: number;
}

export interface Looked {
  readonly looks: ReadonlyArray<SceneLook>;
  readonly height: number;
  readonly jumps: ReadonlyArray<HandJump>;
  readonly far: ReadonlyArray<HandFar>;
  readonly hidden: ReadonlyArray<HandHidden>;
}

export const heldSeconds = (greys: ReadonlyArray<Float32Array>): ReadonlyArray<boolean> => {
  const steps = Arr.makeBy(Math.max(0, greys.length - 1), (k) =>
    greyDiff(greys[k] ?? new Float32Array(), greys[k + 1] ?? new Float32Array()),
  );
  return Arr.makeBy(
    Math.floor(steps.length / 2),
    (s) => Math.min(steps[2 * s] ?? Infinity, steps[2 * s + 1] ?? Infinity) < HELD_DIFF,
  );
};

const longestRun = (held: ReadonlyArray<boolean>): readonly [number, number] => {
  let best: readonly [number, number] = [0, 0];
  let from = -1;
  for (let i = 0; i <= held.length; i++) {
    const still = i < held.length && held[i] === true;
    if (still && from < 0) from = i;
    if (!still && from >= 0) {
      if (i - from > best[1] - best[0]) best = [from, i];
      from = -1;
    }
  }
  return best;
};

export const sceneLooks = (
  placed: ReadonlyArray<Placed>,
  samples: ReadonlyArray<LookSample>,
  drawn: ReadonlyArray<Drawn>,
  frame: FrameSize,
): ReadonlyArray<SceneLook> => {
  const pairs = Arr.zip(samples, drawn);
  return placed.map((p) => {
    const light = emptyLight();
    const mine = pairs.filter(([s]) => s.scene === p.spec.id).map(([, d]) => d);
    const greys = mine.map((d) => readThumb(d.thumb, light));
    const face = Math.max(
      0,
      ...mine.flatMap((d) =>
        d.faces.filter((f) => seenFace(f, p.spec.id, frame)).map((f) => f.size),
      ),
    );
    const held = heldSeconds(greys);
    const [a, b] = longestRun(held);
    return {
      scene: p.spec.id,
      start: p.start,
      dur: p.dur,
      judged: p.voice.duration > 0 && p.spec.storyboard !== true,
      light,
      seconds: held.length,
      held: held.filter(Boolean).length,
      heldFrom: p.start + a,
      heldTo: p.start + b,
      face,
    };
  });
};

export const heldShares = (looks: ReadonlyArray<SceneLook>): ReadonlyArray<HeldShare> =>
  looks
    .filter((l) => l.judged && l.seconds > 0 && l.held / l.seconds > HELD_MAX)
    .map((l) =>
      HeldShare.make({
        scene: l.scene,
        share: l.held / l.seconds,
        max: HELD_MAX,
        from: l.heldFrom,
        to: l.heldTo,
      }),
    );

export const smallFaces = (
  looks: ReadonlyArray<SceneLook>,
  height: number,
): ReadonlyArray<FaceSmall> =>
  looks
    .filter((l) => l.judged && l.face < height * FACE_SHARE)
    .map((l) => FaceSmall.make({ scene: l.scene, largest: l.face, min: height * FACE_SHARE }));

export const HAND_JUMP = 1.5;
export const SIZE_JUMP = 0.25;
export const GRIP_JUMP = 0.5;
const HAND_SEEN = 0.5;
const HAND_AT_WORK = 0.9;
const SHOULDER_MATCH = 24;

export interface HandFrame {
  readonly scene: string;
  readonly frame: number;
  readonly T: number;
  readonly hands: ReadonlyArray<HandMark>;
}

export const handSpans = (
  frames: ReadonlyArray<HandFrame>,
  fps: number,
): ReadonlyArray<LookSample> => {
  const drawn = new Map<number, LookSample>();
  for (const [a, b] of pairs(frames)) {
    if (a.scene !== b.scene || !handsTravel(ownHands(a), ownHands(b))) continue;
    for (let frame = a.frame; frame <= b.frame; frame++)
      if (!drawn.has(frame)) drawn.set(frame, { scene: a.scene, frame, T: secondsAt(frame, fps) });
  }
  return Arr.sort(
    [...drawn.values()],
    Order.mapInput(Order.Number, (s: LookSample) => s.frame),
  );
};

const gripMoved = (a: GripShares, b: GripShares) =>
  (Math.abs(b.open - a.open) +
    Math.abs(b.hold - a.hold) +
    Math.abs(b.point - a.point) +
    Math.abs(b.palm - a.palm)) /
  2;

interface Jump {
  readonly what: HandJump['what'];
  readonly by: number;
  readonly max: number;
}

const jumpOf = (was: HandMark, now: HandMark): Option.Option<Jump> => {
  if (was.size <= 0 || now.size <= 0) return Option.none();
  const wasUnit = Math.max(was.radius, was.size);
  const nowUnit = Math.max(now.radius, now.size);
  const length = (was.size / wasUnit + now.size / nowUnit) / 2;
  const moved =
    Math.hypot(
      (now.x - now.sx) / nowUnit - (was.x - was.sx) / wasUnit,
      (now.y - now.sy) / nowUnit - (was.y - was.sy) / wasUnit,
    ) / length;
  const was1 = was.size / wasUnit;
  const now1 = now.size / nowUnit;
  const grew = Math.abs(now1 - was1) / Math.max(was1, now1);
  const swapped = Math.min(was.formed, now.formed) * gripMoved(was.grip, now.grip);
  const jumps: ReadonlyArray<Jump> = [
    { what: 'place', by: moved, max: HAND_JUMP },
    { what: 'size', by: grew, max: SIZE_JUMP },
    { what: 'grip', by: swapped, max: GRIP_JUMP },
  ];
  return Arr.findFirst(jumps, (jump) => jump.by > jump.max);
};

export const handJumps = (frames: ReadonlyArray<HandFrame>): ReadonlyArray<HandJump> =>
  pairs(frames)
    .filter(([a, b]) => a.scene === b.scene && b.frame === a.frame + 1)
    .flatMap(([a, b]) =>
      ownHands(a).flatMap((was) =>
        Option.toArray(
          Option.filter(
            sameHand(was, ownHands(b)),
            (now) => Math.max(was.alpha, now.alpha) >= HAND_SEEN,
          ),
        ).flatMap((now) =>
          Option.toArray(jumpOf(was, now)).map((jump) =>
            HandJump.make({ scene: b.scene, side: now.side, T: b.T, ...jump }),
          ),
        ),
      ),
    );

const perHand = (frames: ReadonlyArray<HandFrame>, pick: (h: HandMark) => Option.Option<number>) =>
  Object.values(
    Arr.groupBy(
      frames.flatMap((f) =>
        ownHands(f).flatMap((h) =>
          Option.toArray(pick(h)).map((by) => ({ scene: f.scene, side: h.side, T: f.T, by })),
        ),
      ),
      (s) => `${s.scene}\u0000${s.side}`,
    ),
  ).map((group) => ({
    scene: group[0].scene,
    side: group[0].side,
    from: Math.min(...group.map((s) => s.T)),
    to: Math.max(...group.map((s) => s.T)),
    worst: Math.max(...group.map((s) => s.by)),
    frames: group.length,
  }));

const pastReach = (h: HandMark): Option.Option<number> =>
  Option.filter(
    Option.some(Math.hypot(h.tx - h.sx, h.ty - h.sy) / h.radius),
    (out) => h.reach > 0 && h.alpha >= HAND_SEEN && h.radius > 0 && out > 1,
  );

export const farHands = (frames: ReadonlyArray<HandFrame>): ReadonlyArray<HandFar> =>
  perHand(frames, pastReach).map((g) => HandFar.make(g));

const hidden = (h: HandMark): Option.Option<number> =>
  Option.filter(
    Option.some(1),
    () => h.reach >= HAND_AT_WORK && h.alpha >= HAND_SEEN && h.inside && !h.over,
  );

export const hiddenHands = (frames: ReadonlyArray<HandFrame>): ReadonlyArray<HandHidden> =>
  perHand(frames, hidden).map(({ scene, side, from, to, frames }) =>
    HandHidden.make({ scene, side, from, to, frames }),
  );

const pairs = <A>(xs: ReadonlyArray<A>): ReadonlyArray<readonly [A, A]> => Arr.zip(xs, xs.slice(1));

const ownHands = (f: HandFrame) => f.hands.filter((h) => h.scene === f.scene);

const sameHand = (h: HandMark, next: ReadonlyArray<HandMark>): Option.Option<HandMark> =>
  Arr.head(
    Arr.sort(
      next
        .map((n) => [n, Math.hypot(n.sx - h.sx, n.sy - h.sy)] as const)
        .filter(([n, d]) => n.side === h.side && d <= SHOULDER_MATCH),
      Order.mapInput(Order.Number, ([, d]: readonly [HandMark, number]) => d),
    ).map(([n]) => n),
  );

const REACH_HELD = 1e-3;
const TARGET_HELD = 0.1;

const worksOn = (h: HandMark, n: HandMark) =>
  Math.abs(n.reach - h.reach) > REACH_HELD ||
  (Math.max(h.reach, n.reach) > 0 &&
    (Math.hypot(n.tx - n.sx - (h.tx - h.sx), n.ty - n.sy - (h.ty - h.sy)) >
      TARGET_HELD * Math.max(h.size, n.size) ||
      gripMoved(h.grip, n.grip) > REACH_HELD));

const handsTravel = (was: ReadonlyArray<HandMark>, now: ReadonlyArray<HandMark>) =>
  was.some((h) =>
    Option.match(sameHand(h, now), {
      onNone: () => h.reach > 0,
      onSome: (n) => worksOn(h, n),
    }),
  ) || now.some((h) => h.reach > 0 && Option.isNone(sameHand(h, was)));

type ActSpan = Stretch<Act>;

const lightOf = (looks: ReadonlyArray<SceneLook>): Light =>
  looks.reduce((sum, l) => addLight(sum, l.light), emptyLight());

const within = (looks: ReadonlyArray<SceneLook>, scenes: ReadonlyArray<string>) =>
  looks.filter((l) => scenes.includes(l.scene));

const measures = (light: Light) => {
  const n = Math.max(1, light.frames);
  return { luma: light.luma / n, dark: light.dark / n, saturation: light.saturation / n };
};

const hues = (light: Light): ReadonlyArray<readonly [string, number]> => {
  let total = 0;
  const found: Array<readonly [number, number]> = [];
  for (let bin = 0; bin < BINS; bin++) {
    const n = light.bins[bin * 4] ?? 0;
    total += n;
    if (n > 0) found.push([bin, n]);
  }
  const hex = (sum: number, n: number) =>
    Math.round(sum / n)
      .toString(16)
      .padStart(2, '0');
  return found
    .sort((a, b) => b[1] - a[1])
    .slice(0, HUES)
    .map(([bin, n]) => [
      `#${hex(light.bins[bin * 4 + 1] ?? 0, n)}${hex(light.bins[bin * 4 + 2] ?? 0, n)}${hex(light.bins[bin * 4 + 3] ?? 0, n)}`,
      n / Math.max(1, total),
    ]);
};

type Target = readonly [ColourScript['measure'], readonly [number, number]];

const targetsOf = (act: Act): ReadonlyArray<Target> => {
  const targets: ReadonlyArray<Option.Option<Target>> = [
    Option.map(Option.fromNullishOr(act.luma), (range) => ['luma', range]),
    Option.map(Option.fromNullishOr(act.saturation), (range) => ['saturation', range]),
    Option.map(Option.fromNullishOr(act.dark), (max) => ['dark', [0, max]]),
  ];
  return targets.flatMap(Option.toArray);
};

export const colourScript = (
  acts: ReadonlyArray<ActSpan>,
  looks: ReadonlyArray<SceneLook>,
): ReadonlyArray<ColourScript> =>
  acts.flatMap(({ part: act, scenes }) => {
    const m = measures(lightOf(within(looks, scenes)));
    return targetsOf(act)
      .filter(([measure, [low, high]]) => m[measure] < low || m[measure] > high)
      .map(([measure, [low, high]]) =>
        ColourScript.make({ act: act.name, measure, value: m[measure], low, high }),
      );
  });

export const lookFindings = (
  looked: Looked,
  acts: ReadonlyArray<ActSpan>,
): ReadonlyArray<LookFinding> => [
  ...heldShares(looked.looks),
  ...smallFaces(looked.looks, looked.height),
  ...colourScript(acts, looked.looks),
  ...looked.jumps,
  ...looked.far,
  ...looked.hidden,
];

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

const shareOf = (part: number, whole: number) =>
  Option.match(
    Option.liftPredicate(whole, (n) => n > 0),
    {
      onNone: () => '   -',
      onSome: (n) => pct(part / n),
    },
  );

const lightLine = (light: Light) => {
  const m = measures(light);
  const colours = hues(light)
    .map(([hex, share]) => `${hex} ${Math.round(share * 100)}%`)
    .join(', ');
  return `luma=${m.luma.toFixed(0).padStart(3)} dark=${pct(m.dark)} sat=${m.saturation.toFixed(2)} hues=${colours}`;
};

const targetLine = (act: Act) => {
  const shown = targetsOf(act).map(([measure, [low, high]]) =>
    Option.match(
      Option.liftPredicate(measure, (m) => m === 'dark'),
      {
        onNone: () => `${measure} ${low}–${high}`,
        onSome: () => `dark ≤${Math.round(high * 100)}%`,
      },
    ),
  );
  return Arr.match(shown, { onEmpty: () => '', onNonEmpty: (ts) => ` target=${ts.join(', ')}` });
};

export const lookLines = (
  looks: ReadonlyArray<SceneLook>,
  acts: ReadonlyArray<ActSpan>,
): ReadonlyArray<string> => {
  const judged = looks.filter((l) => l.judged);
  const seconds = judged.reduce((n, l) => n + l.seconds, 0);
  const held = judged.reduce((n, l) => n + l.held, 0);
  return [
    ...looks.map(
      (l) =>
        `scene=${l.scene.padEnd(11)} secs=${l.dur.toFixed(1).padStart(5)} held=${shareOf(l.held, l.seconds)} longest=${(l.heldTo - l.heldFrom).toFixed(0).padStart(2)}s face=${l.face.toFixed(0).padStart(4)}px ${lightLine(l.light)}`,
    ),
    ...acts.map(
      ({ part: act, from, to, scenes }) =>
        `act="${act.name}" ${from.toFixed(1)}–${to.toFixed(1)}s ${lightLine(lightOf(within(looks, scenes)))}${targetLine(act)}`,
    ),
    `film held=${shareOf(held, seconds)} ${lightLine(lightOf(looks))}`,
  ];
};

const CHAPTERS_MIN = 3;
const CHAPTER_MIN_SECS = 10;

export const chapterTime = (secs: number): string => {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const mmss = `${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return Option.match(
    Option.liftPredicate(h, (n) => n > 0),
    {
      onNone: () => mmss,
      onSome: (hours) => `${hours}:${mmss}`,
    },
  );
};

export const chapters = (
  film: string,
  acts: ReadonlyArray<ActSpan>,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<string>, ChaptersInvalid> => {
  const named = acts.flatMap(({ part: act, from: start }) =>
    Option.toArray(Option.map(Option.fromNullishOr(act.chapter), (title) => ({ start, title }))),
  );
  const invalid = (reason: string) => Result.fail(ChaptersInvalid.make({ film, reason }));
  if (named.length < CHAPTERS_MIN)
    return invalid(`${named.length} acts name a chapter; YouTube needs ${CHAPTERS_MIN} or more`);
  const first = named[0]?.start ?? 0;
  if (first > CLOCK_EPSILON)
    return invalid(`the first chapter starts at ${chapterTime(first)}, not 00:00`);
  const end = filmEnd(placed);
  const short = Arr.findFirst(
    named,
    (c, i) => (named[i + 1]?.start ?? end) - c.start < CHAPTER_MIN_SECS,
  );
  if (Option.isSome(short))
    return invalid(`"${short.value.title}" runs under ${CHAPTER_MIN_SECS}s`);
  return Result.succeed(named.map((c) => `${chapterTime(c.start)} ${c.title}`));
};

export const filmChapters = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<string>, AddressError | ChaptersInvalid> =>
  Result.flatMap(
    resolveAddress(
      { name: film.paths.name, placed, look: film.look, shorts: film.shorts },
      { _tag: 'Film' },
    ),
    (whole) => chapters(film.paths.name, whole.acts, placed),
  );
