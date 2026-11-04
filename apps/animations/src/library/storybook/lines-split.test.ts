import type { Raster } from '@manna/film/tools';
import { Option, Result } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { hexOf, linesOf, type Palette, paintsOf, type Rgb, splitSheet } from './sheet.ts';
import {
  ANATOMY,
  ANATOMY_INK,
  ANATOMY_SKIN,
  anatomyFigure,
  generatedFigure,
  GROUND,
  MARKED,
} from './testing.ts';

/** How many generated figures the split property draws on a sheet and splits. */
const SPLIT_FIGURES = 40;

/** `r` drawn alone on a sheet of the ground, 10 px in from each side. */
const onSheet = (r: Raster): Raster => {
  const [width, height] = [r.width + 20, r.height + 20];
  const rgba = new Uint8Array(width * height * 4);
  for (let q = 0; q < width * height; q++) rgba.set([...GROUND, 255], q * 4);
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const q = (y * r.width + x) * 4;
      if ((r.rgba[q + 3] ?? 0) > 0)
        rgba.set(r.rgba.subarray(q, q + 4), ((y + 10) * width + x + 10) * 4);
    }
  return { width, height, rgba };
};

/** A round hand ringed in ink under the collar's ink line, centred at (40, 107), 13 px across, the sleeve's skin joining its lower edge in rows 118 on. */
const roundHand = (x: number, y: number): Option.Option<Rgb> => {
  const d = (x - 40) ** 2 + (y - 107) ** 2;
  if (y < 95 || y > 121 || d > 13 ** 2) return Option.none();
  if (d >= 11.5 ** 2 && !(y >= 118 && Math.abs(x - 40) <= 4)) return Option.some(ANATOMY_INK);
  return Option.some(ANATOMY_SKIN);
};

/** `r` drawn `scale` times as large, `dx` and `dy` clear px on each side. */
const enlarged = (r: Raster, scale: number, dx: number, dy: number): Raster => {
  const [width, height] = [r.width * scale + dx * 2, r.height * scale + dy * 2];
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height - dy * 2; y++)
    for (let x = 0; x < width - dx * 2; x++) {
      const q = (Math.floor(y / scale) * r.width + Math.floor(x / scale)) * 4;
      rgba.set(r.rgba.subarray(q, q + 4), ((y + dy) * width + x + dx) * 4);
    }
  return { width, height, rgba };
};

/** The head `palette` reads in the one cell `splitSheet` cuts from `r` drawn alone on a sheet; none when it reads none or the split refuses. */
const splitHeadOf = (r: Raster, palette: Palette): Option.Option<number> =>
  Option.flatMap(Result.getSuccess(splitSheet(onSheet(r), 1, palette)), (s) =>
    Option.flatMap(Option.fromUndefinedOr(s.cells[0]), (cell) =>
      Option.flatMap(linesOf(cell.raster, paintsOf(palette)), (l) => l.head),
    ),
  );

describe('linesOf', () => {
  test('over generated figures drawn on a sheet and split (`splitSheet`): reads the head to the row the collar band starts in, or none, never another row', () => {
    for (let seed = 1; seed <= SPLIT_FIGURES; seed++) {
      const { raster, collar } = generatedFigure(seed);
      const head = splitHeadOf(raster, MARKED);
      const read = Option.match(head, {
        onNone: () => true,
        onSome: (h) => Option.exists(collar, (c) => h >= Math.floor(c) && h <= Math.ceil(c)),
      });
      expect([seed, collar, head, read]).toEqual([seed, collar, head, true]);
    }
  });

  test('reads the collar below a full-width jaw mark edged in ink whose skin runs on down into the collar, drawn and through `splitSheet`, and none where ink closes that skin below, a hand under the collar (round 3, M1: the guest read 48 for 80)', () => {
    const ink: Rgb = [20, 10, 5];
    const skin: Rgb = [240, 180, 130];
    const robe: Rgb = [110, 130, 125];
    const palette: Palette = {
      ink: hexOf(ink),
      parts: [
        { name: 'skin', role: 'skin', base: hexOf(skin) },
        { name: 'robe', role: 'garment', base: hexOf(robe) },
      ],
    };
    const own = paintsOf(palette);
    const figure = (edge: number, closed: boolean): Raster => {
      const rows = Array.from({ length: 240 }, (_, y): Rgb => {
        if (y < 36) return ink;
        if (y < 48) return skin;
        if (y < 53) return robe;
        if (y < 53 + edge) return ink;
        if (y < 79) return skin;
        if (y < 80) return [skin, ink][Number(closed)] ?? skin;
        if (y < 87) return robe;
        if (y < 95) return ink;
        return robe;
      });
      const rgba = new Uint8Array(15 * 240 * 4);
      for (let y = 0; y < 240; y++)
        for (let x = 0; x < 15; x++)
          rgba.set(
            [...([rows[y] ?? robe, ink][Number(x === 0 || x === 14)] ?? ink), 255],
            (y * 15 + x) * 4,
          );
      return { width: 15, height: 240, rgba };
    };
    const headOf = (r: Raster) => Option.flatMap(linesOf(r, own), (l) => l.head);
    const collarOrNone = (head: Option.Option<number>) =>
      Option.match(head, { onNone: () => true, onSome: (h) => h === 80 });
    const open = [0, 1, 2, 4].map((edge) => figure(edge, false));
    const reads = [...open.map(headOf), ...open.map((r) => splitHeadOf(r, palette))];
    expect(reads.map((h) => [h, collarOrNone(h)])).toEqual(reads.map((h) => [h, true]));
    const closed = figure(1, true);
    expect([headOf(closed), splitHeadOf(closed, palette)]).toEqual([Option.none(), Option.none()]);
  });

  test('reads none, never the hand, from a round hand ringed in ink under the collar whose sleeve joins its lower edge, at scales 1 to 3 and offsets, drawn and through `splitSheet` (round 4, M1: 121 for 80)', () => {
    const own = paintsOf(ANATOMY);
    const plain = anatomyFigure(() => Option.none());
    const hand = anatomyFigure(roundHand);
    for (const scale of [1, 2, 3])
      for (const [dx, dy] of [
        [0, 0],
        [5, 7],
      ] as const) {
        const [a, b] = [enlarged(plain, scale, dx, dy), enlarged(hand, scale, dx, dy)];
        const heads = [a, b].map((r) => Option.flatMap(linesOf(r, own), (l) => l.head));
        expect([scale, dx, dy, ...heads, splitHeadOf(b, ANATOMY)]).toEqual([
          scale,
          dx,
          dy,
          Option.some(80 * scale),
          Option.none(),
          Option.none(),
        ]);
      }
  });
});
