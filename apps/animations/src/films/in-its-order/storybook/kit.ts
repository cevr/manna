import { type PaintingSpec, type TextStyle, write } from '@manna/film/canvas';
import { Option } from 'effect';
import type { PaintingFrame, SheetCells } from '../../../library/storybook/scene.ts';
import { medianOf, shareOf } from '../../../library/storybook/sheet.ts';
import {
  blinkingHold,
  type CameraKey,
  ease,
  hold,
  type Figure,
  figure,
  type Layer,
  type Light,
  type Plate,
  type PlateKey,
  type Span,
} from '../../../library/storybook/shot.ts';
import { fonts } from '../palette.ts';
import { SHEET_CELLS } from './cells.ts';
import { sheetNamed } from './sheets.ts';

/** Where the film's plates lie, relative to apps/animations: each plate's file is its painting's key too. */
const PLATES = 'src/films/in-its-order/plates';

/** Where the plates the storybook adds lie (the parchment's shadow), relative to apps/animations. */
export const STORY_PLATES = 'src/films/in-its-order/storybook/plates';

/** A plate of the film at rest: its painting as declared (in `dir`, the film's `plates/` unless named), placed where the painting's `at` puts it, `scale` times its size about that corner (one factor, or one across and one down). */
export const plateOf = (
  name: string,
  spec: PaintingSpec,
  more: Partial<Pick<Plate, 'moves' | 'reveal'>> & {
    readonly at?: readonly [number, number];
    readonly scale?: number | readonly [number, number];
    readonly dir?: string;
  } = {},
): Plate => {
  const [x, y] = more.at ?? spec.at ?? [0, 0];
  const [sx = 1, sy = sx] = [more.scale ?? 1].flat();
  return {
    _tag: 'Plate',
    file: `${more.dir ?? PLATES}/${name}`,
    testArt: false,
    place: { x, y, width: spec.size[0] * sx, height: spec.size[1] * sy },
    painting: spec,
    ...Option.match(Option.fromUndefinedOr(more.moves), {
      onNone: () => ({}),
      onSome: (moves) => ({ moves }),
    }),
    ...Option.match(Option.fromUndefinedOr(more.reveal), {
      onNone: () => ({}),
      onSome: (reveal) => ({ reveal }),
    }),
  };
};

/** A plate whose point `on` (its own px) is laid at layer point `at`, `scale` times its size. */
export const plateOn = (
  name: string,
  spec: PaintingSpec,
  on: readonly [number, number],
  at: readonly [number, number],
  scale: number,
  more: Partial<Pick<Plate, 'moves' | 'reveal'>> & { readonly dir?: string } = {},
): Plate =>
  plateOf(name, spec, { ...more, at: [at[0] - on[0] * scale, at[1] - on[1] * scale], scale });

/** A plate stretched across and down so its own points `ends` (its px) land on layer points `to`, in order: what lays a stream from one thing to another. */
export const plateAcross = (
  name: string,
  spec: PaintingSpec,
  ends: readonly [readonly [number, number], readonly [number, number]],
  to: readonly [readonly [number, number], readonly [number, number]],
  more: Partial<Pick<Plate, 'moves' | 'reveal'>> & { readonly dir?: string } = {},
): Plate => {
  const [[px, py], [qx, qy]] = ends;
  const [[ax, ay], [bx, by]] = to;
  const sx = (bx - ax) / (qx - px);
  const sy = (by - ay) / (qy - py);
  return plateOf(name, spec, { ...more, at: [ax - px * sx, ay - py * sy], scale: [sx, sy] });
};

/** A key of a moving plate: at rest but for the fields given. */
export const key = (k: Partial<PlateKey>): PlateKey => ({
  x: 0,
  y: 0,
  sx: 1,
  sy: 1,
  alpha: 1,
  ...k,
});

/** A camera key at `t` s. */
export const cam = (t: number, x: number, y: number, zoom: number): CameraKey => ({
  t,
  x,
  y,
  zoom,
});

