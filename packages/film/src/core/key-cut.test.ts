import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { labOf } from './cast-sheet-pixels.ts';
import { INK_WIDTH, cutLimb, fitKey, handPast, keyInFrame } from './key-cut.ts';
import type { Raster } from './raster.ts';

const PAPER = [250, 246, 238] as const;
const INK = [40, 30, 28] as const;
const SLEEVE = [90, 120, 170] as const;
const BODY = [150, 90, 60] as const;

const paper = (width: number, height: number): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([...PAPER, 255], i * 4);
  return { width, height, rgba };
};
const fill = (r: Raster, box: readonly [number, number, number, number], c: readonly number[]) => {
  for (let y = box[1]; y < box[3]; y++)
    for (let x = box[0]; x < box[2]; x++) r.rgba.set([...c, 255], (y * r.width + x) * 4);
};
// a body block, and an arm out to its right: a sleeve inked round, on a bone from (20, 20) to (44, 20)
const figure = (r: Raster, at: readonly [number, number]) => {
  const [ox, oy] = at;
  fill(r, [ox + 4, oy + 8, ox + 18, oy + 40], BODY);
  fill(r, [ox + 18, oy + 15, ox + 46, oy + 26], INK);
  fill(r, [ox + 19, oy + 17, ox + 45, oy + 24], SLEEVE);
  return r;
};

describe('a drawn key cut into the sheet frame', () => {
  test('the fit finds the drawing where it lies, and the frame lays it back on the view', () => {
    const view = figure(paper(56, 48), [0, 0]);
    const drawn = figure(paper(70, 60), [9, 6]);
    const fit = fitKey(drawn, view, () => true);
    expect([fit.s, fit.dx, fit.dy]).toEqual([1, 9, 6]);
    expect(fit.error).toBe(0);
    expect(fit.ground).toEqual(PAPER);
    // a frame padded 3 left and 2 above: its pixel (x, y) is the view's (x - 3, y - 2), flat paint read back whole
    const framed = keyInFrame(drawn, fit, [60, 52], [3, 2]);
    const px = (x: number, y: number) => [
      ...framed.rgba.subarray((y * 60 + x) * 4, (y * 60 + x) * 4 + 4),
    ];
    expect([px(33, 22), px(10, 32), px(1, 1)]).toEqual([
      [...SLEEVE, 255],
      [...BODY, 255],
      [...PAPER, 255],
    ]);
  });

  test('the limb is its sleeve and the ink round it, and nothing of the body', () => {
    const r = figure(paper(56, 48), [0, 0]);
    const cut = cutLimb(r, PAPER, {
      root: [20, 20.5],
      elbow: [32, 20.5],
      wrist: [44, 20.5],
      rUpper: 7,
      rFore: 7,
    });
    // from the ink left of the sleeve to the wrist and one pixel past it: the ink beyond, and the body, stay
    expect(cut.at).toEqual([18, 15]);
    expect([cut.raster.width, cut.raster.height]).toEqual([27, 11]);
    const at = (x: number, y: number) => [
      ...cut.raster.rgba.subarray((y * 27 + x) * 4, (y * 27 + x) * 4 + 4),
    ];
    expect(at(10, 5)).toEqual([...SLEEVE, 255]);
    expect(at(10, 0)).toEqual([...INK, 255]);
  });

  test('the hand stands the same reach past the wrist along the forearm, whichever way it points', () => {
    // hanging down, as at rest
    expect(handPast([40, 300], [40, 370], 24)).toEqual([40, 394]);
    // raised, the forearm up and out: 24 px on from the wrist, not back at the cuff or off the line
    const [x, y] = handPast([30, 320], [60, 280], 25);
    expect([x, y]).toEqual([75, 260]);
    expect(Math.hypot(x - 60, y - 280)).toBeCloseTo(25, 9);
  });
});

