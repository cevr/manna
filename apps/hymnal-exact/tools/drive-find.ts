/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, effect/noKnownValueWidening, eslint/no-await-in-loop, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads its replies and a screenshot's pixels and prints what it found; its shots folder is named by SHOTS. */

/**
 * Finding's live checks (spec B), which a `.test.contract` cannot hold at
 * Exact's pin, on the host named (`bun tools/drive-find.ts web|ios`):
 *
 * - the drums are the platform's adjustable controls: `tree --ax` reads
 *   each as a slider whose value is its digit, and an increment (VoiceOver's
 *   swipe up, a desktop reader's arrow) turns one;
 * - a pinch in on the home list shows the tiles and a pinch out closes
 *   them, where the driver can pinch: the web's is a trackpad's, a wheel
 *   with Control held; iOS's is `tap … pinch`, and what each driver gave is
 *   printed beside the check;
 * - a tap outside the drums closes them and opens nothing (on iOS a tap
 *   on UIKit's backdrop, which only a drive can aim at a point);
 * - on the web, a section header's glyphs are painted in the brand's muted
 *   role, light and dark, from a screenshot's pixels.
 *
 * The bar's three rows, the drums and the tiles are kept in SHOTS, light
 * and dark. Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { theme } from '@manna/hymnal-app/theme';

import { pixelAt } from './pixel.ts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots/find');
const shotFile = (name: string) => join(shots, `${name}-${host}.png`);
const shot = (name: string) => `screenshot ${shotFile(name)}`;
const drive = makeDrive({ name: 'drive-find', host, appDir: app });

type Scheme = 'light' | 'dark';

/** A colour's red, green and blue from `#rrggbb`; `[]` when it is not one. */
const channels = (colour: string): ReadonlyArray<number> => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/iu.exec(colour);
  if (!hex) return [];
  return hex.slice(1, 4).map((pair) => Number.parseInt(pair, 16));
};

const distance = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) =>
  Math.max(...a.map((value, at) => Math.abs(value - (b[at] ?? 999))));

type Frame = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** A layout reply's frame in the viewport, and the viewport's size. */
const frameOf = (reply: unknown): { frame?: Frame; width: number; height: number } => {
  const shown = reply as
    | { viewport?: { w: number; h: number }; node?: { space?: { viewport?: Frame } } }
    | undefined;
  return {
    frame: shown?.node?.space?.viewport,
    width: shown?.viewport?.w ?? 0,
    height: shown?.viewport?.h ?? 0,
  };
};

/**
 * The glyph pixel of `frame` in the shot `name` farthest from the ground:
 * a text's core, where antialiasing leaves its colour whole.
 */
const corePixel = async (name: string, reply: unknown, scheme: Scheme) => {
  const { frame, width, height } = frameOf(reply);
  if (frame === undefined || width === 0 || height === 0) return [];
  const ground = channels(theme[scheme].ground);
  const points: Array<{ x: number; y: number }> = [];
  for (let y = frame.y + frame.h * 0.3; y <= frame.y + frame.h * 0.7; y += frame.h / 8)
    for (let x = frame.x + 1; x < frame.x + Math.min(frame.w, 120); x += 1)
      points.push({ x: x / width, y: y / height });
  let core: ReadonlyArray<number> = [];
  for (const at of points) {
    const painted = await pixelAt(shotFile(name), at).catch(() => []);
    if (
      painted.length === 3 &&
      (core.length === 0 || distance(painted, ground) > distance(core, ground))
    )
      core = painted;
  }
  return core;
};

/** Each slider of a `tree --ax` reply, by its testId: its role and value. */
const slidersOf = (reply: unknown) => {
  const elements =
    (
      reply as
        | { ax?: { elements?: Array<{ testId?: string; role?: string; value?: string }> } }
        | undefined
    )?.ax?.elements ?? [];
  return new Map(
    elements
      .filter((each) => each.testId?.startsWith('drum-'))
      .map((each) => [each.testId ?? '', { role: each.role ?? '', value: each.value ?? '' }]),
  );
};

