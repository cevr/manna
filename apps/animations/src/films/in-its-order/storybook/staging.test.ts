import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import sharp from 'sharp';
import { filmFolder, shotsOf } from '../../../library/storybook/films.ts';
import { planeOf } from '../../../library/storybook/verify/covers.ts';
import { rng } from '@manna/film/core';
import {
  cameraAt,
  type Figure,
  figure,
  figuresOf,
  hold,
  type Plate,
  plateAt,
  platesOf,
  poseAt,
  revealAt,
  swapOf,
  timesOf,
  turn,
} from '../../../library/storybook/shot.ts';
import VILLAGER_PALETTE from '../cast/idea-villagers/cast-sheet/palette.json';
import { CELLS as LEAD_MILK_CELLS } from '../../../library/cast/lead-feast/shot-sheets/iio-milk/cells.ts';
import { CELLS as VILLAGER_CELLS } from '../cast/idea-villagers/shot-sheets/iio-milk/cells.ts';
import { inItsOrder } from './index.ts';
import { drawScaleOf } from './kit.ts';
import { TABLE } from '../plates/plates.ts';
import { BABY_MOTHER, bottleSetDown, TABLE_TOP_PX } from './shots/cold.ts';
import { HEAD, TABLE_TOP } from './shots/courtyard.ts';
import { CELLS as LEAD_TABLE_CELLS } from '../../../library/cast/lead-feast/shot-sheets/iio-table/cells.ts';
import LEAD_TABLE_RECORD from '../../../library/cast/lead-feast/shot-sheets/iio-table/record.json';
import { MEASURED } from './palettes.ts';
import { CUP_MOUTHS, DISSOLVES, GUTTER } from './shots/milk.ts';

/** The lead's table sheet's record, read for its props alone (a sheet drawn before props records none). */
const TABLE_RECORD: {
  readonly props?: ReadonlyArray<{
    readonly name: string;
    readonly base: string;
    readonly role: string;
  }>;
} = LEAD_TABLE_RECORD;

/** The lead's table cells that draw the bottle in his hand. */
const HOLDING = new Set(['lift', 'bottle']);

/** Each of `times` at which his hand (`poseAt`'s cell) and the plate (`plateAt`'s alpha) both show the bottle, or neither does: a hand-off shows it exactly once at every frame. */
const handOffMisses = (lead: Figure, plate: Plate, times: ReadonlyArray<number>) =>
  times.filter((t) => HOLDING.has(poseAt(lead, t).cell) === plateAt(plate, t).alpha > 0);

/** The pour's length on the panels `milk.newborn.5` and `milk.word.5`, gutter to cup, in px of a 1080-tall frame (critique 2, finding 4). */
const PANEL_POUR = 340;

/** How far the film's pour may run from the panel's, as a factor either way. */
const POUR_REACH = 1.3;

/** How long a generated set-down's bottle travels onto the table after the turn, s: cold-letter's `settle`. */
const SETTLE = 0.25;

/** The most the bottle may move between two frames, layer px: about the width of his round hand at the table's scale (60 cell px × 0.53), so the eye follows it from his hand to the table (critique 2, finding 6: a jump of about 350 frame px in one frame). */
const MAX_STEP = 32;

/** The middle of a drawing's opaque pixels within `reach` (RGB distance) of `hex`, in its px. */
const middleOf = (
  raw: {
    readonly data: Buffer;
    readonly info: { readonly width: number; readonly height: number };
  },
  hex: string,
  reach: number,
) => {
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const { width, height } = raw.info;
  const sums = { x: 0, y: 0, n: 0 };
  for (let q = 0; q < width * height; q++) {
    const i = q * 4;
    if (raw.data.readUInt8(i + 3) <= 128) continue;
    const d = Math.hypot(
      raw.data.readUInt8(i) - channel(1),
      raw.data.readUInt8(i + 1) - channel(3),
      raw.data.readUInt8(i + 2) - channel(5),
    );
    if (d > reach) continue;
    sums.x += q % width;
    sums.y += Math.floor(q / width);
    sums.n += 1;
  }
  return [sums.x / Math.max(1, sums.n), sums.y / Math.max(1, sums.n)] as const;
};

