import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { type PartCut, cutParts, paintHidden, recompose } from './part-sheet.ts';
import type { Raster } from './raster.ts';

type Rgba = readonly [number, number, number, number];

const PAPER: Rgba = [244, 232, 212, 255];
const INK: Rgba = [24, 20, 18, 255];
const CREAM: Rgba = [250, 210, 150, 255];

/** A `w` × `h` view of paper with each pixel `paint` gives painted, and its figure (1 where painted). */
const viewOf = (w: number, h: number, paint: (x: number, y: number) => Option.Option<Rgba>) => {
  const rgba = new Uint8Array(w * h * 4);
  const figure = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = paint(x, y);
      rgba.set(
        Option.getOrElse(c, () => PAPER),
        (y * w + x) * 4,
      );
      figure[y * w + x] = Number(Option.isSome(c));
    }
  return { view: { width: w, height: h, rgba } satisfies Raster, figure };
};

/** A 32 × 32 figure: a red disc (the head) over a blue box (the body), each pixel its own colour so a moved byte shows. */
const { view: FIGURE, figure: FIGURE_MASK } = viewOf(32, 32, (x, y) =>
  Option.firstSomeOf([
    Option.liftPredicate(
      [200, 40 + x, 40 + y, 255] as Rgba,
      () => Math.hypot(x + 0.5 - 16, y + 0.5 - 8) <= 6,
    ),
    Option.liftPredicate(
      [40 + y, 60 + x, 210, 255] as Rgba,
      () => x >= 8 && x < 24 && y >= 12 && y < 30,
    ),
  ]),
);

const CUT: PartCut = {
  parts: [
    { name: 'head', take: [{ disc: { c: [16, 8], r: 6.5 } }] },
    {
      name: 'body',
      take: [
        {
          polygon: [
            [0, 0],
            [32, 0],
            [32, 32],
            [0, 32],
          ],
        },
      ],
    },
  ],
};

const sheetOf = (cut: PartCut = CUT) =>
  Result.getOrThrow(cutParts(FIGURE, cut, { figure: FIGURE_MASK }));

const ownerAt = (s: ReturnType<typeof sheetOf>, x: number, y: number) => s.owner[y * s.width + x];

/** Why a result was refused, or `accepted`. */
const reasonOf = (r: Result.Result<unknown, { readonly reason: string }>) =>
  Result.match(r, { onSuccess: () => 'accepted', onFailure: (e) => e.reason });

