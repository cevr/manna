import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { labOf, deltaE, rgbAt } from './cast-sheet-pixels.ts';
import {
  type PartCut,
  cutFigureOf,
  cutParts,
  enclosedPaperOf,
  inkOf,
  inkTo,
  paintHidden,
  recompose,
} from './part-sheet.ts';
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

  describe('the paper the ink encloses', () => {
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
    const ownersAt = (figure?: Uint8Array) => {
      const sheet = Result.getOrThrow(cutParts(view, { parts: [all] }, { figure }));
      return [20 * 40 + 20, 14 * 40 + 14, 20 * 40 + 11, 20 * 40 + 6, 0].map((i) => sheet.owner[i]);
    };

    test('is held: a part owns the piece, as it owns the cloth round it', () => {
      expect(ownersAt()).toEqual([1, 1, 1, 1, 0]);
    });

    test('a named gap stays open: no part owns the piece its point lies in', () => {
      expect(ownersAt(cutFigureOf(view, [[20, 20]]))).toEqual([0, 0, 1, 1, 0]);
    });

    test('a gap point off every paper piece changes nothing', () => {
      const held = cutFigureOf(view);
      for (const at of [
        [0, 0],
        [11, 20],
        [-3, 50],
      ] as const)
        expect(cutFigureOf(view, [at])).toEqual(held);
    });

    test('each piece is listed with its box, its pixels and the gap points in it', () => {
      expect(
        enclosedPaperOf(view, [
          [20, 20],
          [14, 25],
          [11, 20],
        ]).pieces,
      ).toEqual([
        {
          box: [14, 14, 26, 26],
          area: 144,
          gaps: [
            [20, 20],
            [14, 25],
          ],
          pixels: Array.from(
            { length: 144 },
            (_, k) => (14 + Math.floor(k / 12)) * view.width + 14 + (k % 12),
          ),
        },
      ]);
      expect(enclosedPaperOf(view).pieces.map((p) => p.gaps)).toEqual([[]]);
    });
  });
});

describe('a key inked as the kept view', () => {
  const OFF: Rgba = [62, 18, 70, 255];
  const shade = (t: number): Rgba =>
    [0, 1, 2]
      .map((c) => Math.round(OFF[c]! + t * (CREAM[c]! - OFF[c]!)))
      .concat(255) as unknown as Rgba;
  const KEY: Raster = (() => {
    const [w, h] = [24, 16];
    const rgba = new Uint8Array(w * h * 4);
    const colourAt = (x: number, d: number): Option.Option<Rgba> => {
      if (d > 5.5) return Option.none();
      if (d > 3.5 && x % 5 === 0) return Option.some([40, 10, 46, 255]);
      if (d > 3.5) return Option.some(OFF);
      if (d > 2.5) return Option.some(shade(0.45));
      if (d > 1.5) return Option.some(shade(0.75));
      return Option.some(CREAM);
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = colourAt(x, Math.abs(y - 7.5));
        if (Option.isSome(c)) rgba.set(c.value, (y * w + x) * 4);
      }
    return { width: w, height: h, rgba };
  })();
  const KEPT = labOf([49, 33, 27]);
  const isInk = (r: Raster) =>
    Array.from(
      { length: r.width * r.height },
      (_, i) => r.rgba[i * 4 + 3] === 255 && labOf(rgbAt(r, i))[0] < 40,
    );
  const opaque = (r: Raster) => (i: number) => r.rgba[i * 4 + 3] === 255;

  test("the key's ink comes out in the kept ink, its median within dE 1", () => {
    const before = Option.getOrThrow(inkOf(KEY, opaque(KEY)));
    expect(deltaE(before, KEPT)).toBeGreaterThan(10);
    const out = inkTo(KEY, KEPT);
    expect(deltaE(Option.getOrThrow(inkOf(out, opaque(out))), KEPT)).toBeLessThan(1);
  });

  test('the ink is as wide as it was, read bilinear at every 0.05 px across the stroke', () => {
    const lAt = (r: Raster, x: number, y: number) => {
      const [u, v] = [
        Math.min(r.width - 1.001, Math.max(0, x - 0.5)),
        Math.min(r.height - 1.001, Math.max(0, y - 0.5)),
      ];
      const [x0, y0, tx, ty] = [Math.floor(u), Math.floor(v), u - Math.floor(u), v - Math.floor(v)];
      const at = (xx: number, yy: number) => labOf(rgbAt(r, yy * r.width + xx))[0];
      return (
        (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) +
        (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty
      );
    };
    const inkEdges = (r: Raster) =>
      [2.3, 5.5, 7.85, 10.1, 15.6].map((x) =>
        Array.from({ length: 321 }, (_, k) => Number(lAt(r, x, k * 0.05) < 40)).join(''),
      );
    const out = inkTo(KEY, labOf([80, 60, 52]));
    expect(labOf(rgbAt(out, 2 * KEY.width + 1))[0]).toBeGreaterThan(
      labOf(rgbAt(KEY, 2 * KEY.width + 1))[0] + 8,
    );
    expect(inkEdges(out)).toEqual(inkEdges(KEY));
  });

  test('the ink is the same pixels, every alpha the same, and the paint away from the ink untouched', () => {
    const out = inkTo(KEY, KEPT);
    expect(isInk(out)).toEqual(isInk(KEY));
    expect(isInk(KEY).filter(Boolean).length).toBeGreaterThan(0);
    const alpha = (r: Raster) => r.rgba.filter((_, k) => k % 4 === 3);
    expect(alpha(out)).toEqual(alpha(KEY));
    const cream = Array.from({ length: KEY.width * KEY.height }, (_, i) => i).filter(
      (i) => labOf(rgbAt(KEY, i))[0] >= 60,
    );
    expect(cream.length).toBeGreaterThan(0);
    expect(cream.map((i) => rgbAt(out, i))).toEqual(cream.map((i) => rgbAt(KEY, i)));
  });

  test('the ink side of the edge moves the way the ink moves, by less', () => {
    const out = inkTo(KEY, KEPT);
    const own = Option.getOrThrow(inkOf(KEY, opaque(KEY)));
    const edge = 4 * KEY.width + 3;
    const [before, after] = [labOf(rgbAt(KEY, edge)), labOf(rgbAt(out, edge))];
    expect(before[0]).toBeGreaterThanOrEqual(40);
    for (const c of [1, 2]) {
      const [moved, inkMoved] = [after[c]! - before[c]!, KEPT[c]! - own[c]!];
      expect(Math.sign(moved)).toBe(Math.sign(inkMoved));
      expect(Math.abs(moved)).toBeLessThan(Math.abs(inkMoved));
    }
  });

  test('a key with no ink comes back as it was', () => {
    const plain: Raster = { width: 2, height: 1, rgba: Uint8Array.from([...CREAM, ...CREAM]) };
    expect(inkTo(plain, KEPT)).toBe(plain);
  });
});