const pinchIn =
  host === 'web' ? 'tap hymn-list wheel 0 40 modifiers Control' : 'tap hymn-list pinch 0.5';
const pinchOut = host === 'web' ? 'tap tiles wheel 0 -60 modifiers Control' : 'tap tiles pinch 2';

const looks = (scheme: Scheme) => [
  `prefer prefers-color-scheme ${scheme}`,
  'clock settle',
  'layout section-adoration-and-praise',
  shot(`folded-${scheme}`),
  'tap find-search',
  'clock settle',
  'clock data',
  'type search "praise"',
  'clock settle',
  'clock data',
  shot(`searching-${scheme}`),
  'tap find-cancel',
  'clock settle',
  'clock data',
  'tap find-number',
  'clock settle',
  shot(`drums-${scheme}`),
  'tap drums-hash',
  'clock settle',
  'tap tiles-show',
  'clock settle',
  'clock data',
  shot(`tiles-${scheme}`),
  'tap tiles-done',
  'clock settle',
];

const launched = await drive.launch('find', [
  'clock data',
  'tap find-number',
  'clock settle',
  'tree --ax',
  'type drum-ones adjust up',
  'clock settle',
  'clock data',
  'state find.number',
  'tree --ax',
  'tap drums-hash',
  'clock settle',
  'clock data',
  pinchIn,
  'clock settle',
  'clock data',
  'state find.tiles',
  pinchOut,
  'clock settle',
  'clock data',
  'state find.tiles',
  ...looks('light'),
  ...looks('dark'),
]);

const before = slidersOf(launched[3]);
drive.check(
  'the drums are three sliders, each its digit as value (1: 0, 0, 1)',
  ['drum-hundreds', 'drum-tens', 'drum-ones'].every((id) => before.get(id)?.role === 'slider') &&
    before.get('drum-hundreds')?.value === '0' &&
    before.get('drum-tens')?.value === '0' &&
    before.get('drum-ones')?.value === '1',
  [...before],
);
drive.check('an increment of the ones turns the number to 2', launched[7] === 2, launched[7]);
drive.check(`the ones read 2 after it`, slidersOf(launched[8]).get('drum-ones')?.value === '2', [
  ...slidersOf(launched[8]),
]);
drive.check(`a pinch in on the list shows the tiles (${pinchIn})`, launched[15] === true, {
  reply: launched[12],
  tiles: launched[15],
});
drive.check(`a pinch out on the tiles closes them (${pinchOut})`, launched[19] === false, {
  reply: launched[16],
  tiles: launched[19],
});

const outside = await drive.launch('find-outside', [
  'clock data',
  'tap find-number',
  'clock settle',
  'state find.drums',
  'tap root at 20 800',
  'clock settle',
  'clock data',
  'state find.drums',
  'state find.go.serial',
  'state find.top',
]);
drive.check(
  'a tap outside the drums (tap root at 20 800) closes them and opens nothing',
  outside[3] === true && outside[7] === false && outside[8] === 0 && outside[9] === '/',
  { open: outside[3], tap: outside[4], after: outside[7], go: outside[8], top: outside[9] },
);

const LOOKS = 20;
if (host === 'web')
  for (const [scheme, base] of [
    ['light', LOOKS],
    ['dark', LOOKS + looks('light').length],
  ] as const) {
    const core = await corePixel(`folded-${scheme}`, launched[base + 2], scheme);
    const muted = channels(theme[scheme].muted);
    const ink = channels(theme[scheme].ink);
    drive.check(
      `a section header is painted the brand's ${scheme} muted, not its ink`,
      core.length === 3 &&
        distance(core, muted) <= 12 &&
        distance(core, muted) < distance(core, ink),
      { core, muted, ink },
    );
  }

process.exit(drive.finish());
