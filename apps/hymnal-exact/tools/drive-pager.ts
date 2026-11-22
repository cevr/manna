/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, node/no-process-env, eslint/no-await-in-loop -- a host script that drives the built app through `bun run exact agent`, one run at a time, reads its untyped JSON replies by the fields it checks, and compares its screenshots frame by frame. */

/**
 * The hymn pager in the built app (`features/pager.contract`), as a reader
 * meets it: `bun tools/drive-pager.ts web` (or `ios`).
 *
 * - The settle: after a swipe from hymn 2 to hymn 3, every frame from the
 *   moment the route names hymn 3 is the page it rests on, pixel for pixel,
 *   so the `replace` that follows the page shows no frame of another hymn
 *   and no jump; and every frame of the swipe shows a page's words, never
 *   a blank strip.
 * - The pages beside the shown one are out of reach of assistive tech: the
 *   accessibility tree names the shown page's number and title and no
 *   other page's, and lists the shown page's parts in the order drawn.
 * - The hymn swiped to has its chords' line drawn on its own page only: a
 *   chord a neighbour draws under a shared id is not on the shown page.
 * - On the web the back control is a chevron and the word "Hymns", as the
 *   current hymnal's web header (`WebStackHeader`).
 * - Hymn 2 opened from home and shot twice: after each shot its page is
 *   still the one in the port, and each shot paints hymn 2's page, not hymn
 *   1's under hymn 2's title (the agent's capture lays the page out beyond
 *   the viewport, which puts the pager at its start; the pager puts the
 *   shown page back).
 * - Launched at `/hymns/100`, the app draws 99, 100 and 101, lays hymn
 *   100's page out in the port, paints it as hymn 100 pressed in a search
 *   paints, and a swipe left turns to 101.
 * - At the largest text (root 53 px) hymn 100's title wraps between its
 *   words and breaks only a word longer than its line, as UIKit breaks the
 *   current hymnal's: the shot is kept for a look.
 *
 * Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { theme } from '@manna/hymnal-app/theme';

import { changedPixels, pixelAt } from './pixel.ts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const drive = makeDrive({ name: 'drive-pager', host, appDir: app });
const shots = process.env.SHOTS ?? join(app, '.exact/shots/pager');
const shotFile = (name: string) => join(shots, `${name}-${host}.png`);
const shot = (name: string) => `screenshot ${shotFile(name)}`;
const flags = (store: string) => [
  '--storage',
  `${store}-${host}-${Date.now().toString(36)}`,
  '--reset-storage',
  '--size',
  '420x900',
];

/** How many frames, about 16 ms apart, are read after the finger lifts. */
const FRAMES = 32;
/** The pixels a frame may paint apart from the rest it settles into: a caret's or a shadow's antialiasing, not a page. */
const SAME = 400;
/** The pixels two hymns' screens paint apart at least when their pages differ, not only their header's title. */
const PAGES_APART = 20000;

/** A colour's red, green and blue from `#rrggbb`. */
const channels = (colour: string): ReadonlyArray<number> =>
  (/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/iu.exec(colour)?.slice(1, 4) ?? []).map((pair) =>
    Number.parseInt(pair, 16),
  );

const ground = channels(theme.light.ground);

/** Whether the shot paints words across the middle of the screen: some pixel well off the ground on any of a few rows. */
const inked = async (file: string) => {
  for (const y of [0.3, 0.4, 0.5, 0.6])
    for (let x = 0.05; x < 0.95; x += 0.005) {
      const painted = await pixelAt(file, { x, y });
      if (painted.some((value, at) => Math.abs(value - (ground[at] ?? 0)) > 60)) return true;
    }
  return false;
};

/** A `state` reply's route: the hymn the stack's top names. */
const openOf = (reply: unknown) =>
  (
    (
      reply as
        | { slots?: { nav?: { tabs?: Array<{ stack?: Array<{ url?: string }> }> } } }
        | undefined
    )?.slots?.nav?.tabs?.[0]?.stack?.at(-1)?.url ?? ''
  ).replace('/hymns/', '');