/** How far (RGB distance) a keyed plate's cream may sit from its sheet's prop paint and still read as the bottle's body: the plate is keyed from a drawing, not snapped to a palette. */
const CREAM_REACH = 30;

/** The widest run, along any one row, of a drawing's opaque pixels within `reach` (RGB distance) of `hex`: a drawn part's width across, read on its own pixels. */
const widestRun = (
  raw: {
    readonly data: Buffer;
    readonly info: { readonly width: number; readonly height: number };
  },
  hex: string,
  reach: number,
) => {
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const { width, height } = raw.info;
  const near = (i: number) =>
    raw.data.readUInt8(i + 3) > 128 &&
    Math.hypot(
      raw.data.readUInt8(i) - channel(1),
      raw.data.readUInt8(i + 1) - channel(3),
      raw.data.readUInt8(i + 2) - channel(5),
    ) <= reach;
  return Array.from(
    { length: height },
    (_, y) =>
      Array.from({ length: width }, (_, x) => near((y * width + x) * 4)).reduce(
        (acc, hit) => {
          const run = Number(hit) * (acc.run + 1);
          return { run, best: Math.max(acc.best, run) };
        },
        { run: 0, best: 0 },
      ).best,
  ).reduce((a, w) => Math.max(a, w), 0);
};

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const placed = await Effect.runPromise(
  shotsOf(inItsOrder).pipe(
    Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
  ),
);

/** Each shot's push cap its spec row names, as the largest zoom over the smallest across the shot: cold-letter's "≤ 15 %", cold-ouch's and milk-pour's "≤ 5 %", and each named push or pull's range; the title's pull starts nearer, at 1.3, by the orchestrator's ruling on critique 1, item 9. */
const PUSH_CAPS: ReadonlyMap<string, number> = new Map([
  ['cold-baby', 1.06],
  ['cold-letter', 1.15],
  ['cold-ouch', 1.05],
  ['cold-what', 1.08],
  ['title', 1.3],
  ['milk-cup', 1.1],
  ['milk-pour', 1.05],
]);

/** Where a plate's foot lies at `t`, in its layer's px: the bottom of its place moved by its key, which stretches it about its foot. */
const footAt = (plate: Plate, t: number) => {
  const k = plateAt(plate, t);
  const { x, y, width, height } = plate.place;
  const cx = x + width / 2 + k.x;
  return { left: cx - (width * k.sx) / 2, right: cx + (width * k.sx) / 2, y: y + height + k.y };
};

/** Where a plate's own point `p` (its painting's px) lies at `t`, in its layer's px: placed, moved by its key and stretched about its foot, as the painter lays it. */
const pointOn = (plate: Plate, t: number, p: readonly [number, number]) => {
  const k = plateAt(plate, t);
  const { x, y, width, height } = plate.place;
  const [w, h] = plate.painting?.size ?? [width, height];
  return [
    x + k.x + width / 2 + ((p[0] * width) / w - width / 2) * k.sx,
    y + k.y + height + ((p[1] * height) / h - height) * k.sy,
  ] as const;
};

/** A plate's middle at `t`, in its layer's px: its box moved by its key and stretched about its foot. */
const middleAt = (plate: Plate, t: number) => {
  const foot = footAt(plate, t);
  const k = plateAt(plate, t);
  return [(foot.left + foot.right) / 2, foot.y - (plate.place.height * k.sy) / 2] as const;
};

/** The villager's cup mouths and his cells, by cell. */
const MOUTHS = new Map(Object.entries(CUP_MOUTHS));
const CELL_OF = new Map(Object.entries(VILLAGER_CELLS));

/** milk-row's two grown men's cells, by `<member>/<cell>`. */
const ROW_CELLS = new Map<string, { readonly png: string; readonly ay: number }>([
  ...Object.entries(LEAD_MILK_CELLS).map(([cell, c]) => [`lead-feast/${cell}`, c] as const),
  ...Object.entries(VILLAGER_CELLS).map(([cell, c]) => [`idea-villagers/${cell}`, c] as const),
]);

/** A cell's first row holding an opaque pixel: its crown. */
const firstInkedRow = (raw: {
  readonly data: Buffer;
  readonly info: { readonly width: number; readonly height: number };
}) =>
  Array.from({ length: raw.info.height }, (_, y) => y).find((y) =>
    Array.from(
      { length: raw.info.width },
      (_, x) => raw.data[(y * raw.info.width + x) * 4 + 3] ?? 0,
    ).some((a) => a > 127),
  ) ?? raw.info.height;

