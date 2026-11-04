import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { hexOf, linesOf, paintsOf, sheetHeadOf } from './sheet.ts';
import {
  ANATOMY,
  ANATOMY_HAIR,
  ANATOMY_INK,
  ANATOMY_ROBE,
  ANATOMY_SASH,
  ANATOMY_SHOE,
  ANATOMY_SKIN,
  anatomyFigure,
  art,
  type Band,
  banded,
  DRESSED,
  FIGURE_KEY,
  generatedFigure,
  INK,
  MARKED,
  ROBE,
  SANDAL,
  SKIN,
  WHOLE,
} from './testing.ts';

/** A standing figure's rows, the head on top, its arms down, the sash in rows 9 to 11. */
const STANDING: ReadonlyArray<string> = [
  '....kkkkk...........',
  '....ksssk...........',
  '....ksssk...........',
  '....ksssk...........',
  '...krrrrrk..........',
  '..krrrrrrr..........',
  '..krrrrrrr..........',
  '..krrrrrrr..........',
  '..krrrrrrr..........',
  '..khhhhhhhk.........',
  '..khhhhhhhk.........',
  '..khhhhhhhk.........',
  '..krrrrrrrk.........',
  '..krrrrrrrk.........',
  '..krrrrrrrk.........',
  '..krrrrrrrk.........',
  '..kkkkkkkkk.........',
  '...kfffkfffk........',
  '...kfffkfffk........',
  '...kkkkkkkkk........',
];

/** A standing figure; `offer` reaches the right arm out at the shoulder in its sleeve, a round hand at the end. */
const standing = (offer: boolean): Raster => {
  const arm = ['..........', 'rrrrrrrkss', 'rrrrrrrkss', 'kkkkkkkk..'];
  const still = ['..........', '..........', '..........', '..........'];
  const reach = [still, arm][Number(offer)] ?? still;
  return art(
    STANDING.map((row, y) => {
      if (y < 5 || y > 8) return row;
      return `${row.slice(0, 10)}${reach[y - 5] ?? ''}`;
    }),
    FIGURE_KEY,
  );
};

/** The bands of a figure drawn at `height` rows from shares of its height: each band's end as a share, and its paint. */
const scaledBands = (shares: ReadonlyArray<Band>, height: number): ReadonlyArray<Band> =>
  shares.map(([end, paint, span]) => [end * height, paint, span ?? WHOLE] as const);

/** The bands of the verifier's figure (round 2, M2): a jaw line 1.8 % of its height deep at a fifth of it, across the head column with skin to its right, the collar at 33 %, 2.6 % deep, an ink line, the robe and sandals. */
const JAW_AND_COLLAR: ReadonlyArray<Band> = [
  [0.15, INK],
  [0.2, SKIN],
  [0.218, ROBE, [1, 10]],
  [0.33, SKIN],
  [0.356, ROBE],
  [0.406, INK],
  [0.92, ROBE],
  [1, SANDAL],
];

