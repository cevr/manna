import { rng } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import { type Box, cropOf, hexOf, type Palette, paintsOf, type Rgb } from '../sheet.ts';
import { BREATH } from '../shot.ts';
import {
  type FigureRead,
  type FrameRead,
  heightSamples,
  observeHeight,
  opaqueBox,
} from './measures.ts';
import { analysisBoxOf, type Placement } from './rows.ts';

const SKIN: Rgb = [240, 180, 130];
const ROBE: Rgb = [110, 130, 125];

/** The palette every reference figure is drawn in: skin over robe, its ink dark. */
export const PALETTE: Palette = {
  ink: '#140a05',
  parts: [
    { name: 'skin', base: hexOf(SKIN), role: 'skin' },
    { name: 'robe', base: hexOf(ROBE), role: 'garment' },
  ],
};

export const PAINTS = paintsOf(PALETTE);

/** A `width` × `height` picture, clear, with `fill` painting each pixel it answers a colour for. */
export const pictureOf = (
  width: number,
  height: number,
  fill: (x: number, y: number) => Option.Option<Rgb>,
): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      Option.map(fill(x, y), (c) => rgba.set([...c, 255], (y * width + x) * 4));
  return { width, height, rgba };
};

/** A cell as the page holds it: its picture, and its anchor (its soles' centre as its entry pins it) in its own px. */
export interface Cell {
  readonly raster: Raster;
  readonly ax: number;
  readonly ay: number;
}

/**
 * A reference of the page's paint: `cell` at `place` over `box` of the
 * frame's px, each pixel the cell pixel its centre falls in. The sample
 * points depend on the place alone, never on the box, so a frame and an
 * analysis surface agree wherever they overlap, as the page's integer move
 * keeps them.
 */
export const paintOn = (cell: Cell, place: Placement, box: Box): Raster => {
  const { raster } = cell;
  const out = new Uint32Array(box.width * box.height);
  const src = new Uint32Array(raster.rgba.slice().buffer);
  const us = Array.from({ length: box.width }, (_, i) =>
    Math.floor((box.x + i + 0.5 - place.x) / place.sx + cell.ax),
  );
  for (let j = 0; j < box.height; j++) {
    const v = Math.floor((box.y + j + 0.5 - place.y) / place.sy + cell.ay);
    if (v < 0 || v >= raster.height) continue;
    for (let i = 0; i < box.width; i++) {
      const u = us[i] ?? -1;
      if (u >= 0 && u < raster.width) out[j * box.width + i] = src[v * raster.width + u] ?? 0;
    }
  }
  return { width: box.width, height: box.height, rgba: new Uint8Array(out.buffer) };
};

/** `cell` at `place` on its analysis surface (`analysisBoxOf`), with the surface. */
export const analysedOn = (cell: Cell, place: Placement) => {
  const box = analysisBoxOf(
    place,
    { width: cell.raster.width, height: cell.raster.height, ax: cell.ax, ay: cell.ay },
    0,
  );
  return { box, raster: paintOn(cell, place, box) };
};

/**
 * A figure in figure units (`u` across from its soles' centre, `v` up from
 * its soles, the top of its head near 1): a head whose crown slants down
 * to its left over its head column, a body, and two round feet apart.
 */
export const slantedFigure = (u: number, v: number): boolean => {
  const head =
    ((u - 0.05) / 0.09) ** 2 + ((v - 0.88) / 0.12) ** 2 <= 1 && v <= 0.97 + 0.5 * (u - 0.05);
  const body = Math.abs(u) <= 0.1 && v >= 0.05 && v <= 0.8;
  const foot = (c: number) => ((u - c) / 0.05) ** 2 + ((v - 0.03) / 0.03) ** 2 <= 1;
  return head || body || foot(-0.06) || foot(0.06);
};

/**
 * `drawing` drawn `height` px from soles to top, stretched `growth` up, its
 * soles' centre at (`x`, `y`), as a resampling page draws it: each pixel's
 * alpha its coverage, by 4 × 4 samples, on a clear surface round it.
 */
