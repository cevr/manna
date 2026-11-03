import { describe, expect, test as it } from 'bun:test';
import { Option } from 'effect';
import type { Raster } from '../../core/raster.ts';
import { MAP_IOU, borderPaperOf, canvasOf, figureNumbersOf, registerClip } from './clip-map.ts';

const grey = (w: number, h: number, at: (x: number, y: number) => number): Raster => {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) rgba.set([at(x, y), at(x, y), at(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, rgba };
};

const boxes = (
  w: number,
  h: number,
  ...bs: ReadonlyArray<readonly [number, number, number, number]>
) =>
  grey(w, h, (x, y) => {
    if (bs.some(([l, t, r, b]) => x >= l && x < r && y >= t && y < b)) return 30;
    return 235;
  });

const at = (r: Raster, x: number, y: number) => r.rgba[(y * r.width + x) * 4]!;

describe('clip frames on the canvas', () => {
  it('are each 2 x 2 block mean at an integer map, rounded half to even', () => {
    const video = grey(8, 2, (x) => [0, 1, 1, 2, 2, 3, 3, 4][x]!);
    const canvas = canvasOf(video, { x0: 0, y0: 0, scale: 2 }, [4, 1]);
    expect([0, 1, 2, 3].map((x) => at(canvas, x, 0))).toEqual([0, 2, 2, 4]);
  });

  it("fill what lies outside the video with the border's median, the corners counted twice as numpy does", () => {
    const video = grey(13, 13, (x, y) => {
      if ((x < 4 || x > 8) && (y < 4 || y > 8)) return 200;
      return 10;
    });
    expect(borderPaperOf(video)).toEqual([200, 200, 200]);
    const canvas = canvasOf(video, { x0: -40, y0: 0, scale: 2 }, [3, 3]);
    expect(at(canvas, 0, 0)).toBe(200);
  });

  it('are the area-weighted mean at a fractional scale', () => {
    const video = grey(3, 3, (x) => [0, 90, 180][x]!);
    const canvas = canvasOf(video, { x0: 0, y0: 0, scale: 1.5 }, [2, 2]);
    expect([at(canvas, 0, 0), at(canvas, 1, 0), at(canvas, 1, 1)]).toEqual([30, 150, 150]);
  });
});

describe('clip map', () => {
  const first = boxes(200, 300, [100, 60, 140, 260], [80, 100, 100, 110]);
  const frame0 = boxes(300, 480, [130, 100, 190, 400], [100, 160, 130, 175]);

  it("lays frame 0's figure box on the first frame's and keeps the figure", () => {
    const got = Option.getOrThrow(registerClip(first, frame0));
    expect(got.map).toEqual({ x0: -20, y0: 10, scale: 1.5 });
    expect(got.iou).toBeGreaterThanOrEqual(0.999);
  });

  it('finds an IoU under the bar when the clip stretched the figure one way only', () => {
    const wide = boxes(300, 480, [120, 100, 200, 400], [80, 160, 120, 175]);
    const got = Option.getOrThrow(registerClip(first, wide));
    expect(got.iou).toBeLessThan(MAP_IOU);
  });

  it('is none when either frame shows no figure', () => {
    expect(
      Option.isNone(
        registerClip(
          first,
          grey(300, 480, () => 235),
        ),
      ),
    ).toBe(true);
  });
});

describe("a clip's figure numbers", () => {
  it("are each frame's height over frame 0's, its feet line less frame 0's, and its IoU with the first and last frames", () => {
    const frames = [
      boxes(40, 60, [10, 10, 20, 50]),
      boxes(40, 60, [10, 10, 20, 50]),
      boxes(40, 60, [10, 12, 20, 51]),
      boxes(40, 60, [10, 12, 30, 51]),
    ];
    const n = figureNumbersOf(frames);
    expect(n.heightRatio).toEqual([1, 1, 39 / 40, 39 / 40]);
    expect(n.feetPx).toEqual([0, 0, 1, 1]);
    expect(n.iouFirst).toEqual([1, 1, 380 / 410, 380 / 800]);
    expect(n.iouLast).toEqual([380 / 800, 380 / 800, 390 / 780, 1]);
  });
});
