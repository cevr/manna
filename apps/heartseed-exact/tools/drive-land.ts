/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noUnknownParameters -- Exact's app folder cannot import effect (docs/exact.md): a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * An opening's landing read back three times at most (`chooserLandedCheck`
 * in `features/chooser.contract`), held by what is drawn, which a
 * `.test.contract` cannot read at Exact's pin (an authored test reads no
 * frame). Through `@manna/exact-kit/drive` on the web (`bun
 * tools/drive-land.ts web`): Psalm 119:88 opened through Go to at 390 × 844,
 * then the window shortened to 700, 600 and 500. Each height lands the verse
 * again; the first three landings are read back (1, 2, 3 readings) and the
 * fourth is not, so the room it lands at counts from the third's reading.
 * At every height the verse's top sits the room below the scroll's top. The
 * web alone: iOS has no window to resize.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
if (host !== 'web') {
  console.error(`drive-land: the web only (iOS has no window to resize), not ${host}`);
  process.exit(2);
}
const drive = makeDrive({ name: 'drive-land', host, appDir: join(import.meta.dir, '..') });

interface Frame {
  readonly y: number;
}

const frameOf = (reply: unknown): Frame | undefined =>
  (reply as { node?: { space?: { viewport?: Frame } } } | undefined)?.node?.space?.viewport;

const HEIGHTS = [844, 700, 600, 500] as const;
/** The readings an opening may make. */
const LIMIT = 3;
/** What a frame may differ from the room by: the room is fractional, a scroll position whole. */
const SLACK = 1;

const settle = ['clock data', 'clock +100', 'clock settle'];
const read = [
  'state chooserLandReads',
  'state chooserLandRoom',
  'state chooserLandedRoom',
  'layout verse-88',
  'layout chapter-scroll',
];
const open = [
  'clock data',
  'clock settle',
  'tap tab-read',
  ...settle,
  'tap chapter-find',
  ...settle,
  'type goto-find "psalm 119:88"',
  ...settle,
  'tap find-place',
  ...settle,
];
const ops = [...open, ...HEIGHTS.flatMap((height) => [`resize 390x${height}`, ...settle, ...read])];
const replies = await drive.run(
  ['--storage', `land-${Date.now().toString(36)}`, '--reset-storage', '--size', '390x844'],
  ops,
);

interface Reading {
  readonly height: number;
  readonly reads: unknown;
  readonly room: number | undefined;
  readonly landedRoom: unknown;
  readonly drawn: number | undefined;
}

/** A reply that is a number, else undefined. */
const numberOf = (reply: unknown): number | undefined => {
  if (Number.isFinite(reply)) return reply as number;
  return undefined;
};

/** Where `verse` is drawn below `scroll`'s top, when both were laid out. */
const below = (verse: Frame | undefined, scroll: Frame | undefined) => {
  if (verse === undefined || scroll === undefined) return undefined;
  return verse.y - scroll.y;
};

const block = 1 + settle.length + read.length;
const readings: ReadonlyArray<Reading> = HEIGHTS.map((height, at) => {
  const first = open.length + at * block + 1 + settle.length;
  return {
    height,
    reads: replies[first],
    room: numberOf(replies[first + 1]),
    landedRoom: replies[first + 2],
    drawn: below(frameOf(replies[first + 3]), frameOf(replies[first + 4])),
  };
});

drive.check(
  `the readings run 1, 2, 3 and stop at ${LIMIT}: a fourth landing is not read back`,
  readings.map((each) => each.reads).join(',') === '1,2,3,3',
  readings.map((each) => each.reads),
);
drive.check(
  'every height lands the verse again at a new room, the fourth past the limit too',
  new Set(readings.map((each) => each.room)).size === HEIGHTS.length,
  readings.map((each) => each.room),
);
const [, , third, fourth] = readings;
drive.check(
  "past the limit the room counts from the third landing's reading",
  third !== undefined && fourth !== undefined && fourth.landedRoom === third.room,
  { third, fourth },
);
drive.check(
  "at every height the verse is drawn the room below the scroll's top",
  readings.every(
    (each) =>
      each.room !== undefined &&
      each.drawn !== undefined &&
      Math.abs(each.drawn - each.room) <= SLACK,
  ),
  readings.map(({ height, room, drawn }) => ({ height, room, drawn })),
);

process.exit(drive.finish());