export const coveredOn = (
  drawing: (u: number, v: number) => boolean,
  height: number,
  growth: number,
  x: number,
  y: number,
): Raster => {
  const [x0, y0] = [Math.floor(x - 0.25 * height) - 8, Math.floor(y - 1.1 * height * growth) - 8];
  const [width, rows] = [Math.ceil(0.5 * height) + 16, Math.ceil(1.1 * height * growth) + 16];
  const rgba = new Uint8Array(width * rows * 4);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < width; i++) {
      let hits = 0;
      for (let s = 0; s < 16; s++) {
        const px = x0 + i + ((s % 4) + 0.5) / 4;
        const py = y0 + j + (Math.floor(s / 4) + 0.5) / 4;
        if (drawing((px - x) / height, (y - py) / (height * growth))) hits += 1;
      }
      if (hits > 0) rgba.set([...ROBE, Math.round((hits / 16) * 255)], (j * width + i) * 4);
    }
  return { width, height: rows, rgba };
};

/** A standing body in its cell's rows `top` to `bottom`: a head, a robe, two feet apart, leaning `lean` px off the cell's middle, and a raised arm reaching `arm` rows above the crown where it has one. */
export interface Body {
  readonly top: number;
  readonly bottom: number;
  readonly lean: number;
  readonly arm: Option.Option<number>;
}

/** The px either side of a body's column its widest part reaches (the arm). */
const REACH = 16;

/** A body drawn on a clear cell `width` × `height`, its anchor at (`ax`, `ay`), wherever its extent lies. */
export const bodyCell = (b: Body, width: number, height: number, ax: number, ay: number): Cell => {
  const h = b.bottom - b.top + 1;
  const cx = Math.floor(width / 2) + b.lean;
  const neck = b.top + Math.round(h * 0.16);
  const feet = b.bottom - Math.round(h * 0.08);
  const shoulder = b.top + Math.round(h * 0.45);
  const raster = pictureOf(width, height, (x, y) => {
    const d = x - cx;
    const arm = Option.exists(
      b.arm,
      (rise) => d >= 13 && d <= REACH && y >= b.top - rise && y <= shoulder,
    );
    if (arm) return Option.some(ROBE);
    if (y < b.top || y > b.bottom) return Option.none();
    if (y < neck) return Option.some(SKIN).pipe(Option.filter(() => Math.abs(d) <= 9));
    if (y < feet) return Option.some(ROBE).pipe(Option.filter(() => Math.abs(d) <= 11));
    return Option.some(ROBE).pipe(Option.filter(() => Math.abs(d) >= 3 && Math.abs(d) <= 12));
  });
  return { raster, ax, ay };
};

/** How the view frames a figure in one frame: whole, cut at an edge or a corner, or not at all. */
export type View = 'whole' | 'top' | 'bottom' | 'left' | 'right' | 'corner' | 'out';

/** Each path a key's frames take through the view: whole, cut throughout, whole into a cut and back out of one at each edge, and leaving the view and coming back. */
export const PATHS: ReadonlyArray<{
  readonly name: string;
  readonly views: (n: number, at: number) => View;
}> = [
  { name: 'whole', views: () => 'whole' },
  ...(['top', 'bottom', 'left', 'right', 'corner'] as const).map((edge) => ({
    name: `${edge} throughout`,
    views: (): View => edge,
  })),
  ...(['top', 'bottom', 'left', 'right'] as const).flatMap((edge) => [
    {
      name: `whole -> ${edge}`,
      views: (n: number, at: number): View => ([edge, 'whole'] as const)[Number(n < at)] ?? edge,
    },
    {
      name: `${edge} -> whole`,
      views: (n: number, at: number): View => (['whole', edge] as const)[Number(n < at)] ?? edge,
    },
  ]),
  {
    name: 'exit and re-entry',
    views: (n: number, at: number): View =>
      (['whole', 'out'] as const)[Number(n === at)] ?? 'whole',
  },
];

/** How a generated key grows or shrinks: by its draw scale (the plan), or by its drawing's soles or crown moved while its anchor holds (the render apart from the plan). */
export const GROWTHS = ['plan', 'drawn soles', 'drawn crown'] as const;

export type Growth = (typeof GROWTHS)[number];

/** The frame every generated key is shot in. */
export const FRAME = { width: 320, height: 1400 } as const;

/** Which edges of the frame an extent in frame px crosses, and whether it misses the frame. */
export const viewOf = (e: Box): View => {
  const [top, bottom] = [e.y < 0, e.y + e.height > FRAME.height];
  const [left, right] = [e.x < 0, e.x + e.width > FRAME.width];
  if (e.x >= FRAME.width || e.x + e.width <= 0 || e.y >= FRAME.height || e.y + e.height <= 0)
    return 'out';
  if (top && left) return 'corner';
  return (
    (
      [
        ['top', top],
        ['bottom', bottom],
        ['left', left],
        ['right', right],
      ] as const
    ).find(([, cut]) => cut)?.[0] ?? 'whole'
  );
};