describe('linesOf', () => {
  const paints = paintsOf(DRESSED);

  test('reads the crown, the head (crown to collar), the sash top and the hem in the head and centre columns', () => {
    const lines = Option.getOrThrow(linesOf(standing(false), paints));
    expect([lines.top, lines.bottom, lines.headColumn, lines.crown]).toEqual([0, 19, 6, 0]);
    expect([lines.head, lines.sashTop, lines.hem]).toEqual([
      Option.some(4),
      Option.some(9),
      Option.some(15),
    ]);
  });

  test('holds every line when the arm reaches out at the shoulder, where a row-wide count moves', () => {
    const down = Option.getOrThrow(linesOf(standing(false), paints));
    const out = Option.getOrThrow(linesOf(standing(true), paints));
    expect(out).toEqual(down);
  });

  test('reads the sash top across the figure, where a sleeve hangs over the belt at the centre column or a drawn line runs down it (round 1, M3)', () => {
    for (const letter of ['r', 'k', 's']) {
      const rows = STANDING.map((row, y) => {
        if (y < 9 || y > 11) return row;
        return `${row.slice(0, 7)}${letter}${row.slice(8)}`;
      });
      expect([
        letter,
        Option.flatMap(linesOf(art(rows, FIGURE_KEY), paints), (l) => l.sashTop),
      ]).toEqual([letter, Option.some(9)]);
    }
  });

  test('reads the hem above an outline fringe between the legs that snapped to a garment paint (round 2: ink on a green ground blends to teal)', () => {
    const rows = STANDING.map((row, y) => {
      if (y === 16) return '..kkkkkkkkkkk.......';
      if (y > 16) return '..kffk.r.kffk.......';
      return row;
    });
    const lines = Option.getOrThrow(linesOf(art(rows, FIGURE_KEY), paints));
    expect([lines.centreColumn, lines.hem]).toEqual([7, Option.some(15)]);
  });

  test("reads the collar below a jaw line drawn in a garment's colour with the face's skin above, beside and below it, and none where the line crosses the whole face (round 2: the man's turned head; round 4, M1)", () => {
    const figure = (jaw: string) =>
      art(
        [
          '..kkkkkkk..',
          '..ksssssk..',
          '..ksssssk..',
          '..ksssssk..',
          jaw,
          jaw,
          jaw,
          '..ksssssk..',
          '..ksssssk..',
          ...Array.from({ length: 14 }, () => '.krrrrrrrk.'),
          '.kkkkkkkkk.',
        ],
        FIGURE_KEY,
      );
    const read = (jaw: string) => {
      const lines = Option.getOrThrow(linesOf(figure(jaw), paints));
      return [lines.crown, lines.headColumn, lines.head];
    };
    expect(read('..krrrrsk..')).toEqual([0, 5, Option.some(9)]);
    expect(read('..krrrrrk..')).toEqual([0, 5, Option.none()]);
  });

  test('reads the same collar in one figure drawn 200 and 240 rows tall, a jaw line as deep as the collar above it (round 2, M2)', () => {
    const heads = [200, 240].map((height) =>
      Option.flatMap(
        linesOf(banded(scaledBands(JAW_AND_COLLAR, height), height, 0), paints),
        (l) => l.head,
      ),
    );
    expect(heads).toEqual([Option.some(66), Option.some(80)]);
  });

  test('over generated figures (marks on the face of any paint, depth and width, edged in ink and blends or not; collars two rows deep and more; clothes broken by ink, a sash or a hand), widths, sizes and offsets: reads the head to the row the collar band starts in, none where no clothes follow the face or the column cannot tell the collar from a mark', () => {
    const marked = paintsOf(MARKED);
    const kinds: Array<readonly [boolean, boolean]> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const { raster, collar, untold } = generatedFigure(seed);
      const head = Option.flatMap(linesOf(raster, marked), (l) => l.head);
      const read = Option.match(collar, {
        onNone: () => Option.isNone(head),
        onSome: (c) =>
          [
            Option.exists(head, (h) => h >= Math.floor(c) && h <= Math.ceil(c)),
            Option.isNone(head),
          ][Number(untold)] ?? false,
      });
      expect([seed, raster.height, collar, untold, head, read]).toEqual([
        seed,
        raster.height,
        collar,
        untold,
        head,
        true,
      ]);
      kinds.push([untold, Option.isSome(head)]);
    }
    const [unread, told] = [
      kinds.filter(([u]) => u).length,
      kinds.filter(([u, read]) => !u && read).length,
    ];
    expect([unread, told, unread >= 50, told >= 50]).toEqual([unread, told, true, true]);
  });

  test('reads 80 or none, never the mark, from a neck 1 to 5 px wide ringed in ink under a jaw mark across the face in any paint, edged in ink or not (round 4, M1: 48 for 80)', () => {
    const own = paintsOf(ANATOMY);
    for (const neck of [1, 2, 3, 5])
      for (const paint of [ANATOMY_ROBE, ANATOMY_SASH, ANATOMY_HAIR, ANATOMY_SHOE, ANATOMY_INK])
        for (const edge of [0, 1, 4]) {
          const r = anatomyFigure((x, y) => {
            if (y < 48 || y >= 80 || x < 21 || x > 59) return Option.none();
            if (y < 53) return Option.some(paint);
            if (y < 53 + edge || Math.abs(x - 40) > (neck - 1) / 2) return Option.some(ANATOMY_INK);
            return Option.some(ANATOMY_SKIN);
          });
          const head = Option.flatMap(linesOf(r, own), (l) => l.head);
          const read = Option.match(head, { onNone: () => true, onSome: (h) => h === 80 });
          expect([neck, hexOf(paint), edge, head, read]).toEqual([
            neck,
            hexOf(paint),
            edge,
            head,
            true,
          ]);
        }
  });

  test('reads no head from a figure with no face in its head column', () => {
    const rows = ['..kkkkk..', ...Array.from({ length: 12 }, () => '..krrrk..'), '..kkkkk..'];
    expect(Option.flatMap(linesOf(art(rows, FIGURE_KEY), paints), (l) => l.head)).toEqual(
      Option.none(),
    );
  });

  test('reads no sash top from stray sash pixels too few to make a band', () => {
    const rows = STANDING.map((row, y) => {
      if (y >= 9 && y <= 11) return '..krrrrrrrk.........';
      if (y >= 5 && y <= 7) return '..krhrrrrr..........';
      return row;
    });
    expect(Option.flatMap(linesOf(art(rows, FIGURE_KEY), paints), (l) => l.sashTop)).toEqual(
      Option.none(),
    );
  });

  test('reads none from a picture with no opaque pixel', () => {
    expect(linesOf({ width: 3, height: 3, rgba: new Uint8Array(36) }, paints)).toEqual(
      Option.none(),
    );
  });

  test("a sheet's head is the median of its cells' heads, over the cells that read one", () => {
    const heads = new Map([
      ['a', Option.some(4)],
      ['b', Option.none()],
      ['c', Option.some(6)],
      ['d', Option.some(5)],
    ]);
    expect(sheetHeadOf(heads)).toEqual(Option.some(5));
    expect(sheetHeadOf(new Map([['a', Option.none<number>()]]))).toEqual(Option.none());
  });
});
