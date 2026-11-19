/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noTernary, effect/noUnknownParameters -- Exact's app folder cannot import effect (docs/exact.md): a host script that picks its size by host, drives the built app through `bun run exact agent`, and reads its untyped JSON replies by the fields it checks. */

/**
 * Today's boxes as verify measures them, which a `.test.contract` cannot
 * read at Exact's pin (an authored test reads no frame). Through
 * `@manna/exact-kit/drive` on the host named (`bun tools/drive-boxes.ts
 * web|ios`), at the default text size on Today under no cue: a word's slot is
 * as tall as the current Today's (its underline inside its 30, then 6 under
 * it: 36), so the verse's lines keep the current pitch; and Read's 44-pt box
 * ends at or above the verse's first line while its glyph stays centred on
 * the reference, so nothing drawn moves.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const drive = makeDrive({ name: 'drive-boxes', host, appDir: app });

/** The current Today's slot (`apps/heartseed/src/sayit/draw.tsx`, `slot`): 30 tall with its underline, and 6 under it. */
const SLOT_BOX = 36;
/** What a frame may differ by between hosts' rounding, in points. */
const SLACK = 0.5;

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const frameOf = (reply: unknown): Frame | undefined =>
  (reply as { node?: { space?: { viewport?: Frame } } } | undefined)?.node?.space?.viewport;

const size = host === 'web' ? ['--size', '390x844'] : [];
const store = `today-boxes-${host}-${Date.now().toString(36)}`;
const flags = ['--storage', store, '--reset-storage', '--url', '/cue/none', ...size];
const settle = ['clock data', 'clock settle'];
const boxes = await drive.run(flags, [
  ...settle,
  'layout word-0',
  'layout reference',
  'layout today-read',
]);
const [word, reference, read] = [2, 3, 4].map((at) => frameOf(boxes[at]));
const glyph = frameOf((await drive.run(flags, [...settle, 'layout today-read-glyph']))[2]);

drive.check(
  `a word's slot is ${SLOT_BOX} pt tall, as the current Today's`,
  word !== undefined && Math.abs(word.h - SLOT_BOX) <= SLACK,
  word,
);
drive.check(
  "Read's box ends at or above the verse's first line",
  word !== undefined && read !== undefined && read.y + read.h <= word.y + SLACK,
  { read, word },
);
const middle = (f: Frame) => f.y + f.h / 2;
drive.check(
  "Read's glyph stays centred on the reference",
  glyph !== undefined &&
    reference !== undefined &&
    Math.abs(middle(glyph) - middle(reference)) <= 1,
  { glyph, reference },
);

process.exit(drive.finish());