/** One generated key: its frames' complete reads, and the views each frame was framed in as its analysis render places it. */
export interface KeyRun {
  readonly reads: ReadonlyArray<FrameRead>;
  readonly views: ReadonlyArray<View>;
  readonly surfaces: ReadonlyArray<{ readonly box: Box; readonly raster: Raster }>;
}

/** One seeded case of the rule's domain: a path, a way of growing, grow or shrink, and seeded depth, push or pull, draw scale, breaths, places, phases, body and anchor. */
export const keyCase = (
  seed: number,
  path: (typeof PATHS)[number],
  growth: Growth,
  shrink: boolean,
) => {
  const draw = rng(seed);
  const n = 4;
  const h0 = 400 + Math.floor(draw() * 20);
  const [mt, mb] = [24 + Math.floor(draw() * 8), 24 + Math.floor(draw() * 8)];
  const width = 2 * (REACH + 6) + Math.floor(draw() * 8);
  const lean = Math.floor(draw() * 5) - 2;
  const arm = Option.some(Math.floor(draw() * h0 * 0.04)).pipe(Option.filter(() => draw() < 0.5));
  const ax = Math.floor(width / 2) + lean + 0.5 + Math.floor(draw() * 9) - 4;
  const ay = mt + h0 + Math.floor(draw() * 25) - 12;
  const z = 1 + draw() * 2;
  const push = -0.25 + draw() * 0.75;
  const scale = (470 + draw() * 50) / (h0 * Math.min(1, 1 + push) ** (1 / z));
  const at = 1 + Math.floor(draw() * (n - 1));
  const change = 1 + Math.floor(draw() * (n - 1));
  const g = [1.03 + draw() * 0.01, 0.96 + draw() * 0.01][Number(shrink)] ?? 1;
  const frames = Array.from({ length: n }, (_, k) => ({
    k,
    plane: (1 + (k / (n - 1)) * push) ** (1 / z),
    breath: 1 + draw() * BREATH,
    cut: 0.15 + draw() * 0.45,
    phase: [draw(), draw()] as const,
  }));
  const cellHeight = mt + h0 + mb;
  const grownRows = [Math.ceil(h0 * g), Math.floor(h0 * g)][Number(shrink)] ?? h0;
  const steadyBody: Body = { top: mt, bottom: mt + h0 - 1, lean, arm };
  const grownBody: Body = {
    plan: steadyBody,
    'drawn soles': { ...steadyBody, bottom: mt + grownRows - 1 },
    'drawn crown': { ...steadyBody, top: mt + h0 - grownRows },
  }[growth];
  const steadyCell = bodyCell(steadyBody, width, cellHeight, ax, ay);
  const grownCell = bodyCell(grownBody, width, cellHeight, ax, ay);
  const planScale = [1, g][Number(growth === 'plan')] ?? 1;
  const frameOf = (k: number, grown: boolean, view: View, name = 'f') => {
    const f = frames[k % n] ?? { k, plane: 1, breath: 1, cut: 0.3, phase: [0, 0] as const };
    const body = [steadyBody, grownBody][Number(grown)] ?? steadyBody;
    const cell = [steadyCell, grownCell][Number(grown)] ?? steadyCell;
    const s = scale * f.plane * ([1, planScale][Number(grown)] ?? 1);
    const [sx, sy] = [s, s * f.breath];
    const ymin = body.top - Option.getOrElse(body.arm, () => 0);
    const [xmin, xmax] = [Math.floor(width / 2) + lean - 12, Math.floor(width / 2) + lean + REACH];
    const [w, h] = [(xmax + 1 - xmin) * sx, (body.bottom + 1 - ymin) * sy];
    const x0 =
      {
        whole: (FRAME.width - w) / 2,
        top: (FRAME.width - w) / 2,
        bottom: (FRAME.width - w) / 2,
        left: -f.cut * w,
        right: FRAME.width - (1 - f.cut) * w,
        corner: -f.cut * w,
        out: FRAME.width + 20,
      }[view] + f.phase[0];
    const y0 =
      {
        whole: (FRAME.height - h) / 2,
        top: -f.cut * h,
        bottom: FRAME.height - (1 - f.cut) * h,
        left: (FRAME.height - h) / 2,
        right: (FRAME.height - h) / 2,
        corner: -f.cut * h,
        out: (FRAME.height - h) / 2,
      }[view] + f.phase[1];
    const place = { x: x0 - (xmin - ax) * sx, y: y0 - (ymin - ay) * sy, sx, sy };
    const surface = analysedOn(cell, place);
    const extent = Option.map(opaqueBox(surface.raster), (b) => ({
      ...b,
      x: b.x + surface.box.x,
      y: b.y + surface.box.y,
    }));
    const seen = Option.match(extent, { onNone: (): View => 'out', onSome: viewOf });
    const read: FigureRead = {
      whole: seen === 'whole',
      lines: Option.none(),
      interior: 0,
      litInterior: 0,
    };
    return {
      surface,
      view: seen,
      read: {
        frame: k,
        name,
        cell: 'key',
        zoom: f.plane,
        squashed: false,
        read,
        height: observeHeight(surface.raster),
      } satisfies FrameRead,
    };
  };
  const run = (grownFrom: number): KeyRun => {
    const made = frames.map((f) => frameOf(f.k, f.k >= grownFrom, path.views(f.k, at)));
    return {
      reads: made.map((m) => m.read),
      views: made.map((m) => m.view),
      surfaces: made.map((m) => m.surface),
    };
  };
  return { n, at, change, run, frameOf, expected: frames.map((f) => path.views(f.k, at)) };
};

