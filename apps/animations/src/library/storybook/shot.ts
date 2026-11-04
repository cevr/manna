import type { Raster } from '@manna/film/tools';
import { labOf } from '@manna/film/core';
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

/** The figure stands in `cell` from `from` s to `to` s. */
export interface Hold<K extends string = string> {
  readonly _tag: 'Hold';
  readonly from: number;
  readonly to: number;
  readonly cell: K;
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

/** A painted plate of the set: its file (relative to apps/animations), whether it is test art, and its place in its layer's px. */
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
  /** The lead's head (crown to collar) in px on the focal plane at zoom 1: every figure's head is this over its layer's z. */
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

/** A figure's drawing at one moment: its cell, its soles' centre in its layer's px and its squash. */
export interface Posed {
  readonly cell: string;
  readonly x: number;
  readonly y: number;
  readonly sx: number;
  readonly sy: number;
}

const turnPose = (s: Turn, t: number, x: number, y: number): Posed => {
  const u = (t - s.at) / s.dur;
  if (u <= 0) return { cell: s.from, x, y, sx: 1, sy: 1 };
  if (u >= 1) return { cell: s.to, x, y, sx: 1, sy: 1 };
  if (u < SWAP) {
    const k = ease(u / SWAP);
    return { cell: s.from, x, y, sx: 1 - SQUASH.x * k, sy: 1 + SQUASH.y * k };
  }
  const k = ease((u - SWAP) / (1 - SWAP));
  return { cell: s.to, x, y, sx: 1 - SQUASH.x * (1 - k), sy: 1 + SQUASH.y * (1 - k) };
};

const walkPose = (s: Walk, t: number, ground: number): Posed => {
  const u = clamp01((t - s.from) / Math.max(1e-6, s.to - s.from));
  const settle = 1 - ease((t - (s.to - SETTLE)) / SETTLE);
  const lift = s.bob * Math.abs(Math.sin(Math.PI * s.rate * Math.max(0, t - s.from))) * settle;
  return {
    cell: s.cell,
    x: lerp(s.x0, s.x1, 1 - (1 - u) ** 1.6),
    y: ground - lift,
    sx: 1,
    sy: 1,
  };
};

/** A figure's pose at `t` from its spans alone. */
export const poseAt = (f: Figure, t: number): Posed => {
  const s = spanAt(f.spans, t);
  const { x, ground } = f.at;
  const still = (cell: string): Posed => ({ cell, x, y: ground, sx: 1, sy: 1 });
  switch (s._tag) {
    case 'Hold':
      return still(s.cell);
    case 'Turn':
      return turnPose(s, t, x, ground);
    case 'Keys':
      return still((s.keys.filter(([at]) => at <= t).at(-1) ?? s.keys[0])[1]);
    case 'Walk':
      return walkPose(s, t, ground);
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
 * A figure's draw scale: the shot's head over its layer's depth, over the
 * head its sheet draws (`sheetHeadPx`, the median over its cells), so every
 * figure's head is the lead's times 1/z. One scale for all its cells.
 */
export const scaleOf = (headPx: number, z: number, sheetHeadPx: number): number =>
  headPx / z / sheetHeadPx;

/** One figure in one frame, as plain data. */
export interface FigureFrame extends Posed {
  readonly name: string;
  readonly layer: string;
  readonly scale: number;
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

/** Every plate of a shot. */
export const platesOf = (shot: Shot): ReadonlyArray<Plate> =>
  shot.layers.flatMap((layer) =>
    layer.items.flatMap((item) => {
      if (item._tag === 'Plate') return [item];
      return [];
    }),
  );

/**
 * The frame at `t`: the camera, and per figure its cell, place, squash and
 * scale (`sheetHeads` names each figure's sheet's median head in px). A
 * pure function of `t`.
 */
export const frameAt = (shot: Shot, sheetHeads: ReadonlyMap<string, number>, t: number): Frame => ({
  t,
  camera: cameraAt(shot.camera, t),
  figures: figuresOf(shot).map(({ layer, figure: f }) => ({
    name: f.name,
    layer: layer.name,
    scale: scaleOf(shot.headPx, layer.z, sheetHeads.get(f.name) ?? shot.headPx),
    ...poseAt(f, t),
  })),
});

/** The times of a shot's frames: `i / fps` for each i below `round(duration × fps)`. */
export const timesOf = (shot: Shot): ReadonlyArray<number> =>
  Array.from({ length: Math.round(shot.duration * shot.fps) }, (_, i) => i / shot.fps);

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
