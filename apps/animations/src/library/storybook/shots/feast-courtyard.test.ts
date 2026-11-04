import * as BunServices from '@effect/platform-bun/BunServices';
import type { Raster } from '@manna/film/tools';
import { Effect, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import sharp from 'sharp';
import { anchorOf, APP } from '../render.ts';
import { type Box, eyeBoxesOf, faceBoxOf, hexOf, nearestOf, type Rgb, rgbAt } from '../sheet.ts';
import {
  type CameraKey,
  drawnKeyOf,
  type FigureFrame,
  type Frame,
  frameAt,
  drawOrder,
  type Plate,
  type Shot,
  timesOf,
} from '../shot.ts';
import { CAST, drawnCellOf, headsOf, loadFigures, type StoredFigure } from '../store.ts';
import { BARS, meets } from '../verify/bars.ts';
import { scaleSamples } from '../verify/measures.ts';
import { feastCourtyard } from './feast-courtyard.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const figures = await Effect.runPromise(
  loadFigures(CAST, feastCourtyard).pipe(Effect.provide(BunServices.layer)),
);

const byName = new Map(figures.map((f) => [f.figure.name, f] as const));

/** Each figure's face box per drawn key it shows, read once: its stored cells' and its blinks'. */
const faceBoxes = new Map(
  figures.map(
    (f) =>
      [
        f.figure.name,
        new Map(
          [...f.cells.keys(), ...f.blinks.keys()].map(
            (key) =>
              [key, Option.flatMap(drawnCellOf(f, key), (r) => faceBoxOf(r, f.paints))] as const,
          ),
        ),
      ] as const,
  ),
);

const heads = headsOf(figures);

/** A plate's picture as a count of its pixels that are not clear above and left of each corner: (width + 1) × (height + 1) sums, so a box's count is four reads. */
interface Coverage {
  readonly width: number;
  readonly height: number;
  readonly sums: Int32Array;
}

const coverageOf = (picture: Raster): Coverage => {
  const w = picture.width + 1;
  const sums = new Int32Array(w * (picture.height + 1));
  for (let y = 0; y < picture.height; y++)
    for (let x = 0; x < picture.width; x++)
      sums[(y + 1) * w + x + 1] =
        Number((picture.rgba[(y * picture.width + x) * 4 + 3] ?? 0) > 0) +
        (sums[y * w + x + 1] ?? 0) +
        (sums[(y + 1) * w + x] ?? 0) -
        (sums[y * w + x] ?? 0);
  return { width: picture.width, height: picture.height, sums };
};

