/**
 * Screens as agent-device's raw snapshot gives them, for the screen reader's
 * tests (`screen.ts`): Heartseed's chooser over a long chapter, its verses in
 * a scroll view between a fixed header and a fixed footer, as the
 * verify-heartseed simulator (an iPhone 17, 402 × 874 pt) showed it.
 */
import { Option, Schema } from 'effect';

import type { Node } from '../screen.ts';

/** The chooser's verses' scroll view: its frame on screen. */
export const VERSES = { x: 0, y: 175, width: 402, height: 529 } as const;

/** How tall each verse's row is, and how many the chapter holds. */
const ROW = 88;
const ROWS = 176;

/**
 * The chooser with its content scrolled `offset` points down: the app, the
 * header's back, the scroll view and its content, a row per verse
 * (`Psalms 119:<n>`, hittable while its centre lies in the view), and the
 * fixed footer's `Plant` under the view, where agent-device's own scroll
 * starts its swipe (y 721).
 */
export const chooser = (offset: number): ReadonlyArray<Node> => {
  const top = VERSES.y - offset;
  const rows = Array.from({ length: ROWS }, (_, at): Node => {
    const y = top + 8 + at * ROW;
    const centre = y + 36;
    return {
      index: 5 + at,
      parentIndex: 4,
      type: 'Other',
      identifier: 'verse',
      label: `Psalms 119:${at + 1}`,
      rect: { x: 24, y, width: 354, height: 72 },
      checked: false,
      hittable: centre > VERSES.y && centre < VERSES.y + VERSES.height,
    };
  });
  return [
    { index: 0, type: 'Application', rect: { x: 0, y: 0, width: 402, height: 874 } },
    { index: 1, parentIndex: 0, type: 'Window', rect: { x: 0, y: 0, width: 402, height: 874 } },
    {
      index: 2,
      parentIndex: 1,
      type: 'Button',
      label: 'Chapters',
      rect: { x: 24, y: 78, width: 84, height: 44 },
      hittable: true,
    },
    {
      index: 3,
      parentIndex: 1,
      type: 'ScrollView',
      kind: 'scroll-area',
      rect: VERSES,
      hittable: true,
    },
    {
      index: 4,
      parentIndex: 3,
      type: 'Other',
      rect: { x: 0, y: top, width: 402, height: 8 + ROWS * ROW },
      hittable: false,
    },
    ...rows,
    {
      index: 5 + ROWS,
      parentIndex: 1,
      type: 'Button',
      label: 'Plant',
      rect: { x: 24, y: 772, width: 354, height: 56 },
      hittable: true,
    },
  ];
};

/** The hymnal's hymn page's frame: its pager's and the shown page's, one and the same. */
export const PAGE = { x: 0, y: 116, width: 402, height: 668 } as const;

/** The About sheet's scroll view's frame over the hymn page. */
export const SHEET = { x: 8, y: 495, width: 386, height: 371 } as const;

/**
 * The hymnal's hymn page as verify-hymnal showed it live: the pager's
 * scroll view and the shown page's share `PAGE`; the page's content sits at
 * `pageY`, its neighbours lie off screen across; with `sheetY`, the About
 * sheet's scroll view, later in the tree, covers the page's lower half with
 * its content at `sheetY`, `sheetHeight` tall (the About sheet's 1103 runs
 * past the sheet; a height up to `SHEET`'s fits).
 */
export const hymnPage = (
  pageY: number,
  sheetY: Option.Option<number> = Option.none(),
  sheetHeight = 1103,
): ReadonlyArray<Node> => [
  { index: 0, type: 'Application', rect: { x: 0, y: 0, width: 402, height: 874 } },
  {
    index: 23,
    parentIndex: 0,
    type: 'ScrollView',
    kind: 'scroll-area',
    rect: PAGE,
    hittable: true,
  },
  {
    index: 24,
    parentIndex: 23,
    type: 'Other',
    rect: { x: -39798, y: 116, width: 279390, height: 668 },
  },
  { index: 531, parentIndex: 24, type: 'ScrollView', rect: { ...PAGE, x: -402 }, hittable: false },
  { index: 532, parentIndex: 531, type: 'Other', rect: { ...PAGE, x: -402, height: 2189 } },
  {
    index: 1121,
    parentIndex: 24,
    type: 'ScrollView',
    kind: 'scroll-area',
    rect: PAGE,
    hittable: true,
  },
  { index: 1122, parentIndex: 1121, type: 'Other', rect: { ...PAGE, y: pageY, height: 2491 } },
  { index: 1790, parentIndex: 24, type: 'ScrollView', rect: { ...PAGE, x: 402 }, hittable: false },
  { index: 1791, parentIndex: 1790, type: 'Other', rect: { ...PAGE, x: 402, height: 1400 } },
  ...Option.toArray(sheetY).flatMap((y): ReadonlyArray<Node> => [
    {
      index: 2761,
      parentIndex: 0,
      type: 'ScrollView',
      kind: 'scroll-area',
      rect: SHEET,
      hittable: true,
    },
    { index: 2762, parentIndex: 2761, type: 'Other', rect: { ...SHEET, y, height: sheetHeight } },
  ]),
];

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** agent-device's raw snapshot answer holding `nodes`. */
export const snapshotOf = (nodes: ReadonlyArray<Node>) => encodeJson({ data: { nodes } });
