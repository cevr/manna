// What `milk` draws, as painted plates (`PaintingSpec`): the empty parchment
// page, painted to the kept panel `board/milk.newborn.5.png` with its figure,
// book and ribbon painted out, on the courtyard's grid (1920 x 1280, the frame
// showing its rows 100..1180); the book, the white ribbon and the ink dropper,
// keyed out of the kept prop sheet (`prop-sheet/tries/props-3.png`) on its
// flat paper; and the five drinkers of the kept drinking row
// (`drink-sheet/tries/drink-2.png`), each keyed whole with its soft floor
// shadow as a see-through tint. Each PNG is imported beside its spec, and
// every one but the page is clear on all four sides. Pure data.

import type { PaintingSpec } from '@manna/film/canvas';
import babyPng from './milk-baby.png' with { type: 'file' };
import bookOpenPng from './milk-book-open.png' with { type: 'file' };
import bookShutPng from './milk-book-shut.png' with { type: 'file' };
import childPng from './milk-child.png' with { type: 'file' };
import dropperPng from './milk-dropper.png' with { type: 'file' };
import leadPng from './milk-lead.png' with { type: 'file' };
import pagePng from './milk-page.png' with { type: 'file' };
import ribbonPng from './milk-ribbon.png' with { type: 'file' };
import toddlerPng from './milk-toddler.png' with { type: 'file' };
import villagerPng from './milk-villager.png' with { type: 'file' };

const CLEAR = ['top', 'right', 'bottom', 'left'] as const;

/** The parchment page, peach-cream with gold rays from the top left, opaque over the whole plate. */
export const PAGE = {
  key: 'in-its-order/milk-page',
  png: pagePng,
  size: [1920, 1280],
  at: [0, -100],
} as const satisfies PaintingSpec;

/** The open book, its pages up; its centre at the origin. */
export const BOOK_OPEN = {
  key: 'in-its-order/milk-book-open',
  png: bookOpenPng,
  size: [431, 239],
  at: [-215.5, -119.5],
  open: CLEAR,
} as const satisfies PaintingSpec;

/** The shut book standing, its spine on the left; its centre at the origin. */
export const BOOK_SHUT = {
  key: 'in-its-order/milk-book-shut',
  png: bookShutPng,
  size: [262, 264],
  at: [-131, -132],
  open: CLEAR,
} as const satisfies PaintingSpec;

/** The white ribbon, twisting down from its top end; its own px, the top-left at the origin. */
export const RIBBON = {
  key: 'in-its-order/milk-ribbon',
  png: ribbonPng,
  size: [150, 315],
  at: [0, 0],
  open: CLEAR,
} as const satisfies PaintingSpec;

/**
 * The ribbon's rows, its own px, every 5 down from its top end to its foot:
 * the row and where the ribbon's opaque pixels start and end on it. It runs
 * down one row at a time, so a clip of its rows from one to another reveals it
 * along its length.
 */
export const RIBBON_ROWS: ReadonlyArray<readonly [y: number, x0: number, x1: number]> = [
  [5, 44, 68],
  [10, 36, 80],
  [15, 30, 90],
  [20, 25, 100],
  [25, 20, 106],
  [30, 16, 109],
  [35, 12, 110],
  [40, 9, 110],
  [45, 6, 109],
  [50, 4, 108],
  [55, 3, 106],
  [60, 2, 104],
  [65, 2, 102],
  [70, 3, 99],
  [75, 4, 96],
  [80, 5, 72],
  [85, 7, 81],
  [90, 10, 90],
  [95, 13, 99],
  [100, 16, 108],
  [105, 20, 115],
  [110, 25, 122],
  [115, 30, 128],
  [120, 36, 133],
  [125, 43, 136],
  [130, 51, 140],
  [135, 60, 142],
  [140, 69, 144],
  [145, 77, 145],
  [150, 85, 146],
  [155, 91, 147],
  [160, 97, 147],
  [165, 95, 146],
  [170, 86, 146],
  [175, 76, 144],
  [180, 67, 143],
  [185, 58, 140],
  [190, 50, 138],
  [195, 43, 135],
  [200, 38, 131],
  [205, 33, 127],
  [210, 30, 122],
  [215, 28, 116],
  [220, 27, 108],
  [225, 27, 98],
  [230, 27, 88],
  [235, 28, 90],
  [240, 29, 92],
  [245, 30, 94],
  [250, 31, 95],
  [255, 31, 97],
  [260, 32, 98],
  [265, 32, 99],
  [270, 32, 100],
  [275, 32, 101],
  [280, 32, 101],
  [285, 35, 102],
  [290, 49, 102],
  [295, 62, 103],
  [300, 73, 103],
  [305, 83, 103],
  [310, 92, 101],
];

/** The ink dropper, leaning, a drop of ink under its tip; its tip at the origin. */
export const DROPPER = {
  key: 'in-its-order/milk-dropper',
  png: dropperPng,
  size: [53, 168],
  at: [-14, -130],
  open: CLEAR,
} as const satisfies PaintingSpec;

/**
 * The drinking row's five, left to right, each its feet's centre at the
 * origin. `sheet` is where the keyed figure's top-left lay on the kept row
 * (`drink-2.png`, 1536 x 1024), so a scene lays the row as the sheet does.
 */
export const DRINKERS = [
  {
    key: 'in-its-order/milk-baby',
    png: babyPng,
    size: [246, 307],
    at: [-123, -307],
    open: CLEAR,
    sheet: [38, 552],
  },
  {
    key: 'in-its-order/milk-toddler',
    png: toddlerPng,
    size: [251, 306],
    at: [-125.5, -306],
    open: CLEAR,
    sheet: [313, 552],
  },
  {
    key: 'in-its-order/milk-child',
    png: childPng,
    size: [259, 481],
    at: [-129.5, -481],
    open: CLEAR,
    sheet: [622, 379],
  },
  {
    key: 'in-its-order/milk-villager',
    png: villagerPng,
    size: [278, 626],
    at: [-139, -626],
    open: CLEAR,
    sheet: [913, 233],
  },
  {
    key: 'in-its-order/milk-lead',
    png: leadPng,
    size: [277, 615],
    at: [-138.5, -615],
    open: CLEAR,
    sheet: [1227, 242],
  },
] as const satisfies ReadonlyArray<PaintingSpec & { readonly sheet: readonly [number, number] }>;