/** A plate's picture decoded with its alpha, as its coverage. */
const plateCoverage = (plate: Plate) =>
  Effect.promise(() =>
    sharp(`${APP}/${plate.file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ).pipe(
    Effect.map(({ data, info }) =>
      coverageOf({ width: info.width, height: info.height, rgba: new Uint8Array(data) }),
    ),
  );

/** An axis-aligned rectangle in some picture's or layer's px: left, top, right, bottom. */
type Rect = readonly [number, number, number, number];

/** How many of a plate's pixels inside `rect` (in its layer's px) are not clear. */
const coverIn = (plate: Plate, picture: Coverage, rect: Rect): number => {
  const { x, y, width, height } = plate.place;
  const [sx, sy] = [picture.width / width, picture.height / height];
  const x0 = Math.min(picture.width, Math.max(0, Math.floor((rect[0] - x) * sx)));
  const y0 = Math.min(picture.height, Math.max(0, Math.floor((rect[1] - y) * sy)));
  const x1 = Math.max(x0, Math.min(picture.width, Math.ceil((rect[2] - x) * sx)));
  const y1 = Math.max(y0, Math.min(picture.height, Math.ceil((rect[3] - y) * sy)));
  const w = picture.width + 1;
  const at = (u: number, v: number) => picture.sums[v * w + u] ?? 0;
  return at(x1, y1) - at(x0, y1) - at(x1, y0) + at(x0, y0);
};

/**
 * Where a layer at depth `z` lands on screen under `camera`, as the page's
 * multiplane draws it with no drift: its pan from the frame's centre over
 * `z`, its zoom the `z`-th root of the camera's. Answers screen = layer ×
 * scale + offset.
 */
const planeOf = (z: number, camera: CameraKey) => {
  const { width: w, height: h } = feastCourtyard.size;
  const scale = camera.zoom ** (1 / z);
  const [vx, vy] = [w / 2 + (camera.x - w / 2) / z, h / 2 + (camera.y - h / 2) / z];
  return { scale, ox: w / 2 - vx * scale, oy: h / 2 - vy * scale };
};

/** Every plate the page draws after figure `name` of `shot` (`drawOrder`, then each layer's items in order), so over it, each with its layer's depth and blur. */
const platesOver = (shot: Shot, name: string) => {
  const drawn = drawOrder(shot.layers).flatMap((layer) =>
    layer.items.map((item) => ({ item, z: layer.z, blur: layer.blur })),
  );
  return drawn
    .slice(drawn.findIndex(({ item }) => item._tag === 'Figure' && item.name === name) + 1)
    .flatMap(({ item, z, blur }) => {
      if (item._tag !== 'Plate') return [];
      return [{ plate: item, z, blur }];
    });
};

/** A figure's face box in its layer's px in one frame: its drawn key's face box, placed as the page places the cell (scale, squash and breath about the anchor); none when its cell reads no lines or its drawing no face. */
const faceInLayer = (f: FigureFrame, stored: StoredFigure): Option.Option<Rect> =>
  Option.flatMap(Option.flatten(Option.fromUndefinedOr(stored.lines.get(f.cell))), (lines) =>
    Option.map(
      Option.flatten(Option.fromUndefinedOr(faceBoxes.get(stored.figure.name)?.get(drawnKeyOf(f)))),
      (b): Rect => {
        const { ax, ay } = anchorOf(lines);
        const [kx, ky] = [f.scale * f.sx, f.scale * f.sy * f.breath];
        return [
          f.x + (b.x - ax) * kx,
          f.y + (b.y - ay) * ky,
          f.x + (b.x + b.width - ax) * kx,
          f.y + (b.y + b.height - ay) * ky,
        ];
      },
    ),
  );

/** A face box in its own layer's px moved into another layer's px through the screen, grown by `spread` screen px each side. */
const intoLayer = (
  face: Rect,
  from: number,
  to: number,
  camera: CameraKey,
  spread: number,
): Rect => {
  const [a, b] = [planeOf(from, camera), planeOf(to, camera)];
  const x = (u: number, grow: number) => (u * a.scale + a.ox + grow - b.ox) / b.scale;
  const y = (v: number, grow: number) => (v * a.scale + a.oy + grow - b.oy) / b.scale;
  return [x(face[0], -spread), y(face[1], -spread), x(face[2], spread), y(face[3], spread)];
};

/** What covers each figure's face in one frame: a line per plate drawn over it with any pixel inside the face box (a blurred plate's within three blurs of it), or a line for a figure whose face reads none. */
const coversIn = (
  shot: Shot,
  frame: Frame,
  index: number,
  pictures: ReadonlyMap<string, Coverage>,
): ReadonlyArray<string> =>
  frame.figures.flatMap((f) => {
    const stored = byName.get(f.name);
    const face = Option.flatMap(Option.fromUndefinedOr(stored), (s) => faceInLayer(f, s));
    if (!stored || Option.isNone(face)) return [`${f.name} frame ${index}: no face read`];
    return platesOver(shot, f.name).flatMap(({ plate, z, blur }) => {
      const rect = intoLayer(face.value, stored.layer.z, z, frame.camera, 3 * blur);
      const n = Option.match(Option.fromUndefinedOr(pictures.get(plate.file)), {
        onNone: () => 0,
        onSome: (picture) => coverIn(plate, picture, rect),
      });
      if (n === 0) return [];
      return [`${f.name} frame ${index}: ${plate.file} covers ${n} px`];
    });
  });

/** The coverage of every plate `shot` draws over a figure, by file. */
const picturesOver = Effect.fnUntraced(function* (shot: Shot) {
  const pictures = new Map<string, Coverage>();
  for (const layer of shot.layers)
    for (const it of layer.items)
      if (it._tag === 'Figure')
        for (const { plate } of platesOver(shot, it.name))
          if (!pictures.has(plate.file)) pictures.set(plate.file, yield* plateCoverage(plate));
  return pictures;
});

/** What covers each figure's face in every frame of `shot` (`coversIn`). */
const coversOf = (shot: Shot, pictures: ReadonlyMap<string, Coverage>): ReadonlyArray<string> =>
  timesOf(shot).flatMap((t, i) => coversIn(shot, frameAt(shot, heads, t), i, pictures));

/** Each hold of the shot that blinks: its figure, its cell and its blink key. */
const blinkingHolds = figures.flatMap((f) =>
  f.figure.spans.flatMap((s) => {
    if (s._tag !== 'Hold') return [];
    return Option.toArray(Option.map(Option.fromUndefinedOr(s.blink), (eyes) => ({ f, s, eyes })));
  }),
);

/** The boxes a blink of `cell` with `eyes`'s closed eyes may change: each open eye's box, centred, grown to the closed eyes' widest and tallest and a pixel each side; none when either face reads no eyes. */
const eyeRects = (
  f: StoredFigure,
  cell: string,
  eyes: string,
): Option.Option<ReadonlyArray<Rect>> =>
  Option.map(
    Option.all([
      Option.flatMap(Option.fromUndefinedOr(f.cells.get(cell)), (r) => eyeBoxesOf(r, f.paints)),
      Option.flatMap(Option.fromUndefinedOr(f.cells.get(eyes)), (r) => eyeBoxesOf(r, f.paints)),
    ]),
    ([opened, shut]: readonly [ReadonlyArray<Box>, ReadonlyArray<Box>]) => {
      const [w, h] = [
        Math.max(...shut.map((b) => b.width)),
        Math.max(...shut.map((b) => b.height)),
      ];
      return opened.map((b): Rect => {
        const [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2];
        const [hw, hh] = [Math.max(b.width, w) / 2 + 1, Math.max(b.height, h) / 2 + 1];
        return [cx - hw, cy - hh, cx + hw, cy + hh];
      });
    },
  );

/** How many pixels of `blink` differ from `open` inside each of `rects` (by index), and those outside every rect, as `(x,y)`. */
const changesOf = (open: Raster, blink: Raster, rects: ReadonlyArray<Rect>) => {
  const [was, now] = [
    new Uint32Array(open.rgba.buffer, open.rgba.byteOffset, open.width * open.height),
    new Uint32Array(blink.rgba.buffer, blink.rgba.byteOffset, blink.width * blink.height),
  ];
  const inside = new Map<number, number>();
  const outside: Array<string> = [];
  for (let q = 0; q < open.width * open.height; q++) {
    if (was[q] === now[q]) continue;
    const [x, y] = [q % open.width, Math.floor(q / open.width)];
    const k = rects.findIndex(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
    if (k < 0) outside.push(`(${x},${y})`);
    else inside.set(k, (inside.get(k) ?? 0) + 1);
  }
  return { inside, outside };
};

/** How many pixels of `r` inside `rect` are exactly the ink. */
const inkIn = (r: Raster, rect: Rect, ink: Rgb): number => {
  let n = 0;
  for (let y = Math.max(0, Math.ceil(rect[1])); y < Math.min(r.height, rect[3]); y++)
    for (let x = Math.max(0, Math.ceil(rect[0])); x < Math.min(r.width, rect[2]); x++)
      if (hexOf(rgbAt(r, y * r.width + x)) === hexOf(ink)) n += 1;
  return n;
};

describe('the feast courtyard as drawn', () => {
  test("reads frame 17's man against the lead's side cell read at its sheet's size, 151 of his sheet's 158, where the render read his head 189 for 146 (round 2), and every frame within the scale bar", () => {
    const planned = timesOf(feastCourtyard).map((t, index) => ({
      index,
      frame: frameAt(feastCourtyard, heads, t),
    }));
    const scaled = figures.map((f) => ({ name: f.figure.name, z: f.layer.z, heads: f.heads }));
    const [lead, man] = [byName.get('lead'), byName.get('man')];
    expect([lead?.heads.get('side'), lead?.head, man?.heads.get('neutral'), man?.head]).toEqual([
      Option.some(151),
      158,
      Option.some(303),
      303,
    ]);
    const samples = scaleSamples(planned, scaled, 'lead');
    const at17 = samples.find((s) => s.at.startsWith('man frame 17 '));
    expect(at17?.at).toBe('man frame 17 (neutral; lead side)');
    expect(Option.getOrElse(at17?.value ?? Option.none(), () => -1)).toBeCloseTo(158 / 151, 9);
    expect(samples).toHaveLength(2 * planned.length);
    const bar = BARS.find((b) => b.id === 'scale');
    expect(
      samples.filter((s) => !bar || !Option.exists(s.value, (v) => meets(bar.bar, v))),
    ).toEqual([]);
  });

  it.effect(
    "covers no figure's face with a plate drawn over it in any frame, a blurred plate's spread of three blurs included (critique 2, item 1)",
    () =>
      Effect.gen(function* () {
        const pictures = yield* picturesOver(feastCourtyard);
        expect([...pictures.keys()].length).toBeGreaterThanOrEqual(2);
        expect(coversOf(feastCourtyard, pictures).slice(0, 5)).toEqual([]);
      }),
  );

  it.effect(
    "counts a plate on a later layer of a figure's own depth as over it, as the page draws it: the table copied onto such a layer 32 px up crosses the man's face (round 3, T2)",
    () =>
      Effect.gen(function* () {
        const guests = feastCourtyard.layers.findIndex((l) => l.name === 'guests');
        const layer = feastCourtyard.layers[guests];
        const table = layer?.items.find((it) => it._tag === 'Plate');
        expect(table?._tag).toBe('Plate');
        if (!layer || table?._tag !== 'Plate') return;
        const tied = {
          ...layer,
          name: 'table at the guests depth',
          items: [{ ...table, place: { ...table.place, y: table.place.y - 32 } }],
        };
        const shot: Shot = {
          ...feastCourtyard,
          layers: feastCourtyard.layers.toSpliced(guests + 1, 0, tied),
        };
        const covered = coversOf(shot, yield* picturesOver(shot));
        expect(covered.some((line) => line.startsWith('man frame 0:'))).toBe(true);
      }),
  );

  test('shows each blink as its open cell with only the eyes changed, every changed pixel inside an eye box and every eye closed, the guests blinking in every cell they hold (critique 2, items 3 and 4)', () => {
    const faults = blinkingHolds.flatMap(({ f, s, eyes }) => {
      const key = drawnKeyOf({ cell: s.cell, eyes });
      const [open, blink, rects] = [
        f.cells.get(s.cell),
        f.blinks.get(key),
        eyeRects(f, s.cell, eyes),
      ];
      if (!open || !blink || Option.isNone(rects)) return [`${f.figure.name} ${key}: no eyes read`];
      const { inside, outside } = changesOf(open, blink, rects.value);
      const ink = f.paints[0]?.rgb ?? [0, 0, 0];
      const shut = rects.value.every(
        (rect, k) => (inside.get(k) ?? 0) > 0 && inkIn(blink, rect, ink) < inkIn(open, rect, ink),
      );
      return [
        ...outside.slice(0, 3).map((at) => `${f.figure.name} ${key}: ${at} changed`),
        ...[`${f.figure.name} ${key}: an eye left open`].filter(() => !shut),
      ];
    });
    expect(faults).toEqual([]);
    expect(
      blinkingHolds
        .map(({ f, s, eyes }) => `${f.figure.name} ${drawnKeyOf({ cell: s.cell, eyes })}`)
        .toSorted(),
    ).toEqual(
      [
        'lead threeQuarter~threeQuarterBlink',
        'man neutral~neutralBlink',
        'man smile~neutralBlink',
        'man turn~neutralBlink',
        'woman neutral~neutralBlink',
        'woman smile~neutralBlink',
        'woman turn~neutralBlink',
      ].toSorted(),
    );
  });

  test("paints the man's smile eyes all ink, where the drawing painted their lower halves in stool and mantle paint (critique 2, item 2)", () => {
    const man = byName.get('man');
    const smile = man?.cells.get('smile');
    expect(Option.isSome(Option.fromUndefinedOr(smile))).toBe(true);
    if (!man || !smile) return;
    const near = nearestOf(man.paints);
    const misses = [
      [165, 170],
      [220, 224],
    ].flatMap(([x0 = 0, x1 = 0]) =>
      Array.from({ length: 5 }, (_, k) => 316 + k).flatMap((y) =>
        Array.from({ length: x1 - x0 + 1 }, (_, k) => x0 + k).flatMap((x) => {
          const { index, distance } = near(rgbAt(smile, y * smile.width + x));
          if (index === 0 && distance === 0) return [];
          return [`(${x},${y}) is ${man.paints[index]?.part ?? 'ink'}`];
        }),
      ),
    );
    expect(misses).toEqual([]);
  });
});