describe("a drawn key's silhouette inked at the house width", () => {
  // an arm across the frame, its sleeve rows 30-70 inked `drawn` px deep at top and bottom; its
  // bones from (40, 50.5) to (130, 50.5), so the capsules cut it through at both ends
  const arm = (drawn: number) => {
    const r = paper(160, 100);
    fill(r, [4, 30, 156, 71], INK);
    fill(r, [4, 30 + drawn, 156, 71 - drawn], SLEEVE);
    return cutLimb(
      r,
      PAPER,
      { root: [40, 50.5], elbow: [85, 50.5], wrist: [130, 50.5], rUpper: 22, rFore: 22 },
      Option.some(labOf(INK)),
    );
  };
  const lPx = (r: Raster, x: number, y: number) => {
    const i = (y * r.width + x) * 4;
    return labOf([r.rgba[i] ?? 0, r.rgba[i + 1] ?? 0, r.rgba[i + 2] ?? 0])[0];
  };
  // L* bilinear at a point, px centres at +0.5, the clear px read as their bytes (black)
  const lAt = (r: Raster, x: number, y: number) => {
    const [u, v] = [Math.max(0, Math.min(r.width - 1.001, x - 0.5)), y - 0.5];
    const [x0, y0] = [Math.floor(u), Math.max(0, Math.min(r.height - 2, Math.floor(v)))];
    const [tx, ty] = [u - x0, Math.max(0, Math.min(1, v - y0))];
    const row = (yy: number) => lPx(r, x0, yy) * (1 - tx) + lPx(r, x0 + 1, yy) * tx;
    return row(y0) * (1 - ty) + row(y0 + 1) * ty;
  };
  // the run of ink (L* < 40) from the alpha edge inward on 0.25 px steps, from (x, y) out along dy
  const inkAcross = (r: Raster, x: number, y: number, dy: 1 | -1) => {
    const isFig = (yy: number) =>
      yy >= 0 &&
      yy < r.height &&
      r.rgba[(Math.floor(yy) * r.width + Math.floor(x)) * 4 + 3] === 255;
    let d = 0;
    while (isFig(y + dy * (d + 0.25))) d += 0.25;
    let [start, last] = [-1, 0];
    for (let k = 0; k <= 24; k += 0.25) {
      if (lAt(r, x, y + dy * (d - k)) >= 40) {
        if (start >= 0) break;
        continue;
      }
      if (start < 0) start = k;
      last = k;
    }
    return last - start + 0.25;
  };

  test('a thin drawn outline comes out the house width, read across the edge at sub-pixel steps', () => {
    const { raster } = arm(2);
    const widths = [30.1, 47.3, 60.5, 71.75, 88.9].flatMap((x) =>
      [0, 0.1, 0.2].flatMap((o) => [
        inkAcross(raster, x, 20 + o, -1),
        inkAcross(raster, x, 20 + o, 1),
      ]),
    );
    for (const w of widths) expect(Math.abs(w - INK_WIDTH)).toBeLessThanOrEqual(0.25);
    expect(widths.toSorted((a, b) => a - b)[widths.length >> 1]).toBe(INK_WIDTH);
  });

  test("the drawing inside the line is untouched, and the capsules' cut ends take no line", () => {
    const { raster, at } = arm(2);
    const row = 50 - at[1];
    // deeper than the line from the top and bottom edges: the sleeve as drawn
    for (let y = 40 - at[1]; y <= 60 - at[1]; y++)
      for (let x = 30; x <= 80; x += 5)
        expect([
          ...raster.rgba.subarray((y * raster.width + x) * 4, (y * raster.width + x) * 4 + 4),
        ]).toEqual([...SLEEVE, 255]);
    // the shoulder's end and the wrist's, at the bone: sleeve to the cut
    const opaque = (x: number) => raster.rgba[(row * raster.width + x) * 4 + 3] === 255;
    const ends = [0, raster.width - 1].map((x) => [
      ...raster.rgba.subarray((row * raster.width + x) * 4, (row * raster.width + x) * 4 + 3),
    ]);
    expect([opaque(0), opaque(raster.width - 1)]).toEqual([true, true]);
    expect(ends).toEqual([[...SLEEVE], [...SLEEVE]]);
  });

  test('a drawn outline wider than the house line is taken into it: one line, no ink behind it', () => {
    const { raster } = arm(11);
    for (const x of [30.4, 60.5, 88.2]) {
      expect(Math.abs(inkAcross(raster, x, 20, -1) - INK_WIDTH)).toBeLessThanOrEqual(0.25);
      // the second line it would leave: none, sleeve from past the line to the middle
      for (let y = 10; y <= 20; y++) expect(lPx(raster, Math.floor(x), y)).toBeGreaterThan(40);
    }
  });
});
