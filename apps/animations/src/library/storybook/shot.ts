import type { PaintingSpec } from '@manna/film/canvas';
import type { Raster } from '@manna/film/tools';
import { labOf, rng } from '@manna/film/core';
import type { Paint, Rgb } from './sheet.ts';
import { alphaAt, rgbAt, rgbOfHex } from './sheet.ts';

/** One colour mixed into a paint: the colour and how much of it, 0..1. */
export interface Mix {
  readonly colour: string;
  readonly amount: number;
}

/**
 * The shot's one light: every base paint (and any pixel the snap left as
 * drawn) leans toward `tint`, every shade paint toward `shade`, the ink
 * unchanged. It lives on the shot alone, so every figure in it is lit the same.
 */
export interface Light {
  readonly tint: Mix;
  readonly shade: Mix;
}

/** Where the shot's camera looks at `t` s: the world point at the frame's centre and its zoom. */
export interface CameraKey {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * The figure stands in `cell` from `from` s to `to` s, breathing; `blink`,
 * when given, names the key whose closed eyes `cell` shows on the figure's
 * own seeded schedule of blinks (`blinkOf` pastes them over `cell`'s eyes).
 */
export interface Hold<K extends string = string> {
  readonly _tag: 'Hold';
  readonly from: number;
  readonly to: number;
  readonly cell: K;
  readonly blink?: K;
}

/** The figure turns from cell `from` to cell `to` over `dur` s from `at` s: the drawn cell swaps at 40 % under a small squash. */
export interface Turn<K extends string = string> {
  readonly _tag: 'Turn';
  readonly at: number;
  readonly dur: number;
  readonly from: K;
  readonly to: K;
}

/** A big move as a run of whole-figure drawn keys: each `[t, cell]` holds from its time to the next. */
export interface Keys<K extends string = string> {
  readonly _tag: 'Keys';
  readonly keys: readonly [readonly [number, K], ...ReadonlyArray<readonly [number, K]>];
}

/** The figure walks in `cell` from `x0` to `x1` between `from` s and `to` s: a bob of `bob` px at `rate` steps a second, never a new drawing. */
export interface Walk<K extends string = string> {
  readonly _tag: 'Walk';
  readonly from: number;
  readonly to: number;
  readonly cell: K;
  readonly x0: number;
  readonly x1: number;
  readonly bob: number;
  readonly rate: number;
}

export type Span<K extends string = string> = Hold<K> | Turn<K> | Keys<K> | Walk<K>;

/** Where a moving plate is at one key: moved `x`, `y` layer px off its place, stretched `sx`, `sy` about its foot (the middle of its bottom edge), and how opaque, 0..1. */
export interface PlateKey {
  readonly x: number;
  readonly y: number;
  readonly sx: number;
  readonly sy: number;
  readonly alpha: number;
}

/** A plate at rest: in its place, unstretched, opaque. */
export const AT_REST: PlateKey = { x: 0, y: 0, sx: 1, sy: 1, alpha: 1 };

/**
 * A plate shown along a brush: the polyline `brush` (`[x, y, r]` in the
 * plate's own px, its foot first) is laid from its foot to its far end over
 * `[from, to]` s, eased by smoothstep, and the plate shows only under the
 * laid part, each point a disc of radius `r`.
 */
export interface Reveal {
  readonly brush: ReadonlyArray<readonly [number, number, number]>;
  readonly from: number;
  readonly to: number;
}

/** A painted plate of the set: its file (relative to apps/animations), whether it is test art, its place in its layer's px, and, when it moves, its keys and its reveal. */
export interface Plate {
  readonly _tag: 'Plate';
  readonly file: string;
  readonly testArt: boolean;
  readonly place: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** Keys `[t, key]` in time order: smoothstep from each to the next, held before the first and after the last; at rest when it names none. */
  readonly moves?: ReadonlyArray<readonly [number, PlateKey]>;
  readonly reveal?: Reveal;
  /** The plate as a film's drawing declares it (its PNG as imported, its pixel size, its clear edges); a library shot, which no film draws, names none. */
  readonly painting?: PaintingSpec;
}

/**
 * A drawn figure: one member's one shot sheet, its soles' centre at `at`
 * (x, and the ground line's y) in its layer's px, and its spans. It has no
 * scale (derived from the shot's head and its layer's depth) and no light
 * (the shot's).
 */
export interface Figure<K extends string = string> {
  readonly _tag: 'Figure';
  readonly name: string;
  readonly member: string;
  readonly sheet: string;
  readonly at: { readonly x: number; readonly ground: number };
  readonly spans: readonly [Span<K>, ...ReadonlyArray<Span<K>>];
  /** Keys drawn as one cell's body wearing another's head (`withHeadOf`): the keys of one view share its head, a key that changes only its face keeps the neutral body. */
  readonly worn?: ReadonlyArray<Worn<K>>;
  /** Paints of its member's palette this figure wears in other colours (`dressed`): one sheet's figure told apart from another member's who dresses alike, with no new drawing. */
  readonly dress?: ReadonlyArray<Dress>;
  /** A factor on its draw scale (1 when none): a figure set a little larger or smaller than its head share gives, so two figures of one row stand level; the scale bar reads it as any other draw scale, so it stays inside the bar's band. */
  readonly size?: number;
}

/** One paint of a palette, as its cells hold it (`from`, hex), worn in another colour (`to`, hex). */
export interface Dress {
  readonly from: string;
  readonly to: string;
}

/** Key `key` drawn as cell `body` wearing the head of cell `head`. */
export interface Worn<K extends string = string> {
  readonly key: K;
  readonly head: K;
  readonly body: K;
}

export type Item = Plate | Figure;

/** One depth layer: its distance `z` (the focal plane 1), its blur in px, and its items drawn in order. */
export interface Layer {
  readonly name: string;
  readonly z: number;
  readonly blur: number;
  readonly items: ReadonlyArray<Item>;
}

/** A storybook shot: flat drawn figures on depth layers before a painted set, under one light, through one camera. */
export interface Shot {
  readonly id: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly fps: number;
  readonly duration: number;
  /**
   * Where the shot starts in its scene, in s (0 when it names none): its
   * frames are the scene's whole frames from there, each at shot time
   * `k / fps − from`, so a film shot's frames are the film's own.
   */
  readonly from?: number;
  /** A grown adult's head (crown to collar) in px on the focal plane at zoom 1: every figure's head is this times its member's head share, over its layer's z. */
  readonly headPx: number;
  readonly light: Light;
  readonly camera: ReadonlyArray<CameraKey>;
  readonly layers: ReadonlyArray<Layer>;
}

/** A figure whose spans may name only `keys`, the keys of its one sheet. */
export const figure = <const K extends string>(
  keys: ReadonlyArray<K>,
  f: Omit<Figure<NoInfer<K>>, '_tag'>,
): Figure<K> => ({ _tag: 'Figure', ...f });

export const hold = <const K extends string>(from: number, to: number, cell: K): Hold<K> => ({
  _tag: 'Hold',
  from,
  to,
  cell,
});

/** A hold that blinks: `blink` is the key whose closed eyes `cell` shows while the figure blinks. */
export const blinkingHold = <const K extends string>(
  from: number,
  to: number,
  cell: K,
  blink: K,
): Hold<K> => ({ _tag: 'Hold', from, to, cell, blink });

export const turn = <const K extends string>(at: number, dur: number, from: K, to: K): Turn<K> => ({
  _tag: 'Turn',
  at,
  dur,
  from,
  to,
});

export const keyRun = <const K extends string>(keys: Keys<K>['keys']): Keys<K> => ({
  _tag: 'Keys',
  keys,
});

export const walk = <const K extends string>(w: Omit<Walk<K>, '_tag'>): Walk<K> => ({
  _tag: 'Walk',
  ...w,
});

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Smoothstep on 0..1. */
export const ease = (x: number): number => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** How far a turn squashes the figure across (to 0.94) and stretches it up (to 1.03), at the swap. */
export const SQUASH = { x: 0.06, y: 0.03 } as const;

/** The share of a turn's time at which its drawn cell swaps. */
const SWAP = 0.4;

/** When a turn's drawn cell swaps, in s: what a thing the swap sets down (a plate) appears on. */
export const swapOf = (t: Pick<Turn, 'at' | 'dur'>): number => t.at + t.dur * SWAP;

/** The time a walk's bob settles over before it stops, in s. */
const SETTLE = 0.4;

/** When a span starts. */
export const startOf = (s: Span): number => {
  switch (s._tag) {
    case 'Hold':
      return s.from;
    case 'Turn':
      return s.at;
    case 'Keys':
      return s.keys[0]?.[0] ?? 0;
    case 'Walk':
      return s.from;
  }
};

/** The span a figure is in at `t`: the last to have started, or the first before any has. */
export const spanAt = <K extends string>(spans: Figure<K>['spans'], t: number): Span<K> =>
  spans.filter((s) => startOf(s) <= t).at(-1) ?? spans[0];

/** A figure's drawing at one moment: its cell, the key whose eyes it shows (its cell, or its hold's blink key while it blinks), its soles' centre in its layer's px, its squash, and its breath (how far it stretches up about its soles, 1 at rest). */
export interface Posed {
  readonly cell: string;
  readonly eyes: string;
  readonly x: number;
  readonly y: number;
  readonly sx: number;
  readonly sy: number;
  readonly breath: number;
}

/** How far a breath stretches a holding figure up about its soles at its fullest: 0.4 %, about 2 px on the lead (critique 1, item 5). */
export const BREATH = 0.004;

/** The shortest and longest breath, in s; each figure's own lies between, drawn from its name. */
export const BREATH_PERIOD = [3.2, 3.9] as const;

/** How long a blink shows its key, in s. */
export const BLINK = 0.125;

/** When a figure's first blink may come after the shot's start, and the gap from one blink's start to the next's, in s: each drawn from the figure's name. */
const FIRST_BLINK = [0.6, 1.8] as const;
export const BLINK_GAP = [2.4, 4.4] as const;

/** A seeded draw in [0, 1) from a name: FNV-1a of its characters into the engine's `rng`. */
const drawsOf = (name: string): (() => number) => {
  let h = 0x811c9dc5;
  for (const ch of name) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return rng(h);
};

const within = (range: readonly [number, number], u: number): number =>
  range[0] + (range[1] - range[0]) * u;

/** A figure's breath period in s, drawn from its name within `BREATH_PERIOD`. */
export const breathPeriodOf = (name: string): number => within(BREATH_PERIOD, drawsOf(name)());

/** A holding figure's breath at `t`: from rest at `from` up to 1 + `BREATH` and back, once per its own period. */
const breathAt = (name: string, from: number, t: number): number => {
  const period = breathPeriodOf(name);
  return 1 + (BREATH * (1 - Math.cos((2 * Math.PI * (t - from)) / period))) / 2;
};

/** Where the breath of a hold starting at `from` starts: the start of the run of holds it ends, each starting where the one before it ends, so a key change from hold to hold breathes on and only a hold after a move or a turn starts from rest (critique 4, C). */
const breathFrom = (spans: ReadonlyArray<Span>, from: number): number => {
  const before = spans.find((p): p is Hold => p._tag === 'Hold' && p.to === from && p.from < from);
  if (!before) return from;
  return breathFrom(spans, before.from);
};

/**
 * Whether a figure is mid-blink at `t`: its blinks run over the whole shot,
 * the first a seeded wait after its start and each next a seeded gap later,
 * each `BLINK` s long, all drawn from its name alone. One schedule across
 * its holds, so a cut from one hold to the next never restarts the wait
 * (critique 2, item 4).
 */
const blinkingAt = (name: string, t: number): boolean => {
  const draw = drawsOf(`${name} blinks`);
  for (let start = within(FIRST_BLINK, draw()); start <= t; start += within(BLINK_GAP, draw()))
    if (t < start + BLINK) return true;
  return false;
};

/** A holding figure's pose: its cell, showing only its blink key's eyes while it blinks, breathing on from the start of its run of holds (`breathFrom`). The body is always `cell`'s: a blink never swaps the drawing. */
const holdPose = (f: Figure, s: Hold, t: number): Posed => {
  const shown = [s.cell, s.blink ?? s.cell][Number(blinkingAt(f.name, t))] ?? s.cell;
  return {
    cell: s.cell,
    eyes: shown,
    x: f.at.x,
    y: f.at.ground,
    sx: 1,
    sy: 1,
    breath: breathAt(f.name, breathFrom(f.spans, s.from), t),
  };
};

/** A pose with its cell's own eyes. */
const open = (p: Omit<Posed, 'eyes'>): Posed => ({ ...p, eyes: p.cell });

/** The key a pose draws: its cell, or its cell with its blink key's eyes as `<cell>~<eyes>`. */
export const drawnKeyOf = (p: Pick<Posed, 'cell' | 'eyes'>): string => {
  if (p.eyes === p.cell) return p.cell;
  return `${p.cell}~${p.eyes}`;
};

const turnPose = (s: Turn, t: number, x: number, y: number): Omit<Posed, 'eyes'> => {
  const u = (t - s.at) / s.dur;
  if (u <= 0) return { cell: s.from, x, y, sx: 1, sy: 1, breath: 1 };
  if (u >= 1) return { cell: s.to, x, y, sx: 1, sy: 1, breath: 1 };
  if (u < SWAP) {
    const k = ease(u / SWAP);
    return { cell: s.from, x, y, sx: 1 - SQUASH.x * k, sy: 1 + SQUASH.y * k, breath: 1 };
  }
  const k = ease((u - SWAP) / (1 - SWAP));
  return {
    cell: s.to,
    x,
    y,
    sx: 1 - SQUASH.x * (1 - k),
    sy: 1 + SQUASH.y * (1 - k),
    breath: 1,
  };
};

const walkPose = (s: Walk, t: number, ground: number): Omit<Posed, 'eyes'> => {
  const u = clamp01((t - s.from) / Math.max(1e-6, s.to - s.from));
  const settle = 1 - ease((t - (s.to - SETTLE)) / SETTLE);
  const lift = s.bob * Math.abs(Math.sin(Math.PI * s.rate * Math.max(0, t - s.from))) * settle;
  return {
    cell: s.cell,
    x: lerp(s.x0, s.x1, 1 - (1 - u) ** 1.6),
    y: ground - lift,
    sx: 1,
    sy: 1,
    breath: 1,
  };
};

/** A figure's pose at `t` from its spans alone. */
export const poseAt = (f: Figure, t: number): Posed => {
  const s = spanAt(f.spans, t);
  const { x, ground } = f.at;
  switch (s._tag) {
    case 'Hold':
      return holdPose(f, s, t);
    case 'Turn':
      return open(turnPose(s, t, x, ground));
    case 'Keys': {
      const cell = (s.keys.filter(([at]) => at <= t).at(-1) ?? s.keys[0])[1];
      return open({ cell, x, y: ground, sx: 1, sy: 1, breath: 1 });
    }
    case 'Walk':
      return open(walkPose(s, t, ground));
  }
};

/** The camera at `t`: each pair of keys eased (smoothstep) from one to the next, held before the first and after the last. */
export const cameraAt = (keys: ReadonlyArray<CameraKey>, t: number): CameraKey => {
  const first = keys[0] ?? { t: 0, x: 0, y: 0, zoom: 1 };
  const next = keys.findIndex((k) => k.t > t);
  if (next <= 0) return { ...(keys.at(next) ?? first), t };
  const a = keys[next - 1] ?? first;
  const b = keys[next] ?? first;
  const u = ease((t - a.t) / Math.max(1e-6, b.t - a.t));
  return { t, x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), zoom: lerp(a.zoom, b.zoom, u) };
};

/**
 * A figure's draw scale: the shot's head times its member's head share
 * (`share`, 1 for a grown adult), over its layer's depth, over the head its
 * sheet draws (`sheetHeadPx`, the median over its cells), so every figure's
 * head is a grown adult's times its share times 1/z. One scale for all its
 * cells.
 */
export const scaleOf = (headPx: number, z: number, sheetHeadPx: number, share = 1): number =>
  (headPx * share) / z / sheetHeadPx;

/** One figure in one frame, as plain data: its zoom is its plane's, `zoom^(1/z)` of the camera's. */
export interface FigureFrame extends Posed {
  readonly name: string;
  readonly layer: string;
  readonly scale: number;
  readonly zoom: number;
}

/** One frame: its time, the camera, and each figure. */
export interface Frame {
  readonly t: number;
  readonly camera: CameraKey;
  readonly figures: ReadonlyArray<FigureFrame>;
}

/** Every figure of a shot with its layer. */
export const figuresOf = (
  shot: Shot,
): ReadonlyArray<{ readonly layer: Layer; readonly figure: Figure }> =>
  shot.layers.flatMap((layer) =>
    layer.items.flatMap((item) => {
      if (item._tag === 'Figure') return [{ layer, figure: item }];
      return [];
    }),
  );

/** Layers in the order the page draws them, each over the ones before: farthest first, layers of one depth in their given order, as the engine's multiplane sorts its planes (a stable sort by depth). */
export const drawOrder = <L extends { readonly z: number }>(
  layers: ReadonlyArray<L>,
): ReadonlyArray<L> => layers.toSorted((a, b) => b.z - a.z);

/** Every plate of a shot. */
export const platesOf = (shot: Shot): ReadonlyArray<Plate> =>
  shot.layers.flatMap((layer) =>
    layer.items.flatMap((item) => {
      if (item._tag === 'Plate') return [item];
      return [];
    }),
  );

/**
 * The frame at `t`: the camera, and per figure its cell, place, squash,
 * scale and plane zoom (`sheetHeads` names each figure's sheet's median head
 * in px, `shares` each figure's member's head share, 1 when it names none:
 * `sharesOf` its stored figures, so every reader sizes a child as the page
 * paints it). A pure function of `t`.
 */
export const frameAt = (
  shot: Shot,
  sheetHeads: ReadonlyMap<string, number>,
  t: number,
  shares: ReadonlyMap<string, number>,
): Frame => {
  const camera = cameraAt(shot.camera, t);
  return {
    t,
    camera,
    figures: figuresOf(shot).map(({ layer, figure: f }) => ({
      name: f.name,
      layer: layer.name,
      scale:
        scaleOf(
          shot.headPx,
          layer.z,
          sheetHeads.get(f.name) ?? shot.headPx,
          shares.get(f.name) ?? 1,
        ) * (f.size ?? 1),
      zoom: camera.zoom ** (1 / layer.z),
      ...poseAt(f, t),
    })),
  };
};

/** How near a time may lie past a frame's and still be read as on it: the engine's clock epsilon. */
const ON_FRAME = 1e-6;

/**
 * The times of a shot's frames: the scene's whole frames `k` with
 * `from ≤ k / fps < from + duration`, each at `k / fps − from` (`from` 0
 * when it names none: `i / fps` for each i below `duration × fps`).
 */
export const timesOf = (shot: Shot): ReadonlyArray<number> => {
  const from = shot.from ?? 0;
  const first = Math.ceil(from * shot.fps - ON_FRAME);
  const last = Math.ceil((from + shot.duration) * shot.fps - ON_FRAME);
  return Array.from({ length: last - first }, (_, i) => (first + i) / shot.fps - from);
};

const keyLerp = (a: PlateKey, b: PlateKey, u: number): PlateKey => ({
  x: lerp(a.x, b.x, u),
  y: lerp(a.y, b.y, u),
  sx: lerp(a.sx, b.sx, u),
  sy: lerp(a.sy, b.sy, u),
  alpha: lerp(a.alpha, b.alpha, u),
});

/** Where a plate is at `t`: its keys eased (smoothstep) from one to the next, held before the first and after the last; at rest when it has none. */
export const plateAt = (plate: Pick<Plate, 'moves'>, t: number): PlateKey => {
  const keys = plate.moves ?? [];
  const next = keys.findIndex(([at]) => at > t);
  if (next === 0) return keys[0]?.[1] ?? AT_REST;
  if (next < 0) return keys.at(-1)?.[1] ?? AT_REST;
  const [ta, a] = keys[next - 1] ?? [0, AT_REST];
  const [tb, b] = keys[next] ?? [0, AT_REST];
  return keyLerp(a, b, ease((t - ta) / Math.max(1e-6, tb - ta)));
};

/** The discs of a plate's brush laid by `t`, in the plate's own px: every brush point within the laid length, and the point where the laying has reached; every disc when it has no reveal. */
export const revealAt = (
  reveal: Reveal,
  t: number,
): ReadonlyArray<readonly [number, number, number]> => {
  const pts = reveal.brush;
  const lengths = pts.slice(1).map((p, i) => {
    const q = pts[i] ?? p;
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  let left = ease((t - reveal.from) / Math.max(1e-6, reveal.to - reveal.from)) * total;
  if (left <= 0) return [];
  const laid: Array<readonly [number, number, number]> = [];
  for (const [i, p] of pts.entries()) {
    laid.push(p);
    const q = pts[i + 1];
    const len = lengths[i] ?? 0;
    if (!q) break;
    if (left <= len) {
      const u = left / Math.max(1e-6, len);
      laid.push([lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)]);
      break;
    }
    left -= len;
  }
  return laid;
};

const mixed = (c: Rgb, to: Rgb, amount: number): Rgb => [
  Math.round(c[0] + (to[0] - c[0]) * amount),
  Math.round(c[1] + (to[1] - c[1]) * amount),
  Math.round(c[2] + (to[2] - c[2]) * amount),
];

/** A colour as the light leaves it: a shade paint toward the shade, the ink as it is, any other colour toward the tint. */
export const litColour = (c: Rgb, tone: Paint['tone'] | 'drawn', light: Light): Rgb => {
  if (tone === 'ink') return c;
  if (tone === 'shade') return mixed(c, rgbOfHex(light.shade.colour), light.shade.amount);
  return mixed(c, rgbOfHex(light.tint.colour), light.tint.amount);
};

/** A cell under the shot's light: every pixel `litColour` of the paint it is, or of a drawn colour when it is none; applied once per cell, the same for every figure. */
export const lit = (cell: Raster, light: Light, paints: ReadonlyArray<Paint>): Raster => {
  const tones = new Map(
    paints.map((p) => [`${p.rgb[0]},${p.rgb[1]},${p.rgb[2]}`, p.tone] as const),
  );
  const rgba = cell.rgba.slice();
  for (let q = 0; q < cell.width * cell.height; q++) {
    if (alphaAt(cell, q) === 0) continue;
    const c = rgbAt(cell, q);
    rgba.set(litColour(c, tones.get(`${c[0]},${c[1]},${c[2]}`) ?? 'drawn', light), q * 4);
  }
  return { width: cell.width, height: cell.height, rgba };
};

/** A colour's key for an exact lookup: its three channels. */
const rgbKey = (c: Rgb) => `${c[0]},${c[1]},${c[2]}`;

/** A cell in a figure's dress: every pixel of a dressed paint in its new colour, every other pixel as it was. */
export const dressed = (cell: Raster, dress: ReadonlyArray<Dress>): Raster => {
  if (dress.length === 0) return cell;
  const to = new Map(dress.map((d) => [rgbKey(rgbOfHex(d.from)), rgbOfHex(d.to)] as const));
  const rgba = cell.rgba.slice();
  for (let q = 0; q < cell.width * cell.height; q++) {
    if (alphaAt(cell, q) === 0) continue;
    const c = to.get(rgbKey(rgbAt(cell, q)));
    if (c) rgba.set(c, q * 4);
  }
  return { width: cell.width, height: cell.height, rgba };
};

/** A palette's paints in a figure's dress: each dressed paint in its new colour, its part, tone and role as they were. */
export const dressedPaints = (
  paints: ReadonlyArray<Paint>,
  dress: ReadonlyArray<Dress>,
): ReadonlyArray<Paint> => {
  const to = new Map(dress.map((d) => [rgbKey(rgbOfHex(d.from)), rgbOfHex(d.to)] as const));
  return paints.map((p) => {
    const rgb = to.get(rgbKey(p.rgb));
    if (!rgb) return p;
    return { ...p, rgb, lab: labOf(rgb) };
  });
};

/** A palette's paints as the light leaves them: each paint's colour `litColour` of it, its part, tone and role as they were. */
export const litPaints = (paints: ReadonlyArray<Paint>, light: Light): ReadonlyArray<Paint> =>
  paints.map((p) => {
    const rgb = litColour(p.rgb, p.tone, light);
    return { ...p, rgb, lab: labOf(rgb) };
  });

/** A colour's chroma in Lab: how coloured it is, whatever its lightness. */
export const chromaOf = (c: Rgb): number => {
  const [, a, b] = labOf(c);
  return Math.hypot(a, b);
};
