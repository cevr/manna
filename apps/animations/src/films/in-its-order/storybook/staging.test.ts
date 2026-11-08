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
  swapOf,
  timesOf,
  type Turn,
  turn,
} from '../../../library/storybook/shot.ts';
import { CELLS as LEAD_MILK_CELLS } from '../../../library/cast/lead-feast/shot-sheets/iio-milk/cells.ts';
import { CELLS as VILLAGER_CELLS } from '../cast/idea-villagers/shot-sheets/iio-milk/cells.ts';
import { inItsOrder } from './index.ts';
import { drawScaleOf, key, TALL } from './kit.ts';
import LEAD_PALETTE from '../../../library/cast/lead-feast/cast-sheet/palette.json';
import { TABLE } from '../plates/plates.ts';
import { BABY_MOTHER, letterRises, TABLE_TOP_PX } from './shots/cold.ts';
import { AT_TABLE, HEAD, TABLE_TOP } from './shots/courtyard.ts';
import { TABLE_CLOSE_BOX } from './plates/table-close.ts';
import { CELLS as LEAD_TABLE_CELLS } from '../../../library/cast/lead-feast/shot-sheets/iio-table/cells.ts';
import LEAD_TABLE_RECORD from '../../../library/cast/lead-feast/shot-sheets/iio-table/record.json';
import { MEASURED } from './palettes.ts';
import { SHEET_CELLS } from './cells.ts';
import { shareOf } from '../../../library/storybook/sheet.ts';
import { DISSOLVES, DROPPER_DRY, milkPour } from './shots/milk.ts';
import { DROPPER_CLOSE } from './plates/inserts.ts';

/** The lead's table sheet's record, read for its props alone (a sheet drawn before props records none). */
const TABLE_RECORD: {
  readonly props?: ReadonlyArray<{
    readonly name: string;
    readonly base: string;
    readonly role: string;
  }>;
} = LEAD_TABLE_RECORD;

/** The sheets beyond its own a figure of act 1 may draw from, `<member> <name>` to sheet ids, each by the ruling that drew it: the lead's close (cold-ouch) and his standing milk sheet (milk-row), sheets 2 and 3 of the act's sheet table (iio-b spec), and his two-shot sheet (cold-smile, cold-ask; the orchestrator's round-2 ruling: the lead redrawn at the close size). */
const OTHER_SHEETS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['lead-feast lead', ['iio-close', 'iio-milk', 'iio-two']],
]);

/** The lead's table cells that draw the bottle in his hand. */
const HOLDING = new Set(['lift', 'bottle', 'read', 'readBlink']);

/** The lead's table cells that draw the letter in his hand: reading it, or his eyes shut a moment over the bottle as he drinks. */
const READING = new Set(['read', 'readBlink']);

/** Each of `times`, from the first at which the letter's plate shows, at which his hand (`poseAt`'s cell) and the plate (`plateAt`'s alpha) both show the letter, or neither does: a take-up shows it exactly once at every frame. */
const letterOffMisses = (lead: Figure, plate: Plate, times: ReadonlyArray<number>) => {
  const from = times.find((t) => plateAt(plate, t).alpha > 0) ?? Number.POSITIVE_INFINITY;
  return times.filter(
    (t) => t >= from && READING.has(poseAt(lead, t).cell) === plateAt(plate, t).alpha > 0,
  );
};

/** How far the bottle's foot may stand from his lowered hand, layer px: under half his round hand across (45 cell px × 0.53), so it reads as set down by that hand. */
const HAND_REACH = 12;

/**
 * The lowered hand on the viewer's right of a seated cell: the skin paint's
 * opaque pixels right of the anchor in the rows from halfway down the
 * figure (under the face and the neck) to three quarters down (above the
 * feet), as the middle across and the lowest row of that hand, in its px.
 */