const toHymn2 = [
  'clock data',
  'clock settle',
  'tap hymn-2',
  'clock settle',
  'clock data',
  'clock +500 real',
  'state',
];

const frames = Array.from({ length: FRAMES }, (_, at) => [
  'state',
  shot(`swipe-${at}`),
  'clock +16 real',
]).flat();
const swipe = await drive.run(flags('pager-settle'), [
  ...toHymn2,
  'tap hymn-pager drag -300 0 from 300 300',
  ...frames,
  'clock settle',
  'clock data',
  'clock +800 real',
  'state',
  shot('rest'),
]);
const opens = Array.from({ length: FRAMES }, (_, at) => openOf(swipe[toHymn2.length + 1 + at * 3]));
const rest = openOf(swipe.at(-2));
drive.check('a swipe left from hymn 2 rests on hymn 3', rest === '3', { rest, opens });
const turned = opens.indexOf('3');
drive.check('the route turns to hymn 3 within the frames read', turned >= 0, opens);
const after: Array<{ frame: number; changed: number }> = [];
if (turned >= 0)
  for (let at = turned; at < FRAMES; at += 1) {
    const changed = await changedPixels(shotFile(`swipe-${at}`), shotFile('rest'));
    if (changed > SAME) after.push({ frame: at, changed });
  }
drive.check(
  'from the frame the route names hymn 3, each frame is the page it rests on (no flash, no jump)',
  turned >= 0 && after.length === 0,
  after,
);
const blank: Array<number> = [];
for (let at = 0; at < FRAMES; at += 1) if (!(await inked(shotFile(`swipe-${at}`)))) blank.push(at);
drive.check('every frame of the swipe shows words, none a blank page', blank.length === 0, blank);

const ax = await drive.run(flags('pager-ax'), [...toHymn2, 'tree --ax', 'tree']);
const elements =
  (
    ax[toHymn2.length] as
      | { ax?: { elements?: Array<{ testId?: string; label?: string }> } }
      | undefined
  )?.ax?.elements ?? [];
const named = elements.map((each) => each.testId ?? '').filter((id) => id !== '');
const neighbours = named.filter((id) => /^hymn-(page|words|name|number)-\d+$/u.test(id));
drive.check(
  'the accessibility tree holds the shown page and no page beside it',
  named.includes('hymn-number') && named.includes('hymn-page') && neighbours.length === 0,
  { neighbours, named: named.slice(0, 40) },
);
const order = ['hymn-back', 'hymn-title', 'hymn-number', 'line-stanza-1-1'].map((id) =>
  named.indexOf(id),
);
drive.check(
  'the shown page reads in the order drawn: back, title, its number, its first line',
  order.every((at, i) => at >= 0 && (i === 0 || at > (order[i - 1] ?? -1))),
  { order },
);

const tree = JSON.stringify(ax[toHymn2.length + 1] ?? null);
const backAt = tree.indexOf('"testId":"hymn-back"');
drive.check(
  'the back control draws a chevron beside "Hymns"',
  backAt >= 0 && /symbol:back/u.test(tree),
  { backAt },
);

interface TreeNode {
  readonly id: number;
  readonly props?: { readonly testId?: string };
  readonly children?: ReadonlyArray<number>;
}

/** The testIds under the node of `testId` in a `tree` reply, its own included. */
const testIdsUnder = (reply: unknown, testId: string) => {
  const nodes = (reply as { nodes?: ReadonlyArray<TreeNode> } | undefined)?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const found: Array<string> = [];
  const take = (id: number) => {
    const node = byId.get(id);
    if (node === undefined) return;
    found.push(node.props?.testId ?? '');
    for (const child of node.children ?? []) take(child);
  };
  for (const node of nodes) if (node.props?.testId === testId) take(node.id);
  return found;
};

const chorded = await drive.run(flags('pager-chords'), [
  'clock data',
  'tap gear',
  'clock settle',
  'clock data',
  'tap chords-toggle',
  'clock settle',
  'clock data',
  'tap settings-done',
  'clock settle',
  ...toHymn2,
  'tree',
]);
const onPage = testIdsUnder(chorded.at(-1), 'hymn-page');
drive.check(
  'with chords on, hymn 2’s page draws its chord 1-1-1 and none at 1-1-2 (a neighbour’s id)',
  onPage.includes('chord-1-1-1') && !onPage.includes('chord-1-1-2'),
  onPage.filter((id) => id.startsWith('chord-1-1-')),
);

