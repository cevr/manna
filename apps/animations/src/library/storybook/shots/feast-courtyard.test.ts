import * as BunServices from '@effect/platform-bun/BunServices';
import type { Raster } from '@manna/film/tools';
import { Effect, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import sharp from 'sharp';
import { anchorOf, APP } from '../render.ts';
import { type Box, eyeBoxesOf, faceBoxOf, headBoxOf, hexOf, type Rgb, rgbAt } from '../sheet.ts';
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

/** Whether pixel `q` of `r` lies in it and is not clear. */
const opaqueAt = (r: Raster, q: number): boolean =>
  q >= 0 && q < r.width * r.height && (r.rgba[q * 4 + 3] ?? 0) > 0;

/** How many of `loose` pixels of `cell` join no opaque pixel outside `inBox` through opaque pixels of `loose` (4-connected): pieces left of an old head, not a sleeve or a hand reaching in. */
const unjoined = (cell: Raster, loose: ReadonlySet<number>, inBox: (q: number) => boolean) => {
  const reached = new Set<number>();
  for (const q0 of loose) {
    if (reached.has(q0)) continue;
    const { piece, out } = pieceOf(cell, q0, loose, inBox);
    if (out) for (const q of piece) reached.add(q);
  }
  return loose.size - reached.size;
};

/** The piece of `loose` pixels of `cell` 4-connected to `q0`, and whether it touches an opaque pixel outside `inBox`. */
const pieceOf = (
  cell: Raster,
  q0: number,
  loose: ReadonlySet<number>,
  inBox: (q: number) => boolean,
) => {
  const piece = [q0];
  const held = new Set(piece);
  let out = false;
  for (let i = 0; i < piece.length; i++)
    for (const m of [1, -1, cell.width, -cell.width].map((d) => (piece[i] ?? 0) + d)) {
      if (held.has(m) || !opaqueAt(cell, m)) continue;
      out ||= !inBox(m);
      if (inBox(m) && loose.has(m)) {
        held.add(m);
        piece.push(m);
      }
    }
  return { piece, out };
};

/** `cell` against `front` inside `front`'s head box, aligned on their faces: how many head pixels of `front` it draws otherwise, and how many pixels it draws where `front` is clear that join nothing outside the box (`unjoined`); none when either reads no face. */
const headAgainst = (front: Raster, cell: Raster, paints: StoredFigure['paints']) =>
  Option.all([headBoxOf(front, paints), faceBoxOf(front, paints), faceBoxOf(cell, paints)]).pipe(
    Option.map(([head, from, to]) => {
      const [ox, oy] = [
        Math.round(to.x + (to.width - 1) / 2 - from.x - (from.width - 1) / 2),
        Math.round(to.y + (to.height - 1) / 2 - from.y - (from.height - 1) / 2),
      ];
      const inBox = (q: number) => {
        const [u, v] = [(q % cell.width) - ox, Math.floor(q / cell.width) - oy];
        return u >= head.x && v >= head.y && u < head.x + head.width && v < head.y + head.height;
      };
      let headDiffers = 0;
      const loose = new Set<number>();
      for (let y = head.y; y < head.y + head.height; y++)
        for (let x = head.x; x < head.x + head.width; x++) {
          const [p, q] = [y * front.width + x, (y + oy) * cell.width + x + ox];
          const same =
            front.rgba.subarray(p * 4, p * 4 + 4).join() ===
            cell.rgba.subarray(q * 4, q * 4 + 4).join();
          if (opaqueAt(front, p) && !same) headDiffers += 1;
          if (!opaqueAt(front, p) && opaqueAt(cell, q)) loose.add(q);
        }
      return { headDiffers, loose: unjoined(cell, loose, inBox) };
    }),
  );

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

  test("paints the man's smile eyes all ink, where the drawing painted their lower halves in stool and mantle paint, so each reads as one eye of its full height (critique 2, item 2)", () => {
    const man = byName.get('man');
    const smile = man?.cells.get('smile');
    expect(Option.isSome(Option.fromUndefinedOr(smile))).toBe(true);
    if (!man || !smile) return;
    const eyes = Option.map(eyeBoxesOf(smile, man.paints), (boxes) =>
      boxes.map((b) => [b.width, b.height]),
    );
    expect(eyes).toEqual(
      Option.some([
        [21, 31],
        [23, 29],
      ]),
    );
  });

  test("draws one head in every key of the lead's front view: inside the front cell's head box, aligned on the face, each key draws the front cell's head pixel for pixel, and draws nothing past it but the body reaching in from outside the box, a raised sleeve or hand (critique 3, item 2)", () => {
    const lead = byName.get('lead');
    const front = lead?.cells.get('front');
    expect(Option.isSome(Option.fromUndefinedOr(front))).toBe(true);
    if (!lead || !front) return;
    const differing = ['lift', 'offer', 'wave-1', 'wave-2'].map((key) => [
      key,
      headAgainst(front, lead.cells.get(key) ?? front, lead.paints),
    ]);
    expect(differing).toEqual(
      ['lift', 'offer', 'wave-1', 'wave-2'].map((k) => [
        k,
        Option.some({ headDiffers: 0, loose: 0 }),
      ]),
    );
  });

  test("keeps each guest's neutral body under the smile: the drawn smile's pixels outside its head box are the neutral cell's (critique 3, item 6)", () => {
    const differing = ['man', 'woman'].map((name) => {
      const f = byName.get(name);
      const [neutral, smile] = [f?.cells.get('neutral'), f?.cells.get('smile')];
      if (!f || !neutral || !smile) return [name, Option.none()];
      return [
        name,
        Option.map(headBoxOf(smile, f.paints), (head) => {
          let n = 0;
          for (let q = 0; q < smile.width * smile.height; q++) {
            const [x, y] = [q % smile.width, Math.floor(q / smile.width)];
            const inHead =
              x >= head.x && y >= head.y && x < head.x + head.width && y < head.y + head.height;
            const same =
              smile.width === neutral.width &&
              smile.rgba.subarray(q * 4, q * 4 + 4).join() ===
                neutral.rgba.subarray(q * 4, q * 4 + 4).join();
            if (!inHead && !same) n += 1;
          }
          return n;
        }),
      ];
    });
    expect(differing).toEqual([
      ['man', Option.some(0)],
      ['woman', Option.some(0)],
    ]);
  });
});
