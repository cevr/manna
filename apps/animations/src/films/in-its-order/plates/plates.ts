import type { PaintingSpec } from '@manna/film/canvas';
import babyBackPng from './cold-baby-back.png' with { type: 'file' };
import whatPng from './cold-what.png' with { type: 'file' };
import farTablePng from './far-table.png' with { type: 'file' };
import distancePng from './distance.png' with { type: 'file' };
import nearPng from './near.png' with { type: 'file' };
import pathPng from './path.png' with { type: 'file' };
import skyPng from './sky.png' with { type: 'file' };
import tablePng from './table.png' with { type: 'file' };

export const PANEL = { scale: 1.25, y: 80 } as const;

export const PLANES = { sky: 12, distance: 5, near: 2, guests: 1.15, table: 1 } as const;

export const SKY = {
  key: 'in-its-order/sky',
  png: skyPng,
  size: [1920, 1280],
  at: [0, -100],
} as const satisfies PaintingSpec;

export const DISTANCE = {
  key: 'in-its-order/distance',
  png: distancePng,
  size: [1920, 1280],
  at: [0, -100],
} as const satisfies PaintingSpec;

export const PATH = {
  key: 'in-its-order/path',
  png: pathPng,
  size: [217, 150],
  at: [869, 328],
  open: ['top', 'right', 'bottom', 'left'],
} as const satisfies PaintingSpec;

export const NEAR = {
  key: 'in-its-order/near',
  png: nearPng,
  size: [1920, 1280],
  at: [0, -100],
} as const satisfies PaintingSpec;

export const TABLE = {
  key: 'in-its-order/table',
  png: tablePng,
  size: [1920, 1280],
  at: [0, -100],
} as const satisfies PaintingSpec;

export const FAR_TABLE = {
  key: 'in-its-order/far-table',
  png: farTablePng,
  size: [1920, 244],
  at: [0, 840],
  open: ['top', 'bottom'],
} as const satisfies PaintingSpec;

export const BABY_BACK = {
  key: 'in-its-order/cold-baby-back',
  png: babyBackPng,
  size: [1920, 1280],
  at: [0, -100],
} as const satisfies PaintingSpec;

export const WHAT = {
  key: 'in-its-order/cold-what',
  png: whatPng,
  size: [1920, 1280],
  at: [0, -100],
} as const satisfies PaintingSpec;

export const PATH_BRUSH: ReadonlyArray<readonly [x: number, y: number, r: number]> = [
  [890, 557, 18],
  [898, 556.3, 18],
  [905.9, 555.6, 18],
  [913.9, 554.5, 18],
  [921.7, 553, 17],
  [929.5, 551.3, 18],
  [937.3, 549.6, 18],
  [945.2, 548, 18],
  [953, 546.3, 18],
  [960.8, 544.6, 18],
  [968.6, 543, 18],
  [976.5, 541.4, 18],
  [984.3, 539.7, 18],
  [992.1, 537.8, 18],
  [999.8, 535.9, 18],
  [1007.6, 534, 18],
  [1015.4, 532, 18],
  [1023.1, 530, 18],
  [1030.9, 528, 18],
  [1038.6, 526, 18],
  [1046.3, 523.8, 17.5],
  [1053.9, 521.3, 10],
  [1061.2, 518.2, 12.5],
  [1067.7, 513.5, 16],
  [1067.6, 508, 14],
  [1060.3, 504.7, 9.5],
  [1052.7, 502.2, 9.5],
  [1045, 500.1, 8],
  [1037.2, 498.4, 8],
  [1029.4, 496.8, 8],
  [1021.5, 495.2, 8],
  [1013.7, 493.4, 8],
  [1006, 491.5, 8],
  [998.2, 489.4, 8],
  [990.5, 487.3, 8],
  [983, 484.7, 13],
  [983.8, 478.9, 11],
  [991.3, 475.9, 7.5],
  [998.9, 473.5, 7.5],
  [1006.6, 471.3, 7.5],
  [1014.3, 469.1, 7.5],
  [1021.9, 466.6, 10.5],
  [1025.6, 461.5, 11.5],
  [1018.2, 458.4, 8],
  [1010.6, 456, 7.5],
  [1002.9, 453.8, 12.5],
  [995.3, 451.5, 12.5],
  [987.8, 448.6, 14.5],
  [987, 445.4, 14.5],
];
