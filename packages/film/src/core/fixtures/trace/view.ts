import type { Raster } from '../../raster.ts';
import type { traceView } from '../../trace.ts';

export type TraceView = Parameters<typeof traceView>[1];

export const LEAST_GAP = 8 / 3;

export const sheet = (): Raster => {
  const [width, height] = [120, 220];
  const rgba = new Uint8Array(width * height * 4).fill(255);
  const put = (x: number, y: number, [r, g, b]: readonly [number, number, number]) => {
    const i = (y * width + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
  };
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

export const VIEW: TraceView = {
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

export const boxOf = (
  pts: ReadonlyArray<readonly [number, number]>,
): readonly [number, number, number, number] => [
  Math.min(...pts.map(([x]) => x)),
  Math.min(...pts.map(([, y]) => y)),
  Math.max(...pts.map(([x]) => x)),
  Math.max(...pts.map(([, y]) => y)),
];
