import { describe, expect, test } from 'bun:test';
import type { Raster } from './raster.ts';
import { Result } from 'effect';
import { tracedModule, traceView } from './trace.ts';

/** A view as the tracer reads it. */
type TraceView = Parameters<typeof traceView>[1];

/** The least gap between two of an outline's points: a third of RIVE.md's 8 px step, so no spike from a fine step. */
const LEAST_GAP = 8 / 3;

/** A sheet 120 × 220 on white: a round skin head inked round, over a cream body inked round, its lower half a teal shade. */
const sheet = (): Raster => {
  const [width, height] = [120, 220];
  const rgba = new Uint8Array(width * height * 4).fill(255);
  const put = (x: number, y: number, [r, g, b]: readonly [number, number, number]) => {
    const i = (y * width + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
  };
  /** Every pixel `inside` takes painted `colour`, later layers over earlier. */
  const layer = (
    colour: readonly [number, number, number],
    inside: (x: number, y: number) => boolean,
  ) => {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) if (inside(x, y)) put(x, y, colour);
  };
  layer([20, 16, 14], (x, y) => x >= 30 && x <= 90 && y >= 62 && y <= 200);
  layer([253, 225, 188], (x, y) => x >= 34 && x <= 86 && y >= 66 && y <= 196);
  layer([78, 113, 130], (x, y) => x > 60 && x <= 86 && y > 140 && y <= 196);
  layer([20, 16, 14], (x, y) => Math.hypot(x - 60, y - 40) <= 22);
  layer([253, 175, 112], (x, y) => Math.hypot(x - 60, y - 40) <= 18);
  return { width, height, rgba };
};

const VIEW: TraceView = {
  box: [0, 0, 120, 220],
  classes: { skin: ['#fdaf70'], cream: ['#fde1bc'], teal: ['#4e7182'] },
  head: 'head',
  feet: ['body'],
  parts: {
    head: { seeds: [[60, 40]], doc: 'The head.' },
    body: { seeds: [[50, 100]], plus: ['shade'], doc: 'The body.' },
    shade: { classes: ['teal'], as: 'tones', doc: 'The shade on it.' },
  },
};

/** The box round `pts`. */
const boxOf = (
  pts: ReadonlyArray<readonly [number, number]>,
): readonly [number, number, number, number] => [
  Math.min(...pts.map(([x]) => x)),
  Math.min(...pts.map(([, y]) => y)),
  Math.max(...pts.map(([x]) => x)),
  Math.max(...pts.map(([, y]) => y)),
];