/** A villager paint's hex by part name. */
const paintOf = (name: string) => VILLAGER_PALETTE.parts.find((p) => p.name === name)?.base ?? '';

/** Where a cup mouth box does not read as the cup's mouth on its cell's pixels: the milk (the tunic's paint, which it snaps to) across the middle half of its middle row, the milk ended within 8 px past each side, and the cup's paint (the sandals') there on one side. */
const mouthMisses = (
  name: string,
  m: (typeof CUP_MOUTHS)[keyof typeof CUP_MOUTHS],
  raw: { readonly data: Buffer; readonly info: { readonly width: number } },
): ReadonlyArray<string> => {
  const [milk, cup] = [paintOf('tunic'), paintOf('sandals')];
  const at = (x: number, y: number) => {
    const i = (y * raw.info.width + x) * 4;
    return `#${[raw.data[i], raw.data[i + 1], raw.data[i + 2]].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`;
  };
  const row = Math.round(m.y + m.height / 2);
  const middle = Array.from({ length: Math.round(m.width / 2) }, (_, k) =>
    at(Math.round(m.x + m.width / 4) + k, row),
  );
  const side = (from: number, step: number) =>
    Array.from({ length: 8 }, (_, k) => at(from + step * k, row));
  const [left, right] = [side(m.x - 1, -1), side(m.x + m.width, 1)];
  const ok =
    middle.every((c) => c === milk) &&
    [left, right].every((s) => s.some((c) => c !== milk)) &&
    [...left, ...right].includes(cup);
  if (ok) return [];
  return [`${name}: ${middle.join(' ')} | ${left.join(' ')} | ${right.join(' ')}`];
};