const handOf = (
  raw: {
    readonly data: Buffer;
    readonly info: { readonly width: number; readonly height: number };
  },
  hex: string,
  cell: { readonly ax: number; readonly ay: number },
  tall: number,
) => {
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const { width } = raw.info;
  const ax = cell.ax;
  const [from, to] = [Math.round(cell.ay - tall / 2), Math.round(cell.ay - tall / 4)];
  const sums = { x: 0, n: 0, low: 0 };
  for (let q = from * width; q < to * width; q++) {
    const i = q * 4;
    if (q % width <= ax || raw.data.readUInt8(i + 3) <= 128) continue;
    const d = Math.hypot(
      raw.data.readUInt8(i) - channel(1),
      raw.data.readUInt8(i + 1) - channel(3),
      raw.data.readUInt8(i + 2) - channel(5),
    );
    if (d > 0) continue;
    sums.x += q % width;
    sums.n += 1;
    sums.low = Math.floor(q / width);
  }
  return [sums.x / Math.max(1, sums.n), sums.low] as const;
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

/** Each shot's push cap its spec row names, as the largest zoom over the smallest across the shot: cold-ouch's "≤ 5 %", and each named push or pull's range; the title's pull starts nearer, at 1.3, by the orchestrator's ruling on critique 1, item 9. The restage (iio-b-restage) lets cold-letter push on toward the letter to the cut (1.3), holds the two-shot's slow push (cold-smile) to 5 %, pushes in on the lead's face on the question (cold-ask, 12 %; critique 2, finding 3), pushes each insert slowly toward its words (cold-scroll 8 %, milk-book 7 %), pushes milk-pour in on the cup (10 %) and cold-what in on the question's two foods (16 %). */
const PUSH_CAPS: ReadonlyMap<string, number> = new Map([
  ['cold-baby', 1.06],
  ['cold-smile', 1.05],
  ['cold-letter', 1.3],
  ['cold-scroll', 1.08],
  ['cold-ouch', 1.05],
  ['cold-ask', 1.12],
  ['cold-what', 1.16],
  ['title', 1.3],
  ['milk-cup', 1.1],
  ['milk-book', 1.07],
  ['milk-pour', 1.1],
]);

/** The least time (s) the dropper, hovering over the cup, holds still at its resting place (within 2 px, on milk-pour's screen) in one run of frames before he waves it away, so it reads as one dropper stopping and not a blur (critique 4, fault 2). */
const DROPPER_REST_S = 0.2;

/** The plates that paint, finer, part of a plate a wider shot still shows whole (the table's middle painted for the closes), so a cut out to that shot keeps the thing they paint. */
const FINER = ['/table-close.png'] as const;

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

/** How far a registration searches each way, in layer px, and the step it reads at (every other px). */
const REGISTER_REACH = 16;
const REGISTER_STEP = 2;

/** A plate's luma and alpha at `width`×`height`, read from `part` of its PNG (its own px). */
const lumaOf = Effect.fn('staging.lumaOf')(function* (
  png: string,
  part: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
  width: number,
  height: number,
) {
  const b = yield* Effect.promise(() =>
    sharp(png).extract(part).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer(),
  );
  const luma = new Float32Array(width * height);
  const solid = new Uint8Array(width * height);
  for (let q = 0; q < width * height; q++) {
    luma[q] = 0.299 * (b[q * 4] ?? 0) + 0.587 * (b[q * 4 + 1] ?? 0) + 0.114 * (b[q * 4 + 2] ?? 0);
    solid[q] = Number((b[q * 4 + 3] ?? 0) > 127);
  }
  return { luma, solid };
});

/**
 * The shift, in layer px, that best lays `over` on the `under` plate it
 * paints again, as the shot lays both: each plate read at half size under
 * `over`'s box, and the shift of `over` within `REGISTER_REACH` whose
 * opaque pixels differ least in luma from `under`'s; [0, 0] when `over` sits
 * exactly where it paints.
 */
const registrationOf = Effect.fn('staging.registrationOf')(function* (under: Plate, over: Plate) {
  const width = Math.round(over.place.width / REGISTER_STEP);
  const height = Math.round(over.place.height / REGISTER_STEP);
  const [w, h] = under.painting?.size ?? [1, 1];
  const [sx, sy] = [under.place.width / w, under.place.height / h];
  const below = yield* lumaOf(
    under.painting?.png ?? '',
    {
      left: Math.round((over.place.x - under.place.x) / sx),
      top: Math.round((over.place.y - under.place.y) / sy),
      width: Math.round(over.place.width / sx),
      height: Math.round(over.place.height / sy),
    },
    width,
    height,
  );
  const [ow, oh] = over.painting?.size ?? [1, 1];
  const above = yield* lumaOf(
    over.painting?.png ?? '',
    { left: 0, top: 0, width: ow, height: oh },
    width,
    height,
  );
  const reach = REGISTER_REACH / REGISTER_STEP;
  const scores = Array.from({ length: (2 * reach + 1) ** 2 }, (_, i) => {
    const [dx, dy] = [(i % (2 * reach + 1)) - reach, Math.floor(i / (2 * reach + 1)) - reach];
    let [sum, n] = [0, 0];
    for (let y = reach; y < height - reach; y++)
      for (let x = reach; x < width - reach; x++) {
        const [a, b] = [y * width + x, (y + dy) * width + x + dx];
        if (!above.solid[a] || !below.solid[b]) continue;
        sum += Math.abs((above.luma[a] ?? 0) - (below.luma[b] ?? 0));
        n++;
      }
    return { dx, dy, score: sum / Math.max(1, n) };
  });
  const best = scores.toSorted((a, b) => a.score - b.score)[0] ?? { dx: 0, dy: 0 };
  return [best.dx * REGISTER_STEP, best.dy * REGISTER_STEP] as const;
});

/** A plate's middle at `t`, in its layer's px: its box moved by its key and stretched about its foot. */
const middleAt = (plate: Plate, t: number) => {
  const foot = footAt(plate, t);
  const k = plateAt(plate, t);
  return [(foot.left + foot.right) / 2, foot.y - (plate.place.height * k.sy) / 2] as const;
};

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

/** The box, in its cell's px, of the pixels exactly `hex` that `keep` admits (by column and row); none when no pixel is. */
const boxOfPaint = (
  raw: {
    readonly data: Buffer;
    readonly info: { readonly width: number; readonly height: number };
  },
  hex: string,
  keep: (x: number, y: number) => boolean,
) => {
  const want = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (let q = 0; q < raw.info.width * raw.info.height; q++) {
    const [x, y] = [q % raw.info.width, Math.floor(q / raw.info.width)];
    const i = q * 4;
    if ((raw.data[i + 3] ?? 0) <= 127 || !keep(x, y)) continue;
    if (want.some((c, k) => raw.data[i + k] !== c)) continue;
    box.left = Math.min(box.left, x);
    box.top = Math.min(box.top, y);
    box.right = Math.max(box.right, x);
    box.bottom = Math.max(box.bottom, y);
  }
  return Option.some(box).pipe(Option.filter((b) => b.right >= b.left));
};

/** The letter his table sheet's `read` cell holds, in its px: the parchment (the bottle's cream left of his soles' centre, the scroll on the picture's left) and its lower roller (his hair's brown or his sandals' left of that centre, in the 30 rows under the parchment's foot). */
const heldLetterOf = Effect.fn('staging.heldLetterOf')(function* () {
  const read = LEAD_TABLE_CELLS.read;
  const raw = yield* Effect.promise(() =>
    sharp(read.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  );
  const cream = (TABLE_RECORD.props ?? []).find((p) => p.name === 'bottle')?.base ?? '';
  const parchment = boxOfPaint(raw, cream, (x) => x < read.ax);
  const roller = Option.flatMap(
    parchment,
    (p) =>
      LEAD_PALETTE.parts
        .filter((part) => part.name === 'hair' || part.name === 'sandals')
        .map((part) =>
          boxOfPaint(
            raw,
            part.base,
            (x, y) => x < read.ax && y > p.bottom - 4 && y <= p.bottom + 30,
          ),
        )
        .find(Option.isSome) ?? Option.none(),
  );
  return { read, parchment, roller };
});

/** The least air, in frame px, between the letter he takes up in cold-letter and the bearded guest beyond him (diner 3)'s skin, from the lift to the card (critique 2, fault 1: the scroll lay on that guest's ear through the read). */
const LETTER_AIR = 12;

/** Each row of a raw drawing holding an opaque pixel (exactly `hex` when one is named), with that row's leftmost and rightmost such pixel, in its px. */
const rowEdgesOf = (
  raw: {
    readonly data: Buffer;
    readonly info: { readonly width: number; readonly height: number };
  },
  hex = '',
) => {
  const want = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const rows: Array<{ readonly y: number; readonly left: number; readonly right: number }> = [];
  for (let y = 0; y < raw.info.height; y++) {
    let [left, right] = [Infinity, -Infinity];
    for (let x = 0; x < raw.info.width; x++) {
      const i = (y * raw.info.width + x) * 4;
      if ((raw.data[i + 3] ?? 0) <= 127) continue;
      if (hex !== '' && want.some((c, k) => raw.data[i + k] !== c)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
    }
    if (right > left) rows.push({ y, left, right });
  }
  return rows;
};

/** Where a point of a figure's cell (its px) lies in its layer's px at `headPx`, on the figure's place. */
const onFigure = (
  f: Figure,
  cell: { readonly ax: number; readonly ay: number },
  headPx: number,
  p: readonly [number, number],
) => {
  const s = drawScaleOf(f.member, f.sheet, headPx, 1) * (f.size ?? 1);
  return [f.at.x + (p[0] - cell.ax) * s, f.at.ground + (p[1] - cell.ay) * s] as const;
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

  test('frames the lead’s head at a third of the frame’s height or more through cold-ouch, at the table as cold-letter leaves it: the guests staring, the diners’ plane, the letter lying rolled before him (critique 1, item 1)', () => {
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
    expect(membersIn(letter).filter((m) => !membersIn(ouch).includes(m))).toEqual([]);
    expect(figuresOf(ouch).length).toBeGreaterThanOrEqual(7);
    const cellAt = (shot: typeof ouch, name: string, t: number) =>
      figuresOf(shot)
        .filter(({ figure }) => figure.name === name)
        .map(({ figure }) => poseAt(figure, t).cell);
    const guestsAt = (shot: typeof ouch, t: number) =>
      ['man', 'woman'].flatMap((name) => cellAt(shot, name, t));
    expect(guestsAt(ouch, 0)).toEqual(guestsAt(letter, letter.duration - 1 / letter.fps));
    expect(
      table?.items.some((i) => i._tag === 'Plate' && i.file.endsWith('/scroll-rolled.png')),
    ).toBe(true);
  });

  test('cuts in on `smile` to a close two-shot of the lead and the man: each head at least a quarter of the frame’s height at every frame to `letter` (its cell’s head × his sheet’s draw scale × his size × the zoom ÷ the frame’s height), each changing key in it, the man’s smile landing within 0.5 s of the mark (the owner, ask a11de5e2b65: “close two-shot with reactions”)', () => {
    const smile = placed.find(({ shot }) => shot.id === 'cold-smile');
    if (!smile) return expect(smile).toBeDefined();
    const shot = smile.shot;
    const pair = ['lead', 'man'].flatMap((name) =>
      figuresOf(shot)
        .filter(({ figure }) => figure.name === name)
        .map(({ figure }) => figure),
    );
    expect(pair.map((f) => f.member)).toEqual(['lead-feast', 'feast-guest-man']);
    const headAt = (f: Figure, t: number) => {
      const cell = SHEET_CELLS.get(`${f.member}/${f.sheet}`)?.cells[poseAt(f, t).cell];
      const s = drawScaleOf(f.member, f.sheet, shot.headPx, 1);
      return (
        ((cell?.head ?? 0) * s * (f.size ?? 1) * cameraAt(shot.camera, t).zoom) / shot.size.height
      );
    };
    const times = timesOf(shot);
    expect(pair.map((f) => Math.min(...times.map((t) => headAt(f, t))) >= 1 / 3 - 0.005)).toEqual([
      true,
      true,
    ]);
    const changes = (f: Figure) =>
      times.filter((t, i) => i > 0 && poseAt(f, t).cell !== poseAt(f, times[i - 1] ?? 0).cell);
    expect(pair.map((f) => changes(f).length > 0)).toEqual([true, true]);
    const [lead, man] = pair;
    if (!man || !lead) return;
    expect(changes(man)[0]).toBeLessThanOrEqual(0.5);
    expect(poseAt(man, shot.duration - 1 / shot.fps).cell).toBe('laugh');
    expect(times.map((t) => poseAt(lead, t).cell).filter((c, i, all) => c !== all[i - 1])).toEqual([
      'bottle',
      'grin',
      'tuck',
    ]);
    expect(
      shot.layers
        .find((l) => l.name === 'table')
        ?.items.filter((i) => i._tag === 'Figure')
        .map((i) => i.name),
    ).toEqual(['man', 'lead']);
    expect(figuresOf(shot).map(({ figure }) => figure.name)).toEqual(['man', 'lead']);
  });

  test('asks the film’s question on faces that ask: from `what` to `why` the two-shot again, the camera pushing in on the lead, his head a third of the frame and more, his eyes up to the viewer (`ask`), the man’s brows raised in his puzzled stare, then turning to the viewer in his wondering look (`wonder`), no smiling cell on either (critique 1, finding 4; critique 2, finding 3: the man’s smile read as cheerful on the question)', () => {
    const ask = placed.find(({ shot }) => shot.id === 'cold-ask')?.shot;
    if (!ask) return expect(ask).toBeDefined();
    const lead = figuresOf(ask).find(({ figure }) => figure.name === 'lead')?.figure;
    const man = figuresOf(ask).find(({ figure }) => figure.name === 'man')?.figure;
    if (!lead || !man) return expect([lead?.name, man?.name]).toEqual(['lead', 'man']);
    const times = timesOf(ask);
    expect(new Set(times.map((t) => poseAt(lead, t).cell))).toEqual(new Set(['ask']));
    const manCells = times.map((t) => poseAt(man, t).cell);
    expect(manCells[0]).toBe('stare');
    expect(manCells.at(-1)).toBe('wonder');
    expect(new Set(manCells)).toEqual(new Set(['stare', 'wonder']));
    const zooms = times.map((t) => cameraAt(ask.camera, t).zoom);
    expect(Math.min(...zooms) * ask.headPx).toBeGreaterThanOrEqual(
      (1 / 3 - 0.005) * ask.size.height,
    );
    expect((zooms.at(-1) ?? 0) / (zooms[0] ?? 1)).toBeGreaterThan(1.05);
  });

  test('frames cold-letter close on the three at the table after the two-shot, never the wide row: each figure at the table a head of a quarter of the frame’s height and more at every frame (its cell’s head × its sheet’s draw scale × its size × the zoom ÷ the frame’s height), and no more than one diner behind them (critique 2, finding 2; verifier r2, M3)', () => {
    const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
    if (!letter) return expect(letter).toBeDefined();
    const atTable = letter.layers.find((l) => l.name === 'table');
    const people = (atTable?.items ?? []).filter((i): i is Figure => i._tag === 'Figure');
    expect(people.map((f) => f.name).toSorted()).toEqual(['lead', 'man', 'woman']);
    const small = people.flatMap((f) =>
      timesOf(letter).flatMap((t) => {
        const cell = SHEET_CELLS.get(`${f.member}/${f.sheet}`)?.cells[poseAt(f, t).cell];
        const s = drawScaleOf(f.member, f.sheet, letter.headPx, 1);
        const share =
          ((cell?.head ?? 0) * s * (f.size ?? 1) * cameraAt(letter.camera, t).zoom) /
          letter.size.height;
        if (share >= 1 / 4) return [];
        return [`${f.name} at ${t.toFixed(2)} s: ${share.toFixed(3)}`];
      }),
    );
    expect(small.slice(0, 3)).toEqual([]);
    const diners = figuresOf(letter).filter(({ layer }) => layer.name === 'diners');
    expect(diners.map(({ figure }) => figure.name)).toEqual(['diner-3']);
  });

  test('keeps one scroll and one bottle across the cuts from the two-shot to the question: the bottle in his hand (a holding cell) through cold-smile and cold-letter, never also on the table there, and on the table, where his lowered hand set it, through cold-ouch and cold-ask; the scroll first in cold-letter, coming up from behind the table into his hand (never above the frame or over his head), one at every frame it shows, and lying rolled on the table after (critique 2, finding 2: a scroll flashed on his head, then two letters)', () => {
    const shot = (id: string) => placed.find((p) => p.shot.id === id)?.shot;
    const [smile, letter, ouch, ask] = ['cold-smile', 'cold-letter', 'cold-ouch', 'cold-ask'].map(
      shot,
    );
    if (!smile || !letter || !ouch || !ask)
      return expect([smile?.id, letter?.id, ouch?.id, ask?.id]).toEqual([
        'cold-smile',
        'cold-letter',
        'cold-ouch',
        'cold-ask',
      ]);
    const leadOf = (s: typeof smile) =>
      figuresOf(s).find(({ figure }) => figure.name === 'lead')?.figure;
    const plates = (s: typeof smile, file: string) =>
      platesOf(s).filter((p) => p.file.endsWith(file));
    const holding = new Set([...HOLDING, 'bottle', 'grin', 'tuck']);
    const misses = [
      ...[smile, letter].flatMap((s) => {
        const lead = leadOf(s);
        return [
          ...timesOf(s)
            .filter((t) => !lead || !holding.has(poseAt(lead, t).cell))
            .slice(0, 1)
            .map((t) => `${s.id}: bottle not in his hand at ${t.toFixed(2)} s`),
          ...plates(s, '/bottle.png').map(() => `${s.id}: a bottle on the table too`),
        ];
      }),
      ...[ouch, ask].flatMap((s) => {
        const [bottle, ...more] = plates(s, '/bottle.png');
        const [scroll, ...others] = plates(s, '/scroll-rolled.png');
        return [
          ...[`${s.id}: ${1 + more.length} bottles`].filter(() => !bottle || more.length > 0),
          ...[`${s.id}: ${1 + others.length} scrolls`].filter(() => !scroll || others.length > 0),
          ...timesOf(s)
            .filter(
              (t) =>
                !bottle || !scroll || plateAt(bottle, t).alpha < 1 || plateAt(scroll, t).alpha < 1,
            )
            .slice(0, 1)
            .map((t) => `${s.id}: bottle or scroll not on the table at ${t.toFixed(2)} s`),
        ];
      }),
      ...plates(smile, '/scroll-').map(() => 'cold-smile: a scroll before the letter'),
    ];
    expect(misses).toEqual([]);
    const [rising, ...extra] = plates(letter, '/scroll-rolled.png');
    if (!rising) return expect(rising).toBeDefined();
    expect(extra).toEqual([]);
    const lead = leadOf(letter);
    if (!lead) return expect(lead).toBeDefined();
    const shown = timesOf(letter).filter((t) => plateAt(rising, t).alpha > 0);
    const first = shown[0] ?? 0;
    expect(footAt(rising, first).y - rising.place.height).toBeGreaterThanOrEqual(TABLE_TOP.y);
    const crown = AT_TABLE.lead.crown;
    expect(shown.filter((t) => middleAt(rising, t)[1] < crown)).toEqual([]);
    expect(letterOffMisses(lead, rising, timesOf(letter))).toEqual([]);
  });

  test('keeps the dropper in milk-pour dry over the milk: its plate is drawn only under its reveal’s discs, every disc above its glass tip’s foot, so the drop its drawing hangs under the tip never shows; and it is drawn back from the cup on “nothing”, the frame that word starts or the next, never resting there after (critique 2, finding 1: a drop formed over the cup on “with nothing mixed in”)', () => {
    const p = placed.find(({ shot }) => shot.id === 'milk-pour');
    const dropper = p && platesOf(p.shot).find((x) => x.file.endsWith('/milk-dropper-close.png'));
    if (!p || !dropper) return expect(dropper).toBeDefined();
    expect(dropper.reveal?.brush).toEqual(DROPPER_DRY.brush);
    const low = (dropper.reveal?.brush ?? []).filter(([, y, r]) => y + r > DROPPER_DRY.tip);
    expect(low).toEqual([]);
    expect(dropper.reveal && dropper.reveal.to <= 0).toBe(true);
    expect(DROPPER_DRY.tip).toBeLessThan(DROPPER_CLOSE.size[1]);
    const away = Object.fromEntries(
      Object.entries(milkPour.cues['away'] ?? {}).filter(([k]) => ['mark', 'word'].includes(k)),
    );
    expect(away).toEqual({ mark: 'mixed', word: 'nothing' });
    expect(
      Number(Object.entries(milkPour.cues['away'] ?? {}).find(([k]) => k === 'offset')?.[1] ?? 0),
    ).toBeLessThanOrEqual(0.1);
    const at = (p.scene.cues.get('milk-pour:away')?.start ?? 0) - (p.shot.from ?? 0);
    const rest = { ...dropper, moves: [] };
    const off = (t: number) => {
      const [a, b] = [middleAt(dropper, t), middleAt(rest, t)];
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    };
    const resting = timesOf(p.shot).filter((t) => plateAt(dropper, t).alpha > 0 && off(t) <= 2);
    expect(resting.length).toBeGreaterThan(0);
    expect(Math.max(...resting)).toBeLessThanOrEqual(at + 2 / p.shot.fps + 1e-6);
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
    expect(turned('woman')).toEqual(['smile']);
  });

  test('draws each figure from one sheet across act 1’s shots, a sheet a ruling names aside (critique 3, finding 7: the title drew the woman from take 5’s sheet, the cold open from her table sheet)', () => {
    const sheets = new Map<string, Set<string>>();
    for (const { shot } of placed)
      for (const { figure: f } of figuresOf(shot)) {
        const name = `${f.member} ${f.name}`;
        sheets.set(name, (sheets.get(name) ?? new Set()).add(f.sheet));
      }
    expect(
      [...sheets].flatMap(([name, used]) => {
        const ruled = OTHER_SHEETS.get(name) ?? [];
        const extra = [...used].filter((s) => !ruled.includes(s));
        if (extra.length <= 1) return [];
        return [`${name}: ${[...used].join(', ')}`];
      }),
    ).toEqual([]);
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

  test('seats cold-baby’s four diners near behind the mother as the panel does: two pairs, one either side of her, each pair shoulder to shoulder, each head on screen at least 0.35 of hers (the panel 0.41; the far row 0.19; the owner, critique 2 finding 8)', () => {
    const baby = placed.find(({ shot }) => shot.id === 'cold-baby')?.shot;
    if (!baby) return expect(baby).toBeDefined();
    const all = figuresOf(baby);
    const mother = all.find(({ figure }) => figure.name === 'mother');
    const diners = all.filter(({ figure }) => figure.name.startsWith('diner-'));
    if (!mother) return expect(mother).toBeDefined();
    const headOf = ({ layer, figure: f }: (typeof all)[number]) =>
      (baby.headPx *
        Option.match(Option.fromUndefinedOr(SHEET_CELLS.get(`${f.member}/${f.sheet}`)), {
          onNone: () => 1,
          onSome: (c) => shareOf(c.palette, f.sheet),
        })) /
      layer.z;
    const sides = diners
      .map(({ figure }) => figure.at.x)
      .toSorted((a, b) => a - b)
      .map((x) => Number(x > mother.figure.at.x));
    expect(sides).toEqual([0, 0, 1, 1]);
    const xs = diners.map(({ figure }) => figure.at.x).toSorted((a, b) => a - b);
    expect([(xs[1] ?? 0) - (xs[0] ?? 0), (xs[3] ?? 0) - (xs[2] ?? 0)].every((d) => d <= 200)).toBe(
      true,
    );
    const small = diners.filter((d) => headOf(d) < 0.35 * headOf(mother)).map((d) => d.figure.name);
    expect(small).toEqual([]);
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

  it.effect(
    'takes the letter up in cold-letter and reads it, from the bottle lowered to his chest, the bottle at his mouth, to the cut; no shot lays a scroll open, and the rolled scroll on the table is the one he holds, its rollers within a tenth of his held rollers’ length (owner, scrawl 0:21: “this looks a bit stretched … he holds it with one hand and the bottle in the other and he looks at the scroll while drinking”)',
    () =>
      Effect.gen(function* () {
        const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
        const lead =
          letter && figuresOf(letter).find(({ figure }) => figure.name === 'lead')?.figure;
        const open = placed.flatMap(({ shot }) =>
          platesOf(shot)
            .filter((p) => p.file.endsWith('/scroll-open.png'))
            .map((p) => `${shot.id} lays ${p.file}`),
        );
        expect(open).toEqual([]);
        if (!letter || !lead)
          return expect([letter?.id, lead?.name]).toEqual(['cold-letter', 'lead']);
        const end = letter.duration - 1 / letter.fps;
        expect([poseAt(lead, 0).cell, poseAt(lead, end).cell]).toEqual(['lift', 'read']);
        const rolled = placed.flatMap(({ shot }) =>
          platesOf(shot).filter((p) => p.file.endsWith('/scroll-rolled.png')),
        );
        expect(rolled.length).toBe(3);
        const read = LEAD_TABLE_CELLS.read;
        const raw = yield* Effect.promise(() =>
          sharp(read.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
        );
        const crown = firstInkedRow(raw);
        const [below, above] = [0.4, 0.7].map((k) => Math.round(crown + k * (read.ay - crown)));
        const band = {
          data: raw.data.subarray(
            (below ?? 0) * raw.info.width * 4,
            (above ?? 0) * raw.info.width * 4,
          ),
          info: { width: raw.info.width, height: (above ?? 0) - (below ?? 0) },
        };
        const browns = LEAD_PALETTE.parts
          .filter((p) => p.name === 'sandals' || p.name === 'hair')
          .map((p) => p.base);
        const s = drawScaleOf(lead.member, lead.sheet, letter.headPx, 1);
        const held = (Math.max(...browns.map((b) => widestRun(band, b, 0))) + 6) * s;
        expect(held).toBeGreaterThan(0);
        expect(rolled.map((p) => Math.abs(p.place.width / held - 1) <= 0.1)).toEqual([
          true,
          true,
          true,
        ]);
      }),
  );

  it.effect(
    'keeps the bottle in his hand through cold-letter and stands it on the table top through cold-ouch, after the card: his table sheet records its cream bottle as a measured prop, and the plate’s cream body across is the held bottle’s, read on both drawings (critique 1, items 6 and 7)',
    () =>
      Effect.gen(function* () {
        const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
        const ouch = placed.find(({ shot }) => shot.id === 'cold-ouch')?.shot;
        const lead =
          letter && figuresOf(letter).find(({ figure }) => figure.name === 'lead')?.figure;
        const prop = (TABLE_RECORD.props ?? []).find((p) => p.name === 'bottle');
        const measured = MEASURED.some(
          (m) =>
            m.member === 'lead-feast' && m.hex === prop?.base && m.source.includes('iio-table'),
        );
        const bottle = ouch?.layers
          .flatMap((l) => l.items)
          .find((item) => item._tag === 'Plate' && item.file.endsWith('/bottle.png'));
        const png = bottle?._tag === 'Plate' && bottle.painting;
        if (!letter || !ouch || !lead || !prop || !measured || bottle?._tag !== 'Plate' || !png)
          return expect([letter?.id, lead?.name, prop?.role, measured, bottle?._tag]).toEqual([
            'cold-letter',
            'lead',
            'prop',
            true,
            'Plate',
          ]);
        expect(platesOf(letter).filter((p) => p.file.endsWith('/bottle.png'))).toEqual([]);
        expect(timesOf(letter).filter((t) => !HOLDING.has(poseAt(lead, t).cell))).toEqual([]);
        const times = timesOf(ouch);
        expect(times.filter((t) => plateAt(bottle, t).alpha <= 0)).toEqual([]);
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

  test('moves the dropper in milk-pour no farther a frame than its own width on screen, and rests it at the cup at least 0.2 s, its middle within 2 px of its place there, large: a third of the frame’s height or more (critique 4, fault 2: 0.8 s legs stepped up to 51 px a frame and left the cup the frame it arrived; critique 1, finding 1: a speck at phone size)', () => {
    const pour = placed.find(({ shot }) => shot.id === 'milk-pour')?.shot;
    if (!pour) return expect(pour).toBeDefined();
    const found = pour.layers.flatMap((layer) =>
      layer.items.flatMap((item) => {
        if (item._tag !== 'Plate' || !item.file.endsWith('/milk-dropper-close.png')) return [];
        return [{ plate: item, z: layer.z }];
      }),
    );
    expect(found).toHaveLength(1);
    const [dropper] = found;
    if (!dropper) return;
    expect(dropper.plate.place.height / pour.size.height).toBeGreaterThanOrEqual(1 / 3);
    const DROPPER_WIDTH_PX = dropper.plate.place.width;
    const onScreen = (t: number, middle: readonly [number, number]) => {
      const plane = planeOf(pour.size, dropper.z, cameraAt(pour.camera, t));
      return [middle[0] * plane.scale + plane.ox, middle[1] * plane.scale + plane.oy] as const;
    };
    const rest = { ...dropper.plate, moves: [] };
    const frames = timesOf(pour).map((t) => ({
      shown: plateAt(dropper.plate, t).alpha > 0,
      at: onScreen(t, middleAt(dropper.plate, t)),
      place: onScreen(t, middleAt(rest, t)),
    }));
    const steps = frames.slice(1).flatMap((f, i) => {
      const was = frames[i];
      if (!was?.shown || !f.shown) return [];
      return [Math.hypot(f.at[0] - was.at[0], f.at[1] - was.at[1])];
    });
    const resting = frames.map(
      (f) => f.shown && Math.hypot(f.at[0] - f.place[0], f.at[1] - f.place[1]) <= 2,
    );
    const rested = resting.reduce(
      (acc, r) => {
        const run = Number(r) * (acc.run + 1);
        return { run, best: Math.max(acc.best, run) };
      },
      { run: 0, best: 0 },
    ).best;
    expect(steps.length).toBeGreaterThan(30);
    const misses = [
      ...steps.flatMap((step, i) => {
        if (step <= DROPPER_WIDTH_PX) return [];
        return [`step ${i + 1} of the dropper's: ${step.toFixed(1)} px`];
      }),
      ...[rested / pour.fps].flatMap((s) => {
        if (s >= DROPPER_REST_S) return [];
        return [`rests ${rested} frames (${s.toFixed(2)} s) at the cup`];
      }),
    ];
    expect(misses).toEqual([]);
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
    expect(pairs.map(([a, b]) => `${a.id}>${b.id}`)).toContain('cold-smile>cold-letter');
    const dropped = pairs.flatMap(([a, b]) => {
      const [end, start] = [timesOf(a).at(-1) ?? 0, timesOf(b)[0] ?? 0];
      const camera = cameraAt(b.camera, start);
      return a.layers.flatMap((layer) => {
        const there = b.layers.find((l) => l.name === layer.name && l.z === layer.z);
        if (!there) return [];
        const plane = planeOf(b.size, layer.z, camera);
        return layer.items.flatMap((item) => {
          if (item._tag !== 'Plate' || plateAt(item, end).alpha <= 0) return [];
          if (FINER.some((f) => item.file.endsWith(f))) return [];
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

  test('paints the table cold-ouch shows at 1.5× its own px or less: at every frame the last plate of the table’s plane that covers the whole frame there is enlarged at most 1.5×, as a figure is (owner, critique 2 finding 7: the whole table at the close’s 3.3–3.47× was soft beside the crisp figures and scroll)', () => {
    const shot = placed.find((p) => p.shot.id === 'cold-ouch')?.shot;
    const tableLayer = shot?.layers.find((l) => l.name === 'table');
    expect(shot).toBeDefined();
    if (!shot) return;
    const misses = timesOf(shot).flatMap((t, frame) => {
      if (!tableLayer) return [`frame ${frame}: no table`];
      const plane = planeOf(shot.size, tableLayer.z, cameraAt(shot.camera, t));
      const [left, top] = [-plane.ox / plane.scale, -plane.oy / plane.scale];
      const [right, bottom] = [
        (shot.size.width - plane.ox) / plane.scale,
        (shot.size.height - plane.oy) / plane.scale,
      ];
      const cover = tableLayer.items.findLast(
        (item): item is Plate =>
          item._tag === 'Plate' &&
          plateAt(item, t).alpha > 0 &&
          item.place.x <= left &&
          item.place.y <= top &&
          item.place.x + item.place.width >= right &&
          item.place.y + item.place.height >= bottom,
      );
      if (!cover) return [`frame ${frame}: no plate covers the frame`];
      const enlarged = (plane.scale * cover.place.width) / (cover.painting?.size[0] ?? 1);
      if (enlarged <= 1.5) return [];
      return [`frame ${frame}: ${cover.file} enlarged ${enlarged.toFixed(2)}×`];
    });
    expect(misses).toEqual([]);
  });

  it.effect(
    'lays the close’s table plate exactly over the table it paints again: its alpha, brought to the box’s size, agrees with `table.png`’s in the box (overlap over union 0.95 or more) and its mean colour lies within 12 of the box’s, channel by channel',
    () =>
      Effect.gen(function* () {
        const { x, y, width, height } = TABLE_CLOSE_BOX;
        const read = (input: Promise<Buffer>) =>
          Effect.promise(() => input.then((b) => sharp(b).ensureAlpha().raw().toBuffer()));
        const theirs = yield* read(
          sharp(`${import.meta.dir}/../plates/table.png`)
            .extract({ left: x, top: y, width, height })
            .png()
            .toBuffer(),
        );
        const mine = yield* read(
          sharp(`${import.meta.dir}/plates/table-close.png`)
            .resize(width, height)
            .png()
            .toBuffer(),
        );
        const opaque = (b: Buffer, q: number) => (b[q * 4 + 3] ?? 0) > 127;
        const counts = { both: 0, either: 0 };
        const sums = { mine: [0, 0, 0], theirs: [0, 0, 0] };
        for (let q = 0; q < width * height; q++) {
          const [a, b] = [opaque(mine, q), opaque(theirs, q)];
          if (a || b) counts.either++;
          if (!a || !b) continue;
          counts.both++;
          for (const c of [0, 1, 2]) {
            sums.mine[c] = (sums.mine[c] ?? 0) + (mine[q * 4 + c] ?? 0);
            sums.theirs[c] = (sums.theirs[c] ?? 0) + (theirs[q * 4 + c] ?? 0);
          }
        }
        const apart = [0, 1, 2].map(
          (c) => Math.abs((sums.mine[c] ?? 0) - (sums.theirs[c] ?? 0)) / Math.max(1, counts.both),
        );
        expect(counts.both / Math.max(1, counts.either)).toBeGreaterThanOrEqual(0.95);
        expect(apart.filter((d) => d > 12)).toEqual([]);
      }),
  );

  it.effect(
    'places the close’s table plate in cold-ouch where it paints the table: laid as the shot lays it, its pixels agree best with `table.png`’s under it at no shift (within 2 layer px, searched 16 px each way), and the same plate laid 10 px off is found 10 px off (verifier r1: a 10 px shift of `tableClose()` left every staging test green)',
    () =>
      Effect.gen(function* () {
        const ouch = placed.find((p) => p.shot.id === 'cold-ouch')?.shot;
        const plates = (ouch?.layers.find((l) => l.name === 'table')?.items ?? []).filter(
          (item): item is Plate => item._tag === 'Plate',
        );
        const whole = plates.find((p) => p.file.endsWith('/table.png'));
        const close = plates.find((p) => p.file.endsWith('/table-close.png'));
        expect([whole?.moves ?? [], close?.moves ?? []]).toEqual([[], []]);
        if (!whole?.painting || !close?.painting) return expect(close?.file).toBe('table-close');
        const registered = yield* registrationOf(whole, close);
        const shifted = yield* registrationOf(whole, {
          ...close,
          place: { ...close.place, x: close.place.x + 10 },
        });
        expect(registered.map((d) => Math.abs(d) <= 2)).toEqual([true, true]);
        expect(shifted.map((d) => Math.round(d))).toEqual([-10, 0]);
      }),
  );

  test('hands the letter off with no gap and no overlap: from the frame the rolled scroll first shows, at every frame of cold-letter exactly one of the rising plate and his reading hand shows it, as at every frame of generated take-ups (rise, frame phase), and a plate gone at 0.8 of the turn leaves a gap', () => {
    const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
    const lead = letter && figuresOf(letter).find(({ figure }) => figure.name === 'lead')?.figure;
    const plate = letter?.layers
      .flatMap((l) => l.items)
      .find(
        (item): item is Plate => item._tag === 'Plate' && item.file.endsWith('/scroll-rolled.png'),
      );
    if (!letter || !lead || !plate)
      return expect([letter?.id, lead?.name, plate?.file]).toEqual(['cold-letter', 'lead', '']);
    expect(timesOf(letter).some((t) => plateAt(plate, t).alpha > 0)).toBe(true);
    expect(letterOffMisses(lead, plate, timesOf(letter))).toEqual([]);
    const misses = Array.from({ length: 64 }, (_, seed) => {
      const draw = rng(seed + 1);
      const fps = [24, 30, 60][Math.floor(draw() * 3)] ?? 30;
      const [at, dur, phase] = [0.2 + draw() * 3, 0.25 + draw() * 1.25, draw() / fps];
      const take = turn(at, dur, 'bottle', 'read');
      const held = figure(['bottle', 'read'], {
        name: 'lead',
        member: 'lead-feast',
        sheet: 'iio-table',
        at: { x: 0, ground: 0 },
        spans: [hold(0, at, 'bottle'), take, hold(at + dur, at + dur + 1, 'read')],
      });
      const times = Array.from(
        { length: Math.ceil((at + dur + 1) * fps) },
        (_, k) => k / fps + phase,
      );
      return [
        seed,
        letterOffMisses(held, letterRises({ start: at, end: swapOf(take) }), times).length,
        letterOffMisses(held, letterRises({ start: at, end: at + dur * 0.8 }), times).length > 0,
      ];
    });
    expect(misses.filter(([, gaps, late]) => gaps !== 0 || late !== true)).toEqual([]);
  });

  it.effect(
    'brings the rolled letter up to his reading hand before the swap: it shows no sooner than he reaches, and at the last frame it shows its middle lies within its own height of the middle of the parchment his `read` cell holds, read on that cell (critique 1, finding 4: the roll vanished from the table as the open scroll appeared 180 px higher)',
    () =>
      Effect.gen(function* () {
        const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
        const lead =
          letter && figuresOf(letter).find(({ figure }) => figure.name === 'lead')?.figure;
        const plate = letter && platesOf(letter).find((p) => p.file.endsWith('/scroll-rolled.png'));
        const held = yield* heldLetterOf();
        if (!letter || !lead || !plate || Option.isNone(held.parchment))
          return expect([letter?.id, lead?.name, plate?.file, held.parchment._tag]).toEqual([
            'cold-letter',
            'lead',
            '',
            'Some',
          ]);
        const shown = timesOf(letter).filter((t) => plateAt(plate, t).alpha > 0);
        const last = shown.at(-1) ?? 0;
        const p = held.parchment.value;
        const [tx, ty] = onFigure(lead, held.read, letter.headPx, [
          (p.left + p.right) / 2,
          (p.top + p.bottom) / 2,
        ]);
        const [mx, my] = middleAt(plate, last);
        expect(Math.hypot(mx - tx, my - ty)).toBeLessThanOrEqual(plate.place.height);
        const reaches = lead.spans
          .filter((s): s is Turn => s._tag === 'Turn' && s.to === 'read')
          .map((s) => s.at);
        const early = shown.filter((t) => plateAt(plate, t).x !== 0 && t < Math.min(...reaches));
        expect(reaches.length).toBe(1);
        expect(early).toEqual([]);
      }),
  );

  it.effect(
    'holds the letter clear of the table from the swap on: no opaque pixel of a plate laid over him in cold-letter lies over the lower roller of the scroll his `read` cell holds, read on that cell and on the plates’ own pixels (critique 1, finding 3: the roller lay in the grapes, the letter read as a card)',
    () =>
      Effect.gen(function* () {
        const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
        const items = letter?.layers.find((l) => l.name === 'table')?.items ?? [];
        const at = items.findIndex((item) => item._tag === 'Figure' && item.name === 'lead');
        const lead = items[at];
        const held = yield* heldLetterOf();
        if (!letter || lead?._tag !== 'Figure' || Option.isNone(held.roller))
          return expect([letter?.id, lead?._tag, held.roller._tag]).toEqual([
            'cold-letter',
            'Figure',
            'Some',
          ]);
        const r = held.roller.value;
        const [left, top] = onFigure(lead, held.read, letter.headPx, [r.left, r.top]);
        const [right, bottom] = onFigure(lead, held.read, letter.headPx, [
          r.right + 1,
          r.bottom + 1,
        ]);
        const reading = timesOf(letter).filter((t) => poseAt(lead, t).cell === 'read');
        expect(reading.length).toBeGreaterThan(0);
        const over = items
          .slice(at + 1)
          .filter(
            (item): item is Plate =>
              item._tag === 'Plate' &&
              !item.file.includes('/scroll-') &&
              reading.some((t) => plateAt(item, t).alpha > 0),
          );
        expect(over.length).toBeGreaterThan(0);
        const covered = yield* Effect.forEach(over, (plate) =>
          Effect.gen(function* () {
            const [w, h] = plate.painting?.size ?? [plate.place.width, plate.place.height];
            const [sx, sy] = [w / plate.place.width, h / plate.place.height];
            const part = {
              left: Math.max(0, Math.floor((left - plate.place.x) * sx)),
              top: Math.max(0, Math.floor((top - plate.place.y) * sy)),
            };
            const size = {
              width: Math.min(w, Math.ceil((right - plate.place.x) * sx)) - part.left,
              height: Math.min(h, Math.ceil((bottom - plate.place.y) * sy)) - part.top,
            };
            if (size.width <= 0 || size.height <= 0) return [];
            const { solid } = yield* lumaOf(
              plate.painting?.png ?? '',
              { ...part, ...size },
              size.width,
              size.height,
            );
            const n = solid.reduce((a, v) => a + v, 0);
            return [`${plate.file}: ${n} opaque px over the roller`].filter(() => n > 0);
          }),
        );
        expect(covered.flat()).toEqual([]);
      }),
  );

  it.effect(
    'keeps the letter he takes up in cold-letter at least 12 px on screen from the bearded guest beyond him, from his reach to the card: on every screen row they share, the left edge of the rising roll’s opaque pixels and then of his `read` cell’s, each through its own plane and the camera, against the right edge of diner 3’s skin on the cell he shows (critique 2, fault 1: the scroll lay on that guest’s ear through the read, 11 px over it)',
    () =>
      Effect.gen(function* () {
        const letter = placed.find(({ shot }) => shot.id === 'cold-letter')?.shot;
        const table = letter?.layers.find((l) => l.name === 'table');
        const diners = letter?.layers.find((l) => l.name === 'diners');
        const lead = table?.items.find(
          (i): i is Figure => i._tag === 'Figure' && i.name === 'lead',
        );
        const guest = diners?.items.find(
          (i): i is Figure => i._tag === 'Figure' && i.name === 'diner-3',
        );
        const plate = table?.items.find(
          (i): i is Plate => i._tag === 'Plate' && i.file.endsWith('/scroll-rolled.png'),
        );
        const sheet = SHEET_CELLS.get('filler-dressed/iio-diner-3');
        if (!letter || !table || !diners || !lead || !guest || !plate?.painting || !sheet)
          return expect([letter?.id, lead?.name, guest?.name, plate?.file]).toEqual([
            'cold-letter',
            'lead',
            'diner-3',
            '',
          ]);
        const raw = (png: string) =>
          Effect.promise(() =>
            sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
          );
        const skinHex = sheet.palette.parts.find((p) => p.role === 'skin')?.base ?? '';
        const times = timesOf(letter);
        const shownCells = [...new Set(times.map((t) => poseAt(guest, t).cell))];
        const skins = new Map(
          yield* Effect.forEach(shownCells, (cell) =>
            Effect.map(
              raw(sheet.cells[cell]?.png ?? ''),
              (r) => [cell, rowEdgesOf(r, skinHex)] as const,
            ),
          ),
        );
        const [roll, reading] = yield* Effect.all([
          Effect.map(raw(plate.painting.png), (r) => rowEdgesOf(r)),
          Effect.map(raw(LEAD_TABLE_CELLS.read.png), (r) => rowEdgesOf(r)),
        ]);
        const reach = Math.min(
          ...lead.spans
            .filter((s): s is Turn => s._tag === 'Turn' && s.to === 'read')
            .map((s) => s.at),
        );
        const leadScale = drawScaleOf(lead.member, lead.sheet, letter.headPx, table.z);
        const guestScale = drawScaleOf(guest.member, guest.sheet, letter.headPx, diners.z);
        type Edge = { readonly y: number; readonly left: number; readonly right: number };
        const onScreen = (
          rows: ReadonlyArray<Edge>,
          at: (x: number, y: number) => readonly [number, number],
          plane: ReturnType<typeof planeOf>,
        ) =>
          rows.map((row) => {
            const [a, b] = [at(row.left, row.y), at(row.right, row.y)];
            return {
              y: Math.round(a[1] * plane.scale + plane.oy),
              left: Math.min(a[0], b[0]) * plane.scale + plane.ox,
              right: Math.max(a[0], b[0]) * plane.scale + plane.ox,
            };
          });
        const onCell =
          (f: Figure, t: number, cell: { readonly ax: number; readonly ay: number }, s: number) =>
          (x: number, y: number) => {
            const pose = poseAt(f, t);
            return [
              pose.x + (x - cell.ax) * s * pose.sx,
              pose.y + (y - cell.ay) * s * pose.sy * pose.breath,
            ] as const;
          };
        const checked = times.filter((t) => t >= reach);
        const near = checked.flatMap((t) => {
          const camera = cameraAt(letter.camera, t);
          const front = planeOf(letter.size, table.z, camera);
          const back = planeOf(letter.size, diners.z, camera);
          const his = [
            ...onScreen(roll, (x, y) => pointOn(plate, t, [x, y]), front).filter(
              () => plateAt(plate, t).alpha > 0,
            ),
            ...onScreen(reading, onCell(lead, t, LEAD_TABLE_CELLS.read, leadScale), front).filter(
              () => poseAt(lead, t).cell === 'read',
            ),
          ];
          const pose = poseAt(guest, t);
          const cell = sheet.cells[pose.cell];
          const skin = skins.get(pose.cell);
          if (!cell || !skin) return [`${t.toFixed(2)} s: no skin for ${pose.cell}`];
          const rights = new Map<number, number>();
          for (const row of onScreen(skin, onCell(guest, t, cell, guestScale), back))
            rights.set(row.y, Math.max(rights.get(row.y) ?? -Infinity, row.right));
          const gap = Math.min(
            ...his.flatMap((row) =>
              Option.toArray(Option.fromUndefinedOr(rights.get(row.y))).map((r) => row.left - r),
            ),
          );
          if (gap >= LETTER_AIR) return [];
          return [`${t.toFixed(2)} s: ${gap.toFixed(1)} px`];
        });
        expect(checked.length).toBeGreaterThan(100);
        expect(near.slice(0, 5)).toEqual([]);
      }),
  );

  it.effect(
    'stands the bottle in cold-ouch where his lowered hand set it down, and never moves it: at every frame the plate shows in one place, its foot within half a hand of his table sheet’s `down` hand’s middle and lowest row at his place at the table, read on that cell’s skin; a plate that travels in from his raised hand fails (critique 3, finding 1)',
    () =>
      Effect.gen(function* () {
        const ouch = placed.find(({ shot }) => shot.id === 'cold-ouch')?.shot;
        const plate = ouch?.layers
          .flatMap((l) => l.items)
          .find(
            (item): item is Plate => item._tag === 'Plate' && item.file.endsWith('/bottle.png'),
          );
        if (!ouch || !plate) return expect([ouch?.id, plate?.file]).toEqual(['cold-ouch', '']);
        const down = LEAD_TABLE_CELLS.down;
        const raw = yield* Effect.promise(() =>
          sharp(down.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
        );
        const skin = LEAD_PALETTE.parts.find((p) => p.role === 'skin')?.base ?? '';
        const tall = TALL.get('lead-feast/iio-table') ?? 0;
        const hand = handOf(raw, skin, down, tall);
        const s = drawScaleOf('lead-feast', 'iio-table', ouch.headPx, 1);
        const ground = AT_TABLE.lead.crown + tall * s;
        const at = [AT_TABLE.lead.x + (hand[0] - down.ax) * s, ground + (hand[1] - down.ay) * s];
        const times = timesOf(ouch);
        const misses = (p: Plate) => {
          const shown = times.filter((t) => plateAt(p, t).alpha > 0);
          const places = new Set(
            shown.map((t) => {
              const k = plateAt(p, t);
              return [k.x, k.y, k.sx, k.sy].join();
            }),
          );
          const foot = footAt(p, times[0] ?? 0);
          const apart = Math.hypot(
            (foot.left + foot.right) / 2 - (at[0] ?? 0),
            foot.y - (at[1] ?? 0),
          );
          return [
            ...[`moves through ${places.size} places`].filter(() => places.size !== 1),
            ...[`shown ${shown.length} of ${times.length} frames`].filter(
              () => shown.length !== times.length,
            ),
            ...[`foot ${apart.toFixed(1)} px from his hand`].filter(() => !(apart <= HAND_REACH)),
          ];
        };
        expect(misses(plate)).toEqual([]);
        const travels: Plate = {
          ...plate,
          moves: [
            [0, key({ x: 20, y: -110 })],
            [0.25, key({})],
          ],
        };
        expect(misses(travels).length).toBeGreaterThan(0);
      }),
  );
});