describe('traceView', () => {
  test("reads each part to the inner edge of its line, its points a coarse step apart, its head's centre and its feet", () => {
    const t = Result.getOrThrow(traceView(sheet(), VIEW));
    const head = t.outlines['head'] ?? [];
    const body = t.outlines['body'] ?? [];
    // The head's ink runs from 18 to 22 px out: its outline lies on the inner edge, since the house lays its line outside.
    const [hx0, hy0, hx1, hy1] = boxOf(head);
    expect(Math.abs(hx0 - 42)).toBeLessThanOrEqual(3);
    expect(Math.abs(hx1 - 78)).toBeLessThanOrEqual(3);
    expect(Math.abs(hy0 - 22)).toBeLessThanOrEqual(3);
    expect(Math.abs(hy1 - 58)).toBeLessThanOrEqual(3);
    // The body is the cream and the teal shade the line runs round, as one outline, inside its line (34 to 86, down to 196).
    const [bx0, , bx1, by1] = boxOf(body);
    expect(Math.abs(bx0 - 34)).toBeLessThanOrEqual(2);
    expect(Math.abs(bx1 - 86)).toBeLessThanOrEqual(2);
    expect(Math.abs(by1 - 196)).toBeLessThanOrEqual(2);
    // A point every step or so along the edge: no spike from a fine step.
    for (const pts of [head, body])
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length] ?? p;
        expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeGreaterThan(LEAST_GAP);
      });
    expect(t.tones['shade']?.length).toBe(1);
    expect(t.head?.at[0]).toBeCloseTo(60, -1);
    expect(t.feet?.[0]).toBeCloseTo(60, -1);
    expect(Math.abs((t.feet?.[1] ?? 0) - 196)).toBeLessThanOrEqual(2);
  });

  test('reads each brow between ends half its stroke inside its ink (its round cap reaches them), each mark its own ink, and takes a mouth given by its ends as given', () => {
    const base = sheet();
    const rgba = new Uint8Array(base.rgba);
    // Two eyes and two brows, small ink pieces inside the head.
    for (let y = 26; y <= 44; y++)
      for (let x = 46; x <= 74; x++) {
        const eye =
          Math.hypot((x - 53) / 2, (y - 40) / 4) <= 1 ||
          Math.hypot((x - 67) / 2, (y - 40) / 4) <= 1;
        const brow = y >= 30 && y <= 31 && ((x >= 49 && x <= 56) || (x >= 64 && x <= 71));
        if (eye || brow) rgba.set([20, 16, 14], (y * base.width + x) * 4);
      }
    const view: TraceView = {
      ...VIEW,
      marks: {
        eyes: [
          [53, 40],
          [67, 40],
        ],
        // The left brow's seed lies nearer its eye's ink than its own: the eye, taken first, leaves it the brow.
        brows: [
          [53, 35],
          [68, 30],
        ],
        mouth: {
          ends: [
            [54, 50],
            [66, 51],
          ],
          line: 3,
        },
      },
    };
    const marks = Result.getOrThrow(traceView({ ...base, rgba }, view)).marks;
    expect(marks?.mouth).toEqual([
      [54, 50],
      [66, 51],
    ]);
    expect(marks?.mouthLine).toBe(3);
    expect(Math.abs((marks?.eyes[0][0] ?? 0) - 53.5)).toBeLessThanOrEqual(1);
    // The left brow's ink runs from x 49 to 56 (pixel centres 49.5 to 56.5), two pixels thick: its line, a pixel inside each end.
    const [from, to] = marks?.brows[0] ?? [
      [0, 0],
      [0, 0],
    ];
    expect(from[0]).toBeCloseTo(50.5, 0);
    expect(to[0]).toBeCloseTo(55.5, 0);
  });

  test('refuses a face mark with no ink of its own to read, rather than throw', () => {
    // A figure inked only round its outside: no small piece of ink for a mark.
    const [width, height] = [80, 80];
    const rgba = new Uint8Array(width * height * 4).fill(255);
    for (let y = 10; y < 70; y++)
      for (let x = 10; x < 70; x++) rgba.set([20, 16, 14], (y * width + x) * 4);
    for (let y = 14; y < 66; y++)
      for (let x = 14; x < 66; x++) rgba.set([253, 175, 112], (y * width + x) * 4);
    const traced = traceView(
      { width, height, rgba },
      {
        box: [0, 0, 80, 80],
        classes: { skin: ['#fdaf70'] },
        parts: { head: { seeds: [[40, 40]] } },
        marks: { eyes: [[35, 35]], brows: [[35, 30]], mouth: [40, 50] },
      },
    );
    expect(Result.isFailure(traced) && traced.failure.reason).toContain(
      'the eye at 35,35 finds no ink of its own',
    );
  });

  test('reads a curled part as a disc on each of its lobes', () => {
    // Three lobes of brown, each a disc of radius 10, overlapping in a row, inked round.
    const lobes: ReadonlyArray<readonly [number, number]> = [
      [30, 40],
      [48, 40],
      [66, 40],
    ];
    const [width, height] = [100, 80];
    const rgba = new Uint8Array(width * height * 4).fill(255);
    const paint = (c: readonly [number, number, number], r: number) => {
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (lobes.some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= r))
            rgba.set(c, (y * width + x) * 4);
    };
    paint([20, 16, 14], 14);
    paint([113, 68, 46], 10);
    const t = Result.getOrThrow(
      traceView(
        { width, height, rgba },
        {
          box: [0, 0, 100, 80],
          classes: { hair: ['#71442e'] },
          parts: { hair: { classes: ['hair'], as: 'curls', curl: { min: 4, max: 12 } } },
        },
      ),
    );
    const curls = t.curls['hair'] ?? [];
    expect(curls.length).toBe(3);
    for (const [cx, cy] of lobes)
      expect(
        Math.min(...curls.map((c) => Math.hypot(c.at[0] - cx, c.at[1] - cy))),
      ).toBeLessThanOrEqual(2);
    for (const c of curls) expect(Math.abs(c.r - 9)).toBeLessThanOrEqual(2);
  });

  test('fits a cubic part as a chain whose anchors hold its corners', () => {
    const t = Result.getOrThrow(traceView(sheet(), { ...VIEW, path: 'cubic' }));
    const chain = t.outlines['body'] ?? [];
    expect(chain.length % 3).toBe(0);
    const anchors = chain.filter((_, i) => i % 3 === 0);
    expect(anchors.length).toBeLessThanOrEqual(8);
    // The body's paper runs 34 to 86 across and 66 to 196 down: each corner an anchor, within the pixel its edge loses to antialiasing and the pixel its smoothing rounds.
    for (const [x, y] of [
      [34, 66],
      [86, 66],
      [86, 196],
      [34, 196],
    ] as const)
      expect(Math.min(...anchors.map(([ax, ay]) => Math.hypot(ax - x, ay - y)))).toBeLessThan(3);
  });

  test('opens a sliver off a part, and refuses an outline that doubles back on itself', () => {
    /** The sheet with ink, then skin, painted where each says, over the head's ring of ink. */
    const painted = (
      ink: (x: number, y: number) => boolean,
      skin: (x: number, y: number) => boolean,
    ): Raster => {
      const base = sheet();
      const rgba = new Uint8Array(base.rgba);
      for (let y = 0; y < base.height; y++)
        for (let x = 0; x < base.width; x++) {
          if (ink(x, y)) rgba.set([20, 16, 14], (y * base.width + x) * 4);
          if (skin(x, y)) rgba.set([253, 175, 112], (y * base.width + x) * 4);
        }
      return { ...base, rgba };
    };
    const plain = Result.getOrThrow(traceView(sheet(), VIEW)).outlines['head'] ?? [];
    // A sliver of skin out into the ring, a pixel wide inside its antialiased edge: a slip of the edge, opened off.
    const sliver = painted(
      () => false,
      (x, y) => x >= 59 && x <= 61 && y >= 20 && y < 24,
    );
    expect(Result.getOrThrow(traceView(sliver, VIEW)).outlines['head']).toEqual(plain);
    // A spike of skin five pixels wide and twenty long, inked round, out of the top of the head: the outline turns back at its tip.
    const spike = painted(
      (x, y) => x >= 56 && x <= 64 && y < 22,
      (x, y) => x >= 58 && x <= 62 && y >= 2 && y < 24,
    );
    const refused = traceView(spike, VIEW);
    expect(Result.isFailure(refused) && refused.failure.reason).toContain(
      'the part head doubles back on itself',
    );
  });

  test("smooths a part's edge as far each way as the part asks", () => {
    const corners = (body: TraceView['parts'][string]) => {
      const view: TraceView = { ...VIEW, parts: { ...VIEW.parts, body } };
      const outline = Result.getOrThrow(traceView(sheet(), view)).outlines['body'] ?? [];
      // How near the outline comes to the body's top-left corner.
      return Math.min(...outline.map(([x, y]) => Math.hypot(x - 32, y - 64)));
    };
    const body = { seeds: [[50, 100]], plus: ['shade'] } as const;
    expect(corners({ ...body, smooth: 12 })).toBeGreaterThan(corners(body) + 2);
  });

  test('wears a part in from its edge as far as it asks, so a part less it keeps a rim under it', () => {
    // How far right the body runs in the shade's rows (the shade fills 61 to 86 across, 141 to 196 down).
    const reach = (shade: TraceView['parts'][string]) => {
      const view: TraceView = {
        ...VIEW,
        parts: { ...VIEW.parts, shade, body: { seeds: [[50, 100]], minus: ['shade'] } },
      };
      const body = Result.getOrThrow(traceView(sheet(), view)).outlines['body'] ?? [];
      return Math.max(...body.filter(([, y]) => y > 155 && y < 185).map(([x]) => x));
    };
    const shade = { classes: ['teal'], as: 'none' } as const;
    // Less the whole shade, the body ends where the shade begins; less the shade worn in 6 px, it runs on into it (4 px past its smoothing).
    expect(reach(shade)).toBeLessThan(63);
    expect(reach({ ...shade, shrink: 6 })).toBeGreaterThanOrEqual(reach(shade) + 3);
  });

  test("reads a part to its line's inner edge as well where the line's outer edge is antialiased: a ring of luma 70 outside the ink, seeded or the silhouette", () => {
    const plain = sheet();
    const rgba = new Uint8Array(plain.rgba);
    // One pixel round the outside of the body's and the head's ink, between it and the white ground: luma 70.
    const ring = (x: number, y: number) =>
      ((x === 29 || x === 91) && y >= 61 && y <= 201) ||
      ((y === 61 || y === 201) && x >= 29 && x <= 91) ||
      (Math.hypot(x - 60, y - 40) > 22 && Math.hypot(x - 60, y - 40) <= 23.5);
    for (let y = 0; y < plain.height; y++)
      for (let x = 0; x < plain.width; x++)
        if (ring(x, y)) rgba.set([70, 70, 70], (y * plain.width + x) * 4);
    const ringed: Raster = { ...plain, rgba };
    const view: TraceView = {
      ...VIEW,
      parts: {
        ...VIEW.parts,
        whole: {
          silhouette: true,
          clip: [
            [0, 70],
            [120, 70],
            [120, 220],
            [0, 220],
          ],
          doc: 'The body below the head, as the figure.',
        },
      },
    };
    const boxes = (r: Raster) => {
      const t = Result.getOrThrow(traceView(r, view));
      return ['head', 'body', 'whole'].map((name) => boxOf(t.outlines[name] ?? []));
    };
    const [want, got] = [boxes(plain), boxes(ringed)];
    got.forEach((box, i) =>
      box.forEach((v, j) => expect(Math.abs(v - (want[i]?.[j] ?? 0))).toBeLessThanOrEqual(1)),
    );
  });

  test('reads a band of dark brown paint beside an ear (lighter than ink, no ink by it) as hair: an ear grown into ink alone grows over none of it', () => {
    const [width, height] = [120, 120];
    const rgba = new Uint8Array(width * height * 4).fill(255);
    const layer = (
      rgb: readonly [number, number, number],
      inside: (x: number, y: number) => boolean,
    ) => {
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) if (inside(x, y)) rgba.set(rgb, (y * width + x) * 4);
    };
    // Inked round, 4 px: hair over the top; below it his face, a band 6 px wide, his ear, and a band 17 px wide behind it, then hair.
    layer([20, 16, 14], (x, y) => x >= 10 && x <= 110 && y >= 10 && y <= 110);
    layer([106, 62, 43], (x, y) => x >= 14 && x <= 106 && y >= 14 && y <= 106);
    layer([75, 46, 30], (x, y) => x >= 45 && x <= 83 && y >= 41 && y <= 106);
    layer([253, 175, 112], (x, y) => x >= 14 && x <= 44 && y >= 41 && y <= 106);
    layer([253, 175, 112], (x, y) => x >= 51 && x <= 66 && y >= 55 && y <= 85);
    const view: TraceView = {
      box: [0, 0, width, height],
      classes: { skin: ['#fdaf70'], hair: ['#6a3e2b'], hairDark: ['#4f2b21'] },
      parts: {
        ear: {
          seeds: [[58, 70]],
          clip: [
            [42, 44],
            [74, 44],
            [74, 96],
            [42, 96],
          ],
          into: 'ink',
          doc: 'The ear, grown into the ink round it alone.',
        },
        hairMass: { classes: ['hair', 'hairDark'], as: 'none' },
        hair: {
          within: 'hairMass',
          minus: ['ear'],
          open: 2,
          doc: 'The hair, the band beside the ear too.',
        },
      },
    };
    const t = Result.getOrThrow(traceView({ width, height, rgba }, view));
    const [ex0, , ex1] = boxOf(t.outlines['ear'] ?? []);
    expect(ex0).toBeGreaterThanOrEqual(50.5);
    expect(ex1).toBeLessThanOrEqual(67.5);
    // Even-odd: whether `p` lies inside the hair's outline.
    const hair = t.outlines['hair'] ?? [];
    const inHair = ([px, py]: readonly [number, number]) =>
      hair.reduce((inside, [xi, yi], i) => {
        const [xj, yj] = hair[(i + hair.length - 1) % hair.length] ?? [xi, yi];
        const crosses = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
        return inside !== crosses;
      }, false);
    expect([inHair([48, 70]), inHair([69, 70]), inHair([80, 70])]).toEqual([true, true, true]);
  });

  test("reads a line whose inner part is painted the band's brown (6 px of it inside 1 px of ink) as line: the part ends at the brown's inner edge", () => {
    const [width, height] = [80, 80];
    const rgba = new Uint8Array(width * height * 4).fill(255);
    const layer = (
      rgb: readonly [number, number, number],
      inside: (x: number, y: number) => boolean,
    ) => {
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) if (inside(x, y)) rgba.set(rgb, (y * width + x) * 4);
    };
    // Inked round 6 px, but down its right side 1 px of ink with 6 px of brown inside it; hair within.
    layer([20, 16, 14], (x, y) => x >= 10 && x <= 70 && y >= 10 && y <= 70);
    layer([75, 46, 30], (x, y) => x >= 63 && x <= 69 && y >= 16 && y <= 64);
    layer([106, 62, 43], (x, y) => x >= 16 && x <= 62 && y >= 16 && y <= 64);
    const view: TraceView = {
      box: [0, 0, width, height],
      classes: { hair: ['#6a3e2b'], hairDark: ['#4f2b21'] },
      parts: { hair: { classes: ['hair', 'hairDark'], doc: 'The hair to its line.' } },
    };
    const [x0, , x1] = boxOf(
      Result.getOrThrow(traceView({ width, height, rgba }, view)).outlines['hair'] ?? [],
    );
    // Its left edge on the ink's inner edge, at 16; its right on the brown's, at 63, not the ink's at 70.
    expect(Math.abs(x0 - 16)).toBeLessThanOrEqual(2);
    expect(Math.abs(x1 - 63)).toBeLessThanOrEqual(2);
  });

  test('writes a table that names what it was traced from, with no colour in it', () => {
    const source = tracedModule(
      ['Traced from a test sheet by `film concept trace`.'],
      VIEW,
      Result.getOrThrow(traceView(sheet(), VIEW)),
    );
    expect(source).toContain('// Traced from a test sheet by `film concept trace`.');
    expect(source).toContain('export const HEAD: Pt[] = [');
    expect(source).toContain('export const BODY: Pt[] = [');
    expect(source).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