/** A key's spread, -1 where it reads unread. */
export const spreadOf = (reads: ReadonlyArray<FrameRead>): number =>
  Option.getOrElse(heightSamples(reads)[0]?.value ?? Option.none(), () => -1);

/** An analysis render cut one px into the figure at one edge (`edge` 0 top, 1 bottom, 2 left, 3 right): a surface that missed part of it. */
export const clipped = (raster: Raster, edge: number): Raster =>
  Option.match(opaqueBox(raster), {
    onNone: () => raster,
    onSome: (o) => {
      const boxes: ReadonlyArray<Box> = [
        { x: 0, y: o.y + 1, width: raster.width, height: raster.height - o.y - 1 },
        { x: 0, y: 0, width: raster.width, height: o.y + o.height - 1 },
        { x: o.x + 1, y: 0, width: raster.width - o.x - 1, height: raster.height },
        { x: 0, y: 0, width: o.x + o.width - 1, height: raster.height },
      ];
      return cropOf(raster, boxes[edge % boxes.length] ?? o);
    },
  });

/**
 * Every case of the rule's domain growing (or shrinking, `shrink`) 3–4 %:
 * each path through the view by each way of growing, seeded. Answers each
 * miss of the rule, none when it holds: the generated views are the ones
 * the path names; the steady key reads within 0.8 % (breath and sampling);
 * the grown key fails, and still fails with a steady cut frame appended or
 * prepended; a surface that cut the figure in one frame reads unread.
 */
export const domainMisses = (shrink: boolean): ReadonlyArray<string> =>
  PATHS.flatMap((path, p) =>
    GROWTHS.flatMap((growth, g) => {
      const seed = 1 + p * 6 + g * 2 + Number(shrink);
      const c = keyCase(seed, path, growth, shrink);
      const steady = c.run(c.n);
      const grown = c.run(c.change);
      const unread = grown.reads.map((r, k) =>
        Option.match(
          Option.filter(Option.fromUndefinedOr(grown.surfaces[k]), () => k === seed % c.n),
          {
            onNone: () => r,
            onSome: (s) => ({ ...r, height: observeHeight(clipped(s.raster, seed)) }),
          },
        ),
      );
      const at = `${path.name} / ${growth} / ${['grow', 'shrink'][Number(shrink)]} (seed ${seed})`;
      const [still, grew] = [spreadOf(steady.reads), spreadOf(grown.reads)];
      return [
        {
          ok: steady.views.join() === c.expected.join(),
          at: `${at}: views ${steady.views.join()}`,
        },
        {
          ok: grown.views.join() === c.expected.join(),
          at: `${at}: grown views ${grown.views.join()}`,
        },
        { ok: still >= 0 && still <= 0.008, at: `${at}: steady ${still}` },
        { ok: grew > 0.02, at: `${at}: grown ${grew}` },
        {
          ok: spreadOf([...grown.reads, c.frameOf(c.n, false, 'left').read]) > 0.02,
          at: `${at}: a steady left-cut frame appended`,
        },
        {
          ok: spreadOf([c.frameOf(c.n + 1, false, 'top').read, ...grown.reads]) > 0.02,
          at: `${at}: a steady top-cut frame prepended`,
        },
        { ok: spreadOf(unread) === -1, at: `${at}: one clipped surface reads ${spreadOf(unread)}` },
      ].flatMap((x) => [x.at].filter(() => !x.ok));
    }),
  );
