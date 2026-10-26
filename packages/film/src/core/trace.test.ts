import { describe, expect, test } from 'bun:test';
import type { Raster } from './raster.ts';
import { Result } from 'effect';
import { STEP, type TraceView, tracedModule, traceView } from './trace.ts';

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
  test("reads each part to the middle of its line, its points a coarse step apart, its head's centre and its feet", () => {
    const t = Result.getOrThrow(traceView(sheet(), VIEW));
    const head = t.outlines['head'] ?? [];
    const body = t.outlines['body'] ?? [];
    // The head's ink runs from 18 to 22 px out: its outline lies near the middle of it.
    const [hx0, hy0, hx1, hy1] = boxOf(head);
    expect(Math.abs(hx0 - 40)).toBeLessThanOrEqual(3);
    expect(Math.abs(hx1 - 80)).toBeLessThanOrEqual(3);
    expect(Math.abs(hy0 - 20)).toBeLessThanOrEqual(3);
    expect(Math.abs(hy1 - 60)).toBeLessThanOrEqual(3);
    // The body is the cream and the teal shade the line runs round, as one outline.
    const [bx0, , bx1, by1] = boxOf(body);
    expect(Math.abs(bx0 - 32)).toBeLessThanOrEqual(3);
    expect(Math.abs(bx1 - 88)).toBeLessThanOrEqual(3);
    expect(Math.abs(by1 - 198)).toBeLessThanOrEqual(3);
    // A point every STEP pixels or so along the edge: no spike from a fine step.
    for (const pts of [head, body])
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length] ?? p;
        expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeGreaterThan(STEP / 3);
      });
    expect(t.tones['shade']?.length).toBe(1);
    expect(t.head?.at[0]).toBeCloseTo(60, -1);
    expect(t.feet?.[0]).toBeCloseTo(60, -1);
    expect(Math.abs((t.feet?.[1] ?? 0) - 198)).toBeLessThanOrEqual(3);
  });

  test("takes a mouth given by its ends as given, where its ink runs into the line's and reads as no piece of its own", () => {
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
        brows: [
          [52, 30],
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
