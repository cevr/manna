import * as BunServices from '@effect/platform-bun/BunServices';
import { rng } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Effect, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import {
  anchorOf,
  type Box,
  eyeBoxesOf,
  faceBoxOf,
  headBoxOf,
  hexOf,
  linesOf,
  type Rgb,
  rgbAt,
  shareOf,
} from '../sheet.ts';
import {
  AT_REST,
  drawnKeyOf,
  type Figure,
  frameAt,
  keyRun,
  type Plate,
  type PlateKey,
  type Shot,
  timesOf,
} from '../shot.ts';
import { CAST, headsOf, loadFigures, sharesOf, type StoredFigure } from '../store.ts';
import { BARS, meets } from '../verify/bars.ts';
import { type Coverage, coversOf, picturesOver } from '../verify/covers.ts';
import { proportionSamples, scaleSamples } from '../verify/measures.ts';
import { placementOf } from '../verify/rows.ts';
import { feastCourtyard } from './feast-courtyard.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const figures = await Effect.runPromise(
  loadFigures(CAST, feastCourtyard).pipe(Effect.provide(BunServices.layer)),
);

const byName = new Map(figures.map((f) => [f.figure.name, f] as const));

const heads = headsOf(figures);

/** An axis-aligned rectangle in some picture's or layer's px: left, top, right, bottom. */
type Rect = readonly [number, number, number, number];

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

/**
 * `cell` against `front` as the page draws them, set on their soles (the
 * row below each one's lowest pixel, `anchorOf`) and on their faces'
 * middle columns, over both head boxes: `front`'s moved so and `cell`'s
 * own. How many head pixels of `front` it draws otherwise, and how many
 * pixels it draws where `front` is clear that join nothing outside the
 * boxes (`unjoined`); none when either reads no face.
 */