describe("In Its Order's staging", () => {
  test('pushes each shot no further than its spec row’s cap (critique 1, item 5)', () => {
    const over = placed.flatMap(({ shot }) => {
      const zooms = timesOf(shot).map((t) => cameraAt(shot.camera, t).zoom);
      const push = Math.max(...zooms) / Math.min(...zooms);
      const cap = PUSH_CAPS.get(shot.id) ?? Number.POSITIVE_INFINITY;
      if (push <= cap + 1e-9) return [];
      return [`${shot.id} pushes ${push.toFixed(4)}, its cap ${cap}`];
    });
    expect(over).toEqual([]);
  });

  test('lays every scroll on the table top wherever it rests: its foot between the top’s back and front edges and across the table (critique 1, item 5)', () => {
    const off = placed.flatMap(({ shot }) =>
      shot.layers.flatMap((layer) =>
        layer.items.flatMap((item) => {
          if (item._tag !== 'Plate' || !item.file.includes('/scroll-')) return [];
          return timesOf(shot).flatMap((t, i) => {
            const still = plateAt(item, t + 1 / shot.fps);
            const k = plateAt(item, t);
            const resting = k.alpha > 0 && k.y === still.y && k.sy === still.sy;
            const foot = footAt(item, t);
            const onTop =
              foot.y >= TABLE_TOP.y &&
              foot.y <= TABLE_TOP.y + TABLE_TOP.height &&
              foot.left >= TABLE_TOP.x &&
              foot.right <= TABLE_TOP.x + TABLE_TOP.width;
            if (!resting || onTop) return [];
            return [`${shot.id} frame ${i}: ${item.file} foot at ${foot.y.toFixed(1)}`];
          });
        }),
      ),
    );
    expect(off).toEqual([]);
  });

  test('pours the milk from the open book’s gutter into the villager’s cup in milk-pour: its brush’s first point inside the gutter wherever it shows, its last inside the cup’s mouth once laid (critique 1, item 3)', () => {
    const pour = placed.find(({ shot }) => shot.id === 'milk-pour')?.shot;
    const items = pour?.layers.flatMap((l) => l.items) ?? [];
    const book = items.find((i) => i._tag === 'Plate' && i.file.endsWith('/milk-book-open.png'));
    const villager = items.find((i) => i._tag === 'Figure' && i.name === 'villager');
    const pours = items.flatMap((i) => {
      if (i._tag !== 'Plate' || !i.reveal) return [];
      return [{ plate: i, reveal: i.reveal }];
    });
    expect(pours.length).toBe(2);
    if (!pour || book?._tag !== 'Plate' || villager?._tag !== 'Figure') return;
    const s = drawScaleOf('idea-villagers', 'iio-milk', pour.headPx, 1);
    const gutter = [
      pointOn(book, 0, [GUTTER.x, GUTTER.y]),
      pointOn(book, 0, [GUTTER.x + GUTTER.width, GUTTER.y + GUTTER.height]),
    ] as const;
    const misses = timesOf(pour).flatMap((t, i) =>
      pours.flatMap(({ plate, reveal }) => {
        const [first, last] = [reveal.brush[0], reveal.brush[reveal.brush.length - 1]];
        if (!first || !last || plateAt(plate, t).alpha <= 0) return [];
        const laid = revealAt(reveal, t);
        const reached = laid[laid.length - 1];
        if (!reached) return [];
        const landed = reached[0] === last[0] && reached[1] === last[1];
        const pose = poseAt(villager, t);
        const source = pointOn(plate, t, [first[0], first[1]]);
        const end = pointOn(plate, t, [last[0], last[1]]);
        const placed = Option.all([
          Option.fromUndefinedOr(MOUTHS.get(pose.cell)),
          Option.fromUndefinedOr(CELL_OF.get(pose.cell)),
        ]);
        const inMouth = Option.exists(placed, ([m, c]) => {
          const x0 = pose.x + (m.x - c.ax) * s * pose.sx;
          const x1 = pose.x + (m.x + m.width - c.ax) * s * pose.sx;
          const y0 = pose.y + (m.y - c.ay) * s * pose.sy * pose.breath;
          const y1 = pose.y + (m.y + m.height - c.ay) * s * pose.sy * pose.breath;
          return end[0] >= x0 && end[0] <= x1 && end[1] >= y0 && end[1] <= y1;
        });
        const inGutter =
          source[0] >= gutter[0][0] &&
          source[0] <= gutter[1][0] &&
          source[1] >= gutter[0][1] &&
          source[1] <= gutter[1][1];
        if ((inMouth || !landed) && inGutter) return [];
        return [
          `frame ${i} (${pose.cell}): source ${source.map((v) => v.toFixed(0))} in gutter ${inGutter}, end ${end.map((v) => v.toFixed(0))} in mouth ${inMouth}`,
        ];
      }),
    );
    expect(misses.slice(0, 5)).toEqual([]);
  });

  test('pours the milk about the panel’s length in milk-pour: from the gutter to the cup’s mouth, on screen, within 1.3 times the panel’s 340 px either way, wherever a pour shows (critique 2, finding 4; the owner: the book nearer the cup)', () => {
    const pour = placed.find(({ shot }) => shot.id === 'milk-pour')?.shot;
    if (!pour) return expect(pour).toBeDefined();
    const pours = platesOf(pour).filter((p) => p.reveal);
    expect(pours.length).toBe(2);
    const off = timesOf(pour).flatMap((t, i) =>
      pours.flatMap((plate) => {
        const brush = plate.reveal?.brush ?? [];
        const [first, last] = [brush[0], brush.at(-1)];
        if (!first || !last || plateAt(plate, t).alpha <= 0) return [];
        const [a, b] = [
          pointOn(plate, t, [first[0], first[1]]),
          pointOn(plate, t, [last[0], last[1]]),
        ];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) * cameraAt(pour.camera, t).zoom;
        if (length >= PANEL_POUR / POUR_REACH && length <= PANEL_POUR * POUR_REACH) return [];
        return [`frame ${i}: ${length.toFixed(0)} px`];
      }),
    );
    expect(off.slice(0, 3)).toEqual([]);
  });

  it.effect(
    'reads each cup mouth it pours into on its cell: milk paint across the box’s middle row, ended within 8 px past each side, the cup’s paint past one',
    () =>
      Effect.gen(function* () {
        const wrong = yield* Effect.forEach([...MOUTHS], ([name, m]) =>
          Effect.map(
            Effect.promise(() =>
              sharp(CELL_OF.get(name)?.png ?? '')
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true }),
            ),
            (raw) => mouthMisses(name, m, raw),
          ),
        );
        expect(wrong.flat()).toEqual([]);
      }),
  );

  test('frames the lead’s head at a third of the frame’s height or more through cold-ouch, at the table as cold-letter leaves it: the guests staring, the diners’ plane, the scroll laid open (critique 1, item 1)', () => {
    const ouch = placed.find(({ shot }) => shot.id === 'cold-ouch')?.shot;
    const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
    if (!ouch || !letter)
      return expect([ouch?.id, letter?.id]).toEqual(['cold-ouch', 'cold-letter']);
    const table = ouch.layers.find((l) => l.name === 'table');
    const heads = timesOf(ouch).map(
      (t) => (ouch.headPx * cameraAt(ouch.camera, t).zoom) / ouch.size.height,
    );
    expect(Math.min(...heads)).toBeGreaterThanOrEqual(1 / 3);
    const membersIn = (shot: typeof ouch) => [
      ...new Set(figuresOf(shot).map(({ figure }) => figure.member)),
    ];
    expect(membersIn(ouch).toSorted()).toEqual(membersIn(letter).toSorted());
    expect(figuresOf(ouch).length).toBeGreaterThanOrEqual(7);
    const cellAt = (shot: typeof ouch, name: string, t: number) =>
      figuresOf(shot)
        .filter(({ figure }) => figure.name === name)
        .map(({ figure }) => poseAt(figure, t).cell);
    const guestsAt = (shot: typeof ouch, t: number) =>
      ['man', 'woman'].flatMap((name) => cellAt(shot, name, t));
    expect(guestsAt(ouch, 0)).toEqual(guestsAt(letter, letter.duration - 1 / letter.fps));
    expect(
      table?.items.some((i) => i._tag === 'Plate' && i.file.endsWith('/scroll-open.png')),
    ).toBe(true);
  });

  test('seats the title’s eight in the panel’s groups, shoulders close within each, the man and the woman turned to the lead throughout (critique 1, item 9)', () => {
    const title = placed.find(({ shot }) => shot.id === 'title')?.shot;
    if (!title) return expect(title).toBeDefined();
    const seated = figuresOf(title)
      .map(({ figure }) => figure)
      .toSorted((a, b) => a.at.x - b.at.x);
    const groups = seated.reduce<Array<Array<string>>>((all, figure, i) => {
      const gap = figure.at.x - (seated[i - 1]?.at.x ?? Number.NEGATIVE_INFINITY);
      const last = all.at(-1);
      if (last && gap <= 150) last.push(figure.name);
      else all.push([figure.name]);
      return all;
    }, []);
    expect(groups).toEqual([
      ['diner-1', 'diner-2'],
      ['man', 'lead', 'woman', 'mother'],
      ['diner-3', 'diner-4'],
    ]);
    const turned = (name: string) =>
      seated
        .filter((f) => f.name === name)
        .flatMap((f) => [...new Set(timesOf(title).map((t) => poseAt(f, t).cell))]);
    expect(turned('man')).toEqual(['smile']);
    expect(turned('woman')).toEqual(['turn']);
  });

  test('has each diner of the title talk in turn, diner-3 too, his mouth his sheet’s own paint (critique 1, item 17)', () => {
    const title = placed.find(({ shot }) => shot.id === 'title')?.shot;
    if (!title) return expect(title).toBeDefined();
    const talks = figuresOf(title)
      .map(({ figure }) => figure)
      .filter((f) => f.name.startsWith('diner-'))
      .filter((f) => timesOf(title).some((t) => poseAt(f, t).cell === 'talk'))
      .map((f) => f.name)
      .toSorted();
    expect(talks).toEqual(['diner-1', 'diner-2', 'diner-3', 'diner-4']);
  });

  test('lays cold-baby’s near table across the mother’s lap, its top over her stool, a fifth of her height or more above her soles (critique 1, item 10)', () => {
    const baby = placed.find(({ shot }) => shot.id === 'cold-baby')?.shot;
    const near = baby?.layers.find((l) => l.name === 'near table')?.items[0];
    const mother = baby && figuresOf(baby).find(({ figure }) => figure.name === 'mother')?.figure;
    if (!baby || near?._tag !== 'Plate' || !mother)
      return expect([baby?.id, near?._tag, mother?.name]).toEqual(['cold-baby', 'Plate', 'mother']);
    const top = near.place.y + (TABLE_TOP_PX / TABLE.size[1]) * near.place.height;
    const tall = mother.at.ground - BABY_MOTHER.crown;
    expect(top).toBeLessThanOrEqual(mother.at.ground - tall / 5);
  });

  it.effect(
    'stands the lead’s and the villager’s crowns within 30 px of each other at milk-row’s last frame, each read on the cell it draws there (owner O2, by the orchestrator’s ruling; 99 px before)',
    () =>
      Effect.gen(function* () {
        const row = placed.find(({ shot }) => shot.id === 'milk-row')?.shot;
        if (!row) return expect(row).toBeDefined();
        const last = timesOf(row).at(-1) ?? 0;
        const crowns = yield* Effect.forEach(['lead', 'villager'], (name) => {
          const figure = figuresOf(row).find(({ figure }) => figure.name === name)?.figure;
          const pose = figure && poseAt(figure, last);
          const cell = pose && ROW_CELLS.get(`${figure.member}/${pose.cell}`);
          if (!figure || !pose || !cell) return Effect.succeed(Number.NaN);
          const s = drawScaleOf(figure.member, figure.sheet, row.headPx, 1) * (figure.size ?? 1);
          return Effect.map(
            Effect.promise(() =>
              sharp(cell.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
            ),
            (raw) => {
              const top = firstInkedRow(raw);
              return pose.y + (top - cell.ay) * s * pose.sy * pose.breath;
            },
          );
        });
        const [lead, villager] = crowns;
        expect(Math.abs((lead ?? Number.NaN) - (villager ?? Number.NaN))).toBeLessThanOrEqual(30);
      }),
  );

  test('draws the open scroll in cold-letter, at rest on the table at the shot’s end', () => {
    const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
    const open = letter?.layers
      .flatMap((l) => l.items)
      .find((item) => item._tag === 'Plate' && item.file.includes('scroll-open'));
    expect(open?._tag).toBe('Plate');
    if (!letter || open?._tag !== 'Plate') return;
    const end = letter.duration - 1 / letter.fps;
    expect(footAt(open, end).y).toBe(TABLE_TOP.y + TABLE_TOP.height);
  });

  it.effect(
    'sets the bottle down on the table top in cold-letter from the frame his hand empties to the shot’s end: his table sheet records its cream bottle as a measured prop, and the plate’s cream body across is the held bottle’s, read on both drawings (critique 1, items 6 and 7)',
    () =>
      Effect.gen(function* () {
        const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
        const lead =
          letter && figuresOf(letter).find(({ figure }) => figure.name === 'lead')?.figure;
        const prop = (TABLE_RECORD.props ?? []).find((p) => p.name === 'bottle');
        const measured = MEASURED.some(
          (m) =>
            m.member === 'lead-feast' && m.hex === prop?.base && m.source.includes('iio-table'),
        );
        const bottle = letter?.layers
          .flatMap((l) => l.items)
          .find((item) => item._tag === 'Plate' && item.file.endsWith('/bottle.png'));
        const png = bottle?._tag === 'Plate' && bottle.painting;
        if (!letter || !lead || !prop || !measured || bottle?._tag !== 'Plate' || !png)
          return expect([letter?.id, lead?.name, prop?.role, measured, bottle?._tag]).toEqual([
            'cold-letter',
            'lead',
            'prop',
            true,
            'Plate',
          ]);
        const times = timesOf(letter);
        const held = times.filter((t) => ['lift', 'bottle'].includes(poseAt(lead, t).cell));
        const shown = times.filter((t) => plateAt(bottle, t).alpha > 0);
        expect([held.length > 0, shown.length > 0]).toEqual([true, true]);
        expect(shown.some((t) => held.includes(t))).toBe(false);
        expect(shown.at(-1)).toBe(times.at(-1));
        const foot = bottle.place.y + bottle.place.height;
        expect(foot).toBeGreaterThanOrEqual(TABLE_TOP.y);
        expect(foot).toBeLessThanOrEqual(TABLE_TOP.y + TABLE_TOP.height);
        const raw = (file: string) =>
          Effect.promise(() =>
            sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
          );
        const [cell, plate] = yield* Effect.all([raw(LEAD_TABLE_CELLS.bottle.png), raw(png.png)]);
        const heldBody = (HEAD / LEAD_TABLE_CELLS.bottle.head) * widestRun(cell, prop.base, 0);
        const body = (bottle.place.width * widestRun(plate, prop.base, CREAM_REACH)) / png.size[0];
        expect(heldBody).toBeGreaterThan(0);
        expect(Math.abs(body / heldBody - 1)).toBeLessThanOrEqual(0.05);
      }),
  );

  test('shows no plate part-opaque for more than one frame running outside a declared dissolve, so a change is a drawing swapped whole (critique 2, finding 5: milk-cup’s book opened as a five-frame double exposure)', () => {
    const ghosts = placed.flatMap(({ shot }) =>
      platesOf(shot).flatMap((plate) => {
        const name = plate.file.split('/').at(-1) ?? '';
        if (DISSOLVES.has(name)) return [];
        const part = timesOf(shot).map((t) => {
          const a = plateAt(plate, t).alpha;
          return a > 1e-6 && a < 1 - 1e-6;
        });
        const longest = part.reduce(
          (acc, p) => {
            const run = Number(p) * (acc.run + 1);
            return { run, best: Math.max(acc.best, run) };
          },
          { run: 0, best: 0 },
        ).best;
        if (longest <= 1) return [];
        return [`${shot.id}: ${name} part-opaque ${longest} frames running`];
      }),
    );
    expect(ghosts).toEqual([]);
  });

  test('keeps every plate standing at a shot’s end where it stood at the next shot’s start, wherever that place is in the next frame, across each cut that keeps its figures where they stood (critique 2, finding 3: cold-ouch dropped the bottle cold-letter set down)', () => {
    const shots = placed.map(({ shot }) => shot);
    const pairs = shots.slice(1).flatMap((b, i) => {
      const a = shots[i];
      if (!a) return [];
      const at = (shot: typeof a) =>
        new Map(figuresOf(shot).map(({ layer, figure: f }) => [f.name, `${layer.name} ${f.at.x}`]));
      const [was, now] = [at(a), at(b)];
      const shared = [...was.keys()].filter((name) => now.has(name));
      if (shared.length === 0 || shared.some((name) => was.get(name) !== now.get(name))) return [];
      return [[a, b] as const];
    });
    expect(pairs.map(([a, b]) => `${a.id}>${b.id}`)).toContain('cold-letter>cold-ouch');
    const dropped = pairs.flatMap(([a, b]) => {
      const [end, start] = [timesOf(a).at(-1) ?? 0, timesOf(b)[0] ?? 0];
      const camera = cameraAt(b.camera, start);
      return a.layers.flatMap((layer) => {
        const there = b.layers.find((l) => l.name === layer.name && l.z === layer.z);
        if (!there) return [];
        const plane = planeOf(b.size, layer.z, camera);
        return layer.items.flatMap((item) => {
          if (item._tag !== 'Plate' || plateAt(item, end).alpha <= 0) return [];
          const [x, y] = middleAt(item, end);
          const [sx, sy] = [x * plane.scale + plane.ox, y * plane.scale + plane.oy];
          if (sx < 0 || sy < 0 || sx > b.size.width || sy > b.size.height) return [];
          const kept = there.items.some((other) => {
            if (other._tag !== 'Plate' || other.file !== item.file) return false;
            const [ox, oy] = middleAt(other, start);
            return plateAt(other, start).alpha > 0 && Math.hypot(ox - x, oy - y) <= 2;
          });
          if (kept) return [];
          return [`${a.id} > ${b.id}: ${item.file} at ${x.toFixed(0)},${y.toFixed(0)}`];
        });
      });
    });
    expect(dropped).toEqual([]);
  });

  test('hands the bottle off with no gap and no overlap: at every frame of cold-letter exactly one of his hand and the table’s plate shows it, as at every frame of generated set-downs (start, length, frame phase), and a plate set at 0.8 of the turn leaves a gap (round 3, M4)', () => {
    const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
    const lead = letter && figuresOf(letter).find(({ figure }) => figure.name === 'lead')?.figure;
    const plate = letter?.layers
      .flatMap((l) => l.items)
      .find((item): item is Plate => item._tag === 'Plate' && item.file.endsWith('/bottle.png'));
    if (!letter || !lead || !plate)
      return expect([letter?.id, lead?.name, plate?.file]).toEqual(['cold-letter', 'lead', '']);
    expect(handOffMisses(lead, plate, timesOf(letter))).toEqual([]);
    const misses = Array.from({ length: 64 }, (_, seed) => {
      const draw = rng(seed + 1);
      const fps = [24, 30, 60][Math.floor(draw() * 3)] ?? 30;
      const [at, dur, phase] = [0.2 + draw() * 5, 0.25 + draw() * 1.25, draw() / fps];
      const setDown = turn(at, dur, 'bottle', 'down');
      const held = figure(['bottle', 'down'], {
        name: 'lead',
        member: 'lead-feast',
        sheet: 'iio-table',
        at: { x: 0, ground: 0 },
        spans: [hold(0, at, 'bottle'), setDown, hold(at + dur, at + dur + 1, 'down')],
      });
      const times = Array.from(
        { length: Math.ceil((at + dur + 1) * fps) },
        (_, k) => k / fps + phase,
      );
      return [
        seed,
        handOffMisses(held, bottleSetDown(swapOf(setDown), at + dur + SETTLE), times).length,
        handOffMisses(held, bottleSetDown(at + dur * 0.8, at + dur + SETTLE), times).length > 0,
      ];
    });
    expect(misses.filter(([, gaps, late]) => gaps !== 0 || late !== true)).toEqual([]);
  });

  it.effect(
    'carries the bottle from his hand to the table in cold-letter with no jump: from frame to frame the bottle’s cream, read on the drawing that shows it (his cell or the plate), moves at most a hand’s width, and a plate set down with no travel jumps (critique 2, finding 6)',
    () =>
      Effect.gen(function* () {
        const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
        const lead =
          letter && figuresOf(letter).find(({ figure }) => figure.name === 'lead')?.figure;
        const plate = letter?.layers
          .flatMap((l) => l.items)
          .find(
            (item): item is Plate => item._tag === 'Plate' && item.file.endsWith('/bottle.png'),
          );
        const prop = (TABLE_RECORD.props ?? []).find((p) => p.name === 'bottle');
        if (!letter || !lead || !plate?.painting || !prop)
          return expect([letter?.id, lead?.name, plate?.file, prop?.name]).toEqual([
            'cold-letter',
            'lead',
            '',
            'bottle',
          ]);
        const raw = (file: string) =>
          Effect.promise(() =>
            sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
          );
        const cells = new Map(
          yield* Effect.forEach(
            Object.entries(LEAD_TABLE_CELLS).filter(([cell]) => HOLDING.has(cell)),
            ([cell, c]) =>
              Effect.map(
                raw(c.png),
                (r) => [cell, { middle: middleOf(r, prop.base, 0), ax: c.ax, ay: c.ay }] as const,
              ),
          ),
        );
        const onPlate = middleOf(yield* raw(plate.painting.png), prop.base, CREAM_REACH);
        const s = drawScaleOf(lead.member, lead.sheet, letter.headPx, 1);
        const bottleAt = (p: Plate, t: number) => {
          const pose = poseAt(lead, t);
          const held = cells.get(pose.cell);
          if (held)
            return [
              pose.x + (held.middle[0] - held.ax) * s * pose.sx,
              pose.y + (held.middle[1] - held.ay) * s * pose.sy * pose.breath,
            ] as const;
          if (plateAt(p, t).alpha > 0) return pointOn(p, t, onPlate);
          return [Number.NaN, Number.NaN] as const;
        };
        const jumps = (p: Plate) => {
          const times = timesOf(letter);
          return times.slice(1).flatMap((t, i) => {
            const [a, b] = [bottleAt(p, times[i] ?? 0), bottleAt(p, t)];
            const step = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (step <= MAX_STEP) return [];
            return [`frame ${i + 1}: ${step.toFixed(1)} px`];
          });
        };
        expect(jumps(plate)).toEqual([]);
        const swap = timesOf(letter).find((t) => !HOLDING.has(poseAt(lead, t).cell)) ?? 0;
        expect(jumps(bottleSetDown(swap, swap)).length).toBeGreaterThan(0);
      }),
  );
});
