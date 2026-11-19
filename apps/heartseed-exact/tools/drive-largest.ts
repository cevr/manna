/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noUnknownParameters, node/no-process-env -- a host script that drives the built app through `bun run exact agent`, reads its untyped JSON replies by the fields it checks, and sets the garden's drive controls on its own launch. */

/**
 * What the web's `exact verify` reads at the largest text size (the root
 * font at iOS's largest body, 53 px, on a 390-wide phone), held where the
 * port draws it otherwise than the current Heartseed: a word's slot under no
 * cue stays the line's width at most and its unseen word takes no touch, so
 * a tap on a word peeks that word; and a single verse's `Remove` wraps under
 * its verse instead of running off the screen. At the default size the same
 * `Remove` sits on its verse's line, as the current app's does. Web only
 * (`bun tools/drive-largest.ts`): iOS sets the simulator's own text size,
 * which `exact verify ios` reads. Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
if (host !== 'web') {
  console.log(
    `drive-largest: web only; ${host} sets the simulator's own text size (exact verify ${host} reads it)`,
  );
  process.exit(2);
}
const app = join(import.meta.dir, '..');
if (process.env.HEARTSEED_GARDEN_DRIVE !== '1') {
  const self = Bun.spawn(['bun', import.meta.path, host], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, HEARTSEED_GARDEN_DRIVE: '1' },
  });
  process.exit(await self.exited);
}
const drive = makeDrive({ name: 'drive-largest', host, appDir: app });

/** The phone's width verify reads the largest size at, and that size's root font (Exact's `LARGEST_PX`). */
const WIDTH = 390;
const LARGEST = 'prefer root-font-size 53';
/** The longest word of the verse under no cue (`/cue/none`), the one a slot could run past the line with. */
const LONGEST = 'word-36';
/** The single verse the garden's drive control plants (`plant-one`, `features/garden.contract`). */
const SINGLE = 'Psalms-119-1';
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
const size = ['--size', `${WIDTH}x844`];
const stamp = Date.now().toString(36);

const today = await drive.run(
  ['--storage', `largest-today-${stamp}`, '--reset-storage', '--url', '/cue/none', ...size],
  [
    'clock data',
    'clock settle',
    LARGEST,
    'clock settle',
    `layout ${LONGEST}`,
    'tap word-0',
    'clock settle',
    'state today.peeking',
  ],
);
const longest = frameOf(today[4]);
drive.check(
  "at the largest size a slot is the line's width at most",
  longest !== undefined && longest.x + longest.w <= WIDTH + SLACK,
  longest,
);
drive.check(
  'at the largest size a tap on a word under no cue peeks that word',
  today[7] === 0,
  today[7],
);

const singles = [
  'clock data',
  'type root /verses',
  'clock data',
  'tap plant-one',
  'clock data',
  'back',
  'clock data',
  'clock settle',
  `layout single-button-${SINGLE}`,
  `layout single-remove-${SINGLE}`,
  LARGEST,
  'clock settle',
  `layout single-button-${SINGLE}`,
  `layout single-remove-${SINGLE}`,
];
const home = await drive.run(
  ['--storage', `largest-home-${stamp}`, '--reset-storage', ...size],
  singles,
);
const [verse, remove, verseLarge, removeLarge] = [8, 9, 12, 13].map((at) => frameOf(home[at]));
const middle = (f: Frame) => f.y + f.h / 2;
drive.check(
  "at the default size a single verse's Remove sits on its verse's line",
  verse !== undefined && remove !== undefined && Math.abs(middle(verse) - middle(remove)) <= 1,
  { verse, remove },
);
drive.check(
  "at the largest size a single verse's Remove stays on the screen, under its verse",
  verseLarge !== undefined &&
    removeLarge !== undefined &&
    removeLarge.x >= -SLACK &&
    removeLarge.x + removeLarge.w <= WIDTH + SLACK &&
    removeLarge.y >= verseLarge.y + verseLarge.h - SLACK,
  { verse: verseLarge, remove: removeLarge },
);

process.exit(drive.finish());