const headAgainst = (front: Raster, cell: Raster, paints: StoredFigure['paints']) =>
  Option.all([
    headBoxOf(front, paints),
    headBoxOf(cell, paints),
    faceBoxOf(front, paints),
    faceBoxOf(cell, paints),
    linesOf(front, paints),
    linesOf(cell, paints),
  ]).pipe(
    Option.map(([head, own, from, to, frontLines, cellLines]) => {
      const [ox, oy] = [
        Math.round(to.x + (to.width - 1) / 2 - from.x - (from.width - 1) / 2),
        cellLines.bottom - frontLines.bottom,
      ];
      const [x0, y0] = [Math.min(head.x + ox, own.x), Math.min(head.y + oy, own.y)];
      const [x1, y1] = [
        Math.max(head.x + head.width + ox, own.x + own.width),
        Math.max(head.y + head.height + oy, own.y + own.height),
      ];
      const inBox = (q: number) => {
        const [x, y] = [q % cell.width, Math.floor(q / cell.width)];
        return x >= x0 && y >= y0 && x < x1 && y < y1;
      };
      let headDiffers = 0;
      const loose = new Set<number>();
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const [u, v] = [x - ox, y - oy];
          const p = v * front.width + u;
          const onFront = u >= 0 && v >= 0 && u < front.width && v < front.height;
          const q = y * cell.width + x;
          const same =
            onFront &&
            front.rgba.subarray(p * 4, p * 4 + 4).join() ===
              cell.rgba.subarray(q * 4, q * 4 + 4).join();
          if (onFront && opaqueAt(front, p) && !same) headDiffers += 1;
          if (!(onFront && opaqueAt(front, p)) && opaqueAt(cell, q)) loose.add(q);
        }
      return { headDiffers, loose: unjoined(cell, loose, inBox) };
    }),
  );

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
  test('plans each figure’s crown and soles inside the frame in the take’s first frame, and the lead’s soles below the frame in a close on his face (round 3, M3)', () => {
    const first: Shot = { ...feastCourtyard, duration: 1 / feastCourtyard.fps };
    const shares = sharesOf(figures);
    const rowsIn = (shot: Shot) => {
      const frame = frameAt(shot, heads, 0, shares);
      return new Map(
        figures.flatMap((stored) => {
          const f = frame.figures.find((g) => g.name === stored.figure.name);
          const lines = Option.flatten(Option.fromUndefinedOr(stored.lines.get(f?.cell ?? '')));
          if (!f || Option.isNone(lines)) return [];
          const place = placementOf(shot, frame, f, stored.layer.z);
          const { ay } = anchorOf(lines.value);
          const crown = place.y + (lines.value.crown - ay) * place.sy;
          return [[stored.figure.name, { crown, soles: place.y }] as const];
        }),
      );
    };
    const take = rowsIn(first);
    expect([...take.keys()].toSorted()).toEqual(figures.map((f) => f.figure.name).toSorted());
    expect(
      [...take].filter(
        ([, r]) => r.crown <= 0 || r.soles >= first.size.height || r.soles <= r.crown,
      ),
    ).toEqual([]);
    const lead = frameAt(first, heads, 0, shares).figures.find((f) => f.name === 'lead');
    const close: Shot = {
      ...first,
      camera: [{ t: 0, x: lead?.x ?? 0, y: (lead?.y ?? 0) - 260, zoom: 3 }],
    };
    const near = rowsIn(close).get('lead');
    expect([
      near && near.crown < first.size.height,
      near && near.soles > first.size.height,
    ]).toEqual([true, true]);
  });

  test("reads every figure against the shot's grown head at its member's share: frame 17's lead in his side cell at 151 of his sheet's 158, the man's neutral at his sheet's 303, his turn frames (head column unread) from crown-to-soles and named so, and every frame within the scale bar", () => {
    const planned = timesOf(feastCourtyard).map((t, index) => ({
      index,
      frame: frameAt(feastCourtyard, heads, t, sharesOf(figures)),
    }));
    const scaled = figures.map((f) => ({
      name: f.figure.name,
      z: f.layer.z,
      share: shareOf(f.palette, f.figure.sheet),
      lines: f.lines,
    }));
    const [lead, man] = [byName.get('lead'), byName.get('man')];
    expect([lead?.heads.get('side'), lead?.head, man?.heads.get('neutral'), man?.head]).toEqual([
      Option.some(151),
      158,
      Option.some(303),
      303,
    ]);
    const { samples, fallbacks } = scaleSamples(planned, scaled, feastCourtyard.headPx);
    const turns = planned.flatMap(({ index, frame }) =>
      frame.figures
        .filter((f) => f.name === 'man' && f.cell === 'turn')
        .map(() => `man frame ${index} (turn: head unread, from crown-to-soles)`),
    );
    expect([man?.heads.get('turn'), turns.length > 0]).toEqual([Option.none(), true]);
    expect(fallbacks).toEqual(turns);
    const lead17 = samples.find((s) => s.at.startsWith('lead frame 17 '));
    const man17 = samples.find((s) => s.at.startsWith('man frame 17 '));
    expect([lead17?.at, man17?.at]).toEqual(['lead frame 17 (side)', 'man frame 17 (neutral)']);
    expect(Option.getOrElse(lead17?.value ?? Option.none(), () => -1)).toBeCloseTo(151 / 158, 9);
    expect(Option.getOrElse(man17?.value ?? Option.none(), () => -1)).toBeCloseTo(1, 9);
    expect(samples).toHaveLength(3 * planned.length);
    const bar = BARS.find((b) => b.id === 'scale');
    expect(
      samples.filter((s) => !bar || !Option.exists(s.value, (v) => meets(bar.bar, v))),
    ).toEqual([]);
  });

  test("judges each sheet's proportions over every cell, the head over the cells that read one: only the man's turn is left out, named, and every line within the proportions bar", () => {
    const reads = figures.map((f) =>
      proportionSamples(
        f.figure.member,
        f.record.cells.map((c) => ({
          key: c.key,
          lines: Option.flatten(Option.fromUndefinedOr(f.lines.get(c.key))),
        })),
        f.paints,
      ),
    );
    const man = byName.get('man')?.figure.member;
    expect(reads.flatMap((r) => r.leftOut)).toEqual([`${man} turn`]);
    expect(reads.flatMap((r) => r.samples.map((s) => s.at))).toContain(
      `${man} head (turn: head unread, left out)`,
    );
    const bar = BARS.find((b) => b.id === 'proportions');
    expect(
      reads
        .flatMap((r) => r.samples)
        .filter((s) => !bar || !Option.exists(s.value, (v) => meets(bar.bar, v))),
    ).toEqual([]);
  });

  it.effect(
    "covers no figure's face with a plate drawn over it in any frame, a blurred plate's spread of three blurs included (critique 2, item 1)",
    () =>
      Effect.gen(function* () {
        const pictures = yield* picturesOver(feastCourtyard);
        expect([...pictures.keys()].length).toBeGreaterThanOrEqual(2);
        expect(coversOf(feastCourtyard, figures, pictures).faults.slice(0, 5)).toEqual([]);
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
        const covered = coversOf(shot, figures, yield* picturesOver(shot));
        expect(covered.faults.some((line) => line.startsWith('man frame 0:'))).toBe(true);
      }),
  );

  it.effect(
    "reads a moving plate where its key puts it: the table on the guests' depth moved 32 px up by its key crosses the man's face, and the same table clear by its key covers nothing",
    () =>
      Effect.gen(function* () {
        const guests = feastCourtyard.layers.findIndex((l) => l.name === 'guests');
        const layer = feastCourtyard.layers[guests];
        const table = layer?.items.find((it) => it._tag === 'Plate');
        if (!layer || table?._tag !== 'Plate') return yield* Effect.die('no table on the guests');
        const tiedBy = (key: PlateKey): Shot => ({
          ...feastCourtyard,
          layers: feastCourtyard.layers.toSpliced(guests + 1, 0, {
            ...layer,
            name: 'table at the guests depth',
            items: [{ ...table, moves: [[0, key]] }],
          }),
        });
        const [moved, clear] = [
          tiedBy({ ...AT_REST, y: -32 }),
          tiedBy({ ...AT_REST, y: -32, alpha: 0 }),
        ];
        const man = (shot: Shot) =>
          Effect.map(picturesOver(shot), (pictures) =>
            coversOf(shot, figures, pictures).faults.some((line) =>
              line.startsWith('man frame 0:'),
            ),
          );
        expect([yield* man(moved), yield* man(clear)]).toEqual([true, false]);
      }),
  );

  it.effect(
    "lets a plate cross a face only while its key moves, as a named INFO line, and fails the same plate stopped there: the table on the guests' depth sliding up across the man's face over the shot's first frames, then held there",
    () =>
      Effect.gen(function* () {
        const guests = feastCourtyard.layers.findIndex((l) => l.name === 'guests');
        const layer = feastCourtyard.layers[guests];
        const table = layer?.items.find((it) => it._tag === 'Plate');
        if (!layer || table?._tag !== 'Plate') return yield* Effect.die('no table on the guests');
        const sliding = (end: number): Shot => ({
          ...feastCourtyard,
          duration: 4 / feastCourtyard.fps,
          layers: feastCourtyard.layers.toSpliced(guests + 1, 0, {
            ...layer,
            name: 'table at the guests depth',
            items: [
              {
                ...table,
                moves: [
                  [0, { ...AT_REST, y: -28 }],
                  [end, { ...AT_REST, y: -36 }],
                ],
              },
            ],
          }),
        });
        const [passing, stopped] = [sliding(1), sliding(2 / feastCourtyard.fps)];
        const read = (shot: Shot) =>
          Effect.map(picturesOver(shot), (pictures) => coversOf(shot, figures, pictures));
        const [moving, held] = [yield* read(passing), yield* read(stopped)];
        expect(moving.faults).toEqual([]);
        expect(moving.moving).toContain(`INFO cover moving: ${table.file} over man frames 0–3`);
        expect(
          held.faults
            .filter((line) => line.startsWith('man frame '))
            .map((line) => line.split(':')[0]),
        ).toEqual(['man frame 2', 'man frame 3']);
        expect(held.moving).toContain(`INFO cover moving: ${table.file} over man frames 0–1`);
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

  test("draws one head in every key of the lead's front view: set on the soles as the page draws it and on the face's middle column, over the front cell's head box and the key's own, each key draws the front cell's head pixel for pixel, and draws nothing past it but the body reaching in from outside the boxes, a raised sleeve or hand (critique 3, item 2; critique 4, A and B)", () => {
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

  test("lands the front head on the crown row in offer and wave-2, whose drawn faces end a row lower or start a row lower than front's: each worn key's head and face span the front cell's rows, crown 280 to chin 408, no strip of its own crown above (round 4, M2; critique 4, A and B)", () => {
    const lead = byName.get('lead');
    const front = lead?.cells.get('front');
    if (!lead || !front) return;
    const rowsOf = (cell: Raster) =>
      Option.all([headBoxOf(cell, lead.paints), faceBoxOf(cell, lead.paints)]).pipe(
        Option.map(([head, face]) => [
          head.y,
          head.y + head.height - 1,
          face.y,
          face.y + face.height - 1,
        ]),
      );
    const want = rowsOf(front);
    expect(want).toEqual(Option.some([280, 408, 313, 408]));
    expect(['offer', 'wave-2'].map((key) => [key, rowsOf(lead.cells.get(key) ?? front)])).toEqual([
      ['offer', want],
      ['wave-2', want],
    ]);
  });

  test("keeps each guest's neutral body under the smile: the drawn smile's pixels outside its head box and the neutral cell's own are the neutral cell's (critique 3, item 6; round 4, M2)", () => {
    const differing = ['man', 'woman'].map((name) => {
      const f = byName.get(name);
      const [neutral, smile] = [f?.cells.get('neutral'), f?.cells.get('smile')];
      if (!f || !neutral || !smile) return [name, Option.none()];
      return [
        name,
        Option.map(
          Option.all([headBoxOf(smile, f.paints), headBoxOf(neutral, f.paints)]),
          (boxes) => {
            let n = 0;
            for (let q = 0; q < smile.width * smile.height; q++) {
              const [x, y] = [q % smile.width, Math.floor(q / smile.width)];
              const inHead = boxes.some(
                (head) =>
                  x >= head.x && y >= head.y && x < head.x + head.width && y < head.y + head.height,
              );
              const same =
                smile.width === neutral.width &&
                smile.rgba.subarray(q * 4, q * 4 + 4).join() ===
                  neutral.rgba.subarray(q * 4, q * 4 + 4).join();
              if (!inHead && !same) n += 1;
            }
            return n;
          },
        ),
      ];
    });
    expect(differing).toEqual([
      ['man', Option.some(0)],
      ['woman', Option.some(0)],
    ]);
  });

  test("fails a still 2×2 plate inside the man's lower face, and names a moving one as passing, at any head share and depth: the face placed by the shot's head law (head px × share ÷ depth ÷ sheet head) from his own cell, anchor and sheet head (round 1, M1)", () => {
    const man = byName.get('man');
    const key = [...(man?.cells.keys() ?? [])][0] ?? '';
    const cell = man?.cells.get(key);
    const geometry = Option.all([
      Option.flatten(Option.fromUndefinedOr(man?.lines.get(key))),
      Option.flatMap(Option.fromUndefinedOr(cell), (c) => faceBoxOf(c, man?.paints ?? [])),
    ]);
    if (!man || !cell || Option.isNone(geometry)) return expect(Option.isSome(geometry)).toBe(true);
    const [lines, face] = geometry.value;
    const { ax, ay } = anchorOf(lines);
    const draw = rng(17);
    const cases = Array.from({ length: COVER_CASES }, (_, i) => {
      const [share, z, moving] = [0.4 + draw(), 0.6 + 2.4 * draw(), i % 2];
      const k = (feastCourtyard.headPx * share) / z / man.head;
      const x = man.figure.at.x + (face.x + face.width / 2 - ax) * k;
      const y = man.figure.at.ground + (face.y + face.height * 0.75 - ay) * k;
      const figure: Figure = { ...man.figure, spans: [keyRun([[0, key]])] };
      const plate: Plate = {
        _tag: 'Plate',
        file: 'probe',
        testArt: true,
        place: { x: x - 1, y: y - 1, width: 2, height: 2 },
        moves: [
          [0, AT_REST],
          [1, { ...AT_REST, x: 4 * moving }],
        ],
      };
      const layer = { ...man.layer, z, blur: 0, items: [figure, plate] };
      const stored: StoredFigure = {
        ...man,
        cells: new Map([[key, cell]]),
        blinks: new Map(),
        figure,
        layer,
        palette: { ...man.palette, heads: { [man.figure.sheet]: share } },
      };
      const shot: Shot = {
        ...feastCourtyard,
        from: 0,
        duration: 1 / feastCourtyard.fps,
        layers: [layer],
      };
      const covers = coversOf(shot, [stored], new Map([['probe', OPAQUE]]));
      return {
        i,
        got: [covers.faults.length, covers.moving.length],
        expected: [1 - moving, moving],
      };
    });
    expect(cases.map(({ i, got }) => [i, got])).toEqual(
      cases.map(({ i, expected }) => [i, expected]),
    );
  });
});

/** How many seeded cases the face-cover property draws, each a head share, a depth and a still or moving plate. */
const COVER_CASES = 24;

/** The coverage of a picture of one opaque pixel: a probe plate's. */
const OPAQUE: Coverage = { width: 1, height: 1, sums: new Int32Array([0, 0, 0, 1]) };