const xOf = (reply: unknown) =>
  (reply as { node?: { space?: { viewport?: { x?: number } } } } | undefined)?.node?.space?.viewport
    ?.x ?? Number.NaN;

/** Hymn `n` opened from home, shot twice with a rest between, its page's and the port's boxes read after each shot. */
const fromHome = (n: number) => [
  'clock data',
  'clock settle',
  `tap hymn-${n}`,
  'clock settle',
  'clock data',
  'clock +500 real',
  shot(`home-${n}-a`),
  'clock +500 real',
  shot(`home-${n}-b`),
  'layout hymn-pager',
  'layout hymn-page',
];
const home2 = await drive.run(flags('pager-home-2'), fromHome(2));
await drive.run(flags('pager-home-1'), fromHome(1));
const home2At = [xOf(home2.at(-2)), xOf(home2.at(-1))];
drive.check(
  'hymn 2 opened from home: after two screenshots its page is still the one in the port',
  Math.abs((home2At[1] ?? Number.NaN) - (home2At[0] ?? Number.NaN)) < 1,
  { port: home2At[0], page: home2At[1] },
);
const pageApart = [
  await changedPixels(shotFile('home-2-a'), shotFile('home-1-a')),
  await changedPixels(shotFile('home-2-b'), shotFile('home-1-b')),
];
drive.check(
  'hymn 2 opened from home: each screenshot paints hymn 2’s page, not hymn 1’s under hymn 2’s title',
  pageApart.every((apart) => apart > PAGES_APART),
  { pageApart },
);

const largest = await drive.run(
  [...flags('pager-largest'), '--url', '/hymns/100'],
  [
    'clock data',
    'clock settle',
    'clock data',
    'clock +300 real',
    'layout hymn-pager',
    'layout hymn-page',
    shot('opened-100'),
    'prefer root-font-size 53',
    'clock settle',
    'clock +300 real',
    'layout hymn-page',
    shot('largest-100'),
    'state pagerNumbers',
  ],
);
const launchedSwipe = await drive.run(
  [...flags('pager-launched-swipe'), '--url', '/hymns/100'],
  [
    'clock data',
    'clock settle',
    'clock data',
    'clock +500 real',
    'tap hymn-pager drag -300 0 from 300 500',
    'clock +1200 real',
    'clock settle',
    'clock data',
    'state',
  ],
);
const launchedPages = JSON.stringify(largest[12] ?? null);
drive.check(
  'a hymn the app is launched at pages through every hymn: 99, 100 and 101 drawn',
  launchedPages.includes('99') && launchedPages.includes('101'),
  largest[12],
);
const launchedTop = openOf(launchedSwipe.at(-1));
drive.check('a swipe left on the hymn launched at turns to hymn 101', launchedTop === '101', {
  launchedTop,
});
const port = xOf(largest[4]);
const opened = [xOf(largest[5]), xOf(largest[10])];
drive.check(
  'a hymn opened by its address lays out its own page in the port, at the default and the largest text',
  opened.every((x) => Math.abs(x - port) < 1),
  { port, opened },
);
await drive.run(flags('pager-pressed'), [
  'clock data',
  'clock settle',
  'tap find-search',
  'clock settle',
  'clock data',
  'type search 100',
  'clock settle',
  'clock data',
  'tap hymn-100',
  'clock settle',
  'clock data',
  'clock +300 real',
  shot('pressed-100'),
]);
const paintedApart = await changedPixels(shotFile('opened-100'), shotFile('pressed-100'));
drive.check(
  'a hymn opened by its address paints its own page, as the same hymn pressed in a search does',
  paintedApart <= SAME,
  { paintedApart },
);
drive.check(
  'hymn 100 at the largest text drawn for a look',
  largest.at(-1) !== undefined,
  shotFile('largest-100'),
);

process.exit(drive.finish());