/** A camera framing: its centre in layer px and its zoom. */
export interface Framing {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** The framing eased `u` of the way from `a` to `b`, as a shot's camera eases between two keys (`ease`, smoothstep): what a drawing over a shot reads to follow its push. */
export const framingAt = (a: Framing, b: Framing, u: number): Framing => {
  const e = ease(u);
  return {
    x: a.x + (b.x - a.x) * e,
    y: a.y + (b.y - a.y) * e,
    zoom: a.zoom + (b.zoom - a.zoom) * e,
  };
};

/** Where a point of a plane at depth 1 lies on a 1920×1080 frame under framing `c`. */
export const onScreen = (c: Framing, x: number, y: number): readonly [number, number] => [
  960 + (x - c.x) * c.zoom,
  540 + (y - c.y) * c.zoom,
];

/** One move of a shot's camera: the cue (its name in the shot) it runs over, and the framings it starts and ends at. */
export type Move = readonly [cue: string, from: Framing, to: Framing];

/** A shot's camera as moves in order, each starting where the one before ended. */
export type CameraPath = readonly [Move, ...ReadonlyArray<Move>];

/** The camera keys a path lays: each move from its cue's start to its end. */
export const camerasOf = (
  path: CameraPath,
  cue: (name: string) => { readonly start: number; readonly end: number },
): ReadonlyArray<CameraKey> =>
  path.flatMap(([name, from, to]) => [
    cam(cue(name).start, from.x, from.y, from.zoom),
    cam(cue(name).end, to.x, to.y, to.zoom),
  ]);

/** The framing shot `shot`'s path holds at a frame whose cues have run `at` of their way: the first move not yet done, eased as the shot eases it, or the last move's end. */
export const pathFramingAt = (
  shot: string,
  path: CameraPath,
  at: (cue: string) => number,
): Framing => {
  const [moving] = path.filter(([cue]) => at(`${shot}:${cue}`) < 1);
  const [cue, from, to] = moving ?? path[path.length - 1] ?? path[0];
  return framingAt(from, to, at(`${shot}:${cue}`));
};

/** An area of a depth-1 plane, layer px. */
export interface Area {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The frame box `area` covers at some point of `path`'s moves, read at a hundred steps of each and clipped to the frame: the only place a drawing over the shot that follows the path draws. */
export const boxOver = (path: CameraPath, area: Area) => {
  const corners = path.flatMap(([, from, to]) =>
    Array.from({ length: 101 }, (_, i) => framingAt(from, to, i / 100)).flatMap((c) => [
      onScreen(c, area.x0, area.y0),
      onScreen(c, area.x1, area.y1),
    ]),
  );
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const [x0, y0] = [
    Math.max(0, Math.floor(Math.min(...xs))),
    Math.max(0, Math.floor(Math.min(...ys))),
  ];
  const [x1, y1] = [
    Math.min(1920, Math.ceil(Math.max(...xs))),
    Math.min(1080, Math.ceil(Math.max(...ys))),
  ];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** One line of lettering on a depth-1 plane: its centre and baseline, layer px, and its words. */
export interface InkLine {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

/** How a lettered verse is inked: everything of its type but the face, which is always the film's hand (`fonts.hand`), never the cards' serif. */
export type Ink = Omit<TextStyle, 'family'>;

/**
 * Lines lettered in ink by the film's own hand on a depth-1 plane under
 * framing `c`, in the hand's face (`fonts.hand`) at `ink`'s size, weight
 * and colour: written stroke by stroke in order, `written` of the way
 * through all their letters (each line's share its letters'), each line's
 * hand `<name>-<i>`.
 */
export const inkLines = (
  f: PaintingFrame,
  c: Framing,
  lines: ReadonlyArray<InkLine>,
  ink: Ink,
  written: number,
  name: string,
) => {
  const type: TextStyle = { ...ink, family: fonts.hand };
  if (written <= 0) return;
  const ctx = f.ctx;
  const [x0, y0] = onScreen(c, 0, 0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.scale(c.zoom, c.zoom);
  const sizes = lines.map((l) => l.text.length);
  const total = sizes.reduce((a, b) => a + b, 0);
  lines.forEach((line, i) => {
    const before = sizes.slice(0, i).reduce((a, b) => a + b, 0) / total;
    const share = (sizes[i] ?? 0) / total;
    const progress = Math.min(1, Math.max(0, (written - before) / share));
    if (progress <= 0) return;
    write(ctx, line.text, line.x, line.y, type, f.hand(`${name}-${i}`), {
      progress,
      reveal: 'write',
      boil: 0,
    });
  });
  ctx.restore();
};

/** A hex colour as a CSS colour at `alpha`. */
export const withAlpha = (hex: string, alpha: number): string => {
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${Math.min(1, Math.max(0, alpha))})`;
};

/** A layer: its name, depth and items, unblurred. */
export const layer = (name: string, z: number, items: Layer['items']): Layer => ({
  name,
  z,
  blur: 0,
  items,
});

/**
 * Each sheet's figure from crown to soles in its own px, read on its first
 * cell (its soles' row less its first inked row, as `storybook draw`'s lines
 * read them): what places a figure by its crown.
 */
export const TALL: ReadonlyMap<string, number> = new Map([
  ['lead-feast/iio-table', 604],
  ['lead-feast/iio-close', 836],
  ['lead-feast/iio-two', 728],
  ['lead-feast/iio-milk', 868],
  ['feast-mother/iio-baby', 922],
  ['feast-guest-man/iio-table', 668],
  ['feast-guest-woman/feast-courtyard', 629],
  ['feast-guest-woman/iio-table', 632],
  ['filler-dressed/iio-diner-1', 818],
  ['filler-dressed/iio-diner-2', 926],
  ['filler-dressed/iio-diner-3', 772],
  ['filler-dressed/iio-diner-4', 862],
  ['idea-villagers/iio-milk', 651],
  ['idea-villagers/iio-milk-baby', 604],
  ['villager-toddler/iio-milk', 808],
  ['villager-child/iio-milk', 917],
]);

/** A sheet's head as the film reads it: the median of its cells' heads. */
const sheetHead = (sheet: SheetCells): number =>
  Option.getOrElse(
    medianOf(
      Object.values(sheet.cells).flatMap((c) => Option.toArray(Option.fromUndefinedOr(c.head))),
    ),
    () => 1,
  );

/** A sheet's head (`sheetHead`) by `<member>/<sheet>`, 1 when act 1 lists no such sheet. */
const headOfSheet = (name: string): number =>
  Option.getOrElse(Option.map(Option.fromUndefinedOr(SHEET_CELLS.get(name)), sheetHead), () => 1);

/**
 * The guest woman's size on her table sheet: its collar reads her robe's
 * neckline trim, drawn in her mantle's shade a few px above the robe her
 * kept sheet's collar reads (critique 3, finding 4), so she draws at the
 * size her kept sheet's head gives her.
 */
export const WOMAN_TABLE_SIZE =
  headOfSheet('feast-guest-woman/iio-table') / headOfSheet('feast-guest-woman/feast-courtyard');

/** The scale a member's figure on `sheet` draws at on its plane, its px to layer px, under a shot whose grown head is `headPx`, on a layer at depth `z`: as the page scales it. */
export const drawScaleOf = (member: string, sheet: string, headPx: number, z: number): number => {
  const cells = SHEET_CELLS.get(`${member}/${sheet}`);
  if (!cells) return 0;
  return (headPx * shareOf(cells.palette, sheet)) / z / sheetHead(cells);
};

/** How tall a member's figure on `sheet` draws on its plane, crown to soles, in layer px, under a shot whose grown head is `headPx`, on a layer at depth `z`. */
export const tallOf = (member: string, sheet: string, headPx: number, z: number): number =>
  (TALL.get(`${member}/${sheet}`) ?? 0) * drawScaleOf(member, sheet, headPx, z);

/** A figure of the film on its declared sheet, its crown at `crown` in its layer's px (its ground derived from its sheet, the shot's head and its layer's depth). */
export const seat = (
  f: {
    readonly member: string;
    readonly sheet: string;
    readonly name: string;
    readonly x: number;
    readonly crown: number;
    readonly worn?: Figure['worn'];
    readonly dress?: Figure['dress'];
    readonly size?: number;
  },
  at: { readonly headPx: number; readonly z: number },
  spans: Figure['spans'],
): Figure =>
  figure(sheetNamed(f.member, f.sheet)?.keys ?? [], {
    name: f.name,
    member: f.member,
    sheet: f.sheet,
    at: {
      x: f.x,
      ground: f.crown + tallOf(f.member, f.sheet, at.headPx, at.z) * (f.size ?? 1),
    },
    spans,
    worn: f.worn ?? [],
    dress: f.dress ?? [],
    size: f.size ?? 1,
  });

/** One hold: a blinking hold, or a still one where its blink key is its own cell (a short key change). */
const holdOf = (from: number, to: number, cell: string, blink: string): Span =>
  [blinkingHold(from, to, cell, blink), hold(from, to, cell)][Number(blink === cell)] ??
  hold(from, to, cell);

/** One run of a figure's holds: from `from`, `cell` blinking with `blink`'s pasted eyes; a still hold when `blink` is `cell`. */
export type Run = readonly [from: number, cell: string, blink: string];

/** A figure's holds through a shot: runs, each a hold to the next (blinking unless its blink is its cell), the last to `end`. */
export const holds = (
  runs: readonly [Run, ...ReadonlyArray<Run>],
  end: number,
): Figure['spans'] => {
  const spans = runs.map(([from, cell, blink], i) =>
    holdOf(from, runs[i + 1]?.[0] ?? end, cell, blink),
  );
  const [first, ...rest] = spans;
  return [first ?? hold(0, end, runs[0][1]), ...rest];
};

/** The courtyard's light, from take 5: a warm tint and a violet shade, each a tenth. */
export const COURTYARD: Light = {
  tint: { colour: '#ffd79a', amount: 0.1 },
  shade: { colour: '#5b4a8c', amount: 0.1 },
};

/** The parchment's light: a warmer, softer tint and a violet shade at least as saturated (CRAFT rule 12). */
export const PARCHMENT: Light = {
  tint: { colour: '#ffd2a0', amount: 0.08 },
  shade: { colour: '#7f6bb3', amount: 0.1 },
};