describe('part sheet', () => {
  test('a part sheet recomposes its view byte for byte', () => {
    const sheet = sheetOf();
    expect(recompose(sheet, FIGURE).rgba).toEqual(FIGURE.rgba);
    const bare = recompose(sheet);
    const changed = FIGURE_MASK.filter((f, i) => {
      const px = bare.rgba.subarray(i * 4, i * 4 + 4);
      const kept = FIGURE.rgba.subarray(i * 4, i * 4 + 4);
      return (f === 1 && px.some((v, c) => v !== kept[c])) || (f === 0 && px[3] !== 0);
    });
    expect(changed.length).toBe(0);
    expect(sheet.parts.map((p) => [p.name, p.kept, p.painted])).toEqual([
      ['head', sheet.owner.filter((o) => o === 1).length, 0],
      ['body', sheet.owner.filter((o) => o === 2).length, 0],
    ]);
  });

  test('a pixel two parts take belongs to the one in front', () => {
    // the disc reaches below the head into the body's top rows: the head, listed first, owns them
    expect(ownerAt(sheetOf(), 16, 13)).toBe(1);
    const flipped = sheetOf({ parts: [CUT.parts[1]!, CUT.parts[0]!] });
    expect(ownerAt(flipped, 16, 13)).toBe(1);
    expect(flipped.parts[1]?.kept).toBe(0);
  });

  test('`unless` leaves a pixel to the parts behind', () => {
    const sheet = sheetOf({
      parts: [
        {
          name: 'head',
          take: [{ disc: { c: [16, 8], r: 6.5 } }],
          unless: [
            {
              polygon: [
                [0, 0],
                [16, 0],
                [16, 32],
                [0, 32],
              ],
            },
          ],
        },
        CUT.parts[1]!,
      ],
    });
    expect([ownerAt(sheet, 13, 8), ownerAt(sheet, 18, 8), ownerAt(sheet, 0, 0)]).toEqual([2, 1, 0]);
  });

  test('a cut that leaves a figure pixel untaken is refused, saying how many and where', () => {
    const untaken = cutParts(FIGURE, { parts: [CUT.parts[0]!] }, { figure: FIGURE_MASK });
    expect(
      Result.match(untaken, { onSuccess: () => 'accepted', onFailure: (e) => e.message }),
    ).toMatch(/^the view cannot be cut: \d+ figure pixels no part takes, the first at \(8, 12\)$/);
    expect(
      reasonOf(
        cutParts(
          FIGURE,
          { parts: [{ name: 'face', take: [{ label: 'face' }] }] },
          { figure: FIGURE_MASK },
        ),
      ),
    ).toBe("label rules (face) need the member's classes and labels");
    expect(
      reasonOf(
        cutParts(FIGURE, { parts: [CUT.parts[1]!, CUT.parts[1]!] }, { figure: FIGURE_MASK }),
      ),
    ).toBe('two parts are named body');
  });

  test('hidden paint lies only where a part in front owns the pixel, and never shows', () => {
    const sheet = sheetOf();
    const paint: Raster = { width: 32, height: 32, rgba: new Uint8Array(32 * 32 * 4).fill(128) };
    const under = Uint8Array.from(sheet.owner, (o, i) =>
      Number(o === 1 && Math.floor(i / 32) >= 10),
    );
    const painted = Result.getOrThrow(paintHidden(sheet, 'body', paint, under));
    expect(painted.parts[1]?.painted).toBe(under.filter((m) => m === 1).length);
    expect(recompose(painted, FIGURE).rgba).toEqual(FIGURE.rgba);
    expect(painted.parts[0]).toBe(sheet.parts[0]!);
    // under the front-most part nothing lies in front; on the body's own pixel or the ground, paint would show
    for (const [part, x, y] of [
      ['head', 16, 8],
      ['body', 16, 20],
      ['body', 1, 1],
    ] as const) {
      const at = new Uint8Array(32 * 32);
      at[y * 32 + x] = 1;
      expect(reasonOf(paintHidden(sheet, part, paint, at))).toBe(
        `paint at (${x}, ${y}) would show at rest: no part in front of ${part} owns it`,
      );
    }
    expect(reasonOf(paintHidden(sheet, 'arm', paint, under))).toBe('the sheet holds no part arm');
  });

  test('hidden paint is refused under a front pixel that is not opaque, which would let it show', () => {
    // an ink box with one clear texel inside it, read by the default figure reader
    const { view } = viewOf(32, 32, (x, y) =>
      Option.liftPredicate(INK, () => x >= 8 && x < 24 && y >= 8 && y < 24),
    );
    view.rgba.set([0, 0, 0, 0], (16 * 32 + 16) * 4);
    const all = [
      {
        polygon: [
          [0, 0],
          [32, 0],
          [32, 32],
          [0, 32],
        ] as const,
      },
    ];
    const sheet = Result.getOrThrow(
      cutParts(view, {
        parts: [
          { name: 'cloak', take: all },
          { name: 'body', take: all },
        ],
      }),
    );
    expect(ownerAt(sheet, 16, 16)).toBe(1);
    const red: Raster = { width: 32, height: 32, rgba: new Uint8Array(32 * 32 * 4) };
    for (let i = 0; i < 32 * 32; i++) red.rgba.set([255, 0, 0, 255], i * 4);
    const clear = new Uint8Array(32 * 32);
    clear[16 * 32 + 16] = 1;
    expect(reasonOf(paintHidden(sheet, 'body', red, clear))).toBe(
      'paint at (16, 16) would show at rest: cloak, in front of body, is not opaque there',
    );
    // under an opaque pixel of the same part, the paint is hidden
    const opaque = new Uint8Array(32 * 32);
    opaque[12 * 32 + 12] = 1;
    const painted = Result.getOrThrow(paintHidden(sheet, 'body', red, opaque));
    expect(recompose(painted, view).rgba).toEqual(view.rgba);
  });

  test('the same view and cut give the same sheet', () => {
    const [a, b] = [sheetOf(), sheetOf()];
    expect(a.owner).toEqual(b.owner);
    expect(a.parts.map((p) => p.pixels.rgba)).toEqual(b.parts.map((p) => p.pixels.rgba));
  });

  test('the paper the ink encloses is ground, and no part owns it', () => {
    // an inked ring round 12 × 12 px of paper, a cream band and an outer ring round it
    const ring = [Option.none<Rgba>(), Option.some(INK), Option.some(CREAM), Option.some(INK)];
    const { view } = viewOf(40, 40, (x, y) => {
      const d = Math.max(Math.abs(x - 19.5), Math.abs(y - 19.5));
      return ring[[6, 10, 14, 16].findIndex((r) => d < r)] ?? Option.none();
    });
    const all = {
      name: 'all',
      take: [
        {
          polygon: [
            [0, 0],
            [40, 0],
            [40, 40],
            [0, 40],
          ] as const,
        },
      ],
    };
    const sheet = Result.getOrThrow(cutParts(view, { parts: [all] }));
    expect([20 * 40 + 20, 20 * 40 + 11, 20 * 40 + 6, 0].map((i) => sheet.owner[i])).toEqual([
      0, 1, 1, 0,
    ]);
    expect(sheet.parts[0]?.kept).toBe(sheet.owner.filter((o) => o === 1).length);
  });
});
