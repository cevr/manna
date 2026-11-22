/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, effect/noNewPromise, effect/noRuntimeTypeof, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads its replies and prints what it found. */

/**
 * The pinch's live checks, which a `.test.contract` cannot hold, on the host
 * named (`bun tools/drive-pinch.ts web|ios [--touch platform]`; on iOS the
 * driver's pinch is a real UIKit gesture under `--touch platform`):
 *
 * - a pinch in on the list shows the tiles, a pinch out on them shows the
 *   list again where it stood (a row's place read before and after);
 * - a pinch begun on a row opens no row, whether it commits or not;
 * - after a pinch the list's one-finger drag still scrolls it, and a tap on
 *   a row still opens its hymn (on the web this fails if the browser zooms
 *   its page with the pinch: the tap then lands two rows off);
 * - the `pinch` hatch is on the list's column: `state hatches` names it.
 *
 * Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { bunProcesses, makeDrive } from '@manna/exact-kit/drive';

import { checkoutPort } from './recordings.ts';

const host = process.argv[2] ?? 'web';
const platformTouch = process.argv.includes('--touch') && process.argv.includes('platform');
const app = join(import.meta.dir, '..');
const backend = `http://127.0.0.1:${checkoutPort()}`;
const processes = {
  ...bunProcesses,
  spawn: (argv: ReadonlyArray<string>, cwd: string) => {
    const child = Bun.spawn([...argv], {
      cwd,
      env: { ...process.env, HYMNAL_RECORDINGS: backend },
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
    });
    return {
      pid: child.pid,
      ended: Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]).then(([stdout, stderr, code]) => ({ code, stdout, stderr })),
    };
  },
  signal: (pid: number, signal: 'SIGTERM') => {
    if (pid < -1) process.kill(pid, signal);
  },
  sleep: (ms: number) => Bun.sleep(ms),
};
const drive = makeDrive({ name: 'drive-pinch', host, appDir: app, processes });
const runId = Date.now().toString(36);
const touch = platformTouch ? ['--touch', 'platform'] : [];
/** A first launch on a fresh store of its own, the agent's server on this checkout's port. */
const launch = (store: string, ops: ReadonlyArray<string>) =>
  drive.run(
    [...touch, '--backend', backend, '--storage', `${store}-${runId}`, '--reset-storage'],
    ops,
  );

type Frame = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** A layout reply's frame in the viewport. */
const frameOf = (reply: unknown): Frame | undefined =>
  (reply as { node?: { space?: { viewport?: Frame } } } | undefined)?.node?.space?.viewport;

/** A launch's ops, some named `[name, op]`, run on a fresh store; answers each named op's reply by its name. */
const named = async (store: string, steps: ReadonlyArray<string | readonly [string, string]>) => {
  const ops = steps.map((step) => (typeof step === 'string' ? step : step[1]));
  const replies = await launch(store, ops);
  return (name: string): unknown =>
    replies[steps.findIndex((step) => typeof step !== 'string' && step[0] === name)];
};

const PINCH_IN_OUT = [
  ['in', 'tap hymn-list pinch 0.7'],
  'clock settle',
  'clock data',
  ['tilesIn', 'state find.tiles'],
  ['out', 'tap tiles pinch 1.4'],
  'clock settle',
  'clock data',
  ['tilesOut', 'state find.tiles'],
] as const;

const stood = await named('pinch-stood', [
  'clock data',
  'tap hymn-list drag 0 -240',
  'clock settle',
  ['before', 'layout hymn-12'],
  ...PINCH_IN_OUT,
  ['after', 'layout hymn-12'],
  ['top', 'state find.top'],
]);
drive.check('a pinch in on the list shows the tiles', stood('tilesIn') === true, {
  reply: stood('in'),
  tiles: stood('tilesIn'),
});
drive.check('a pinch out on the tiles shows the list', stood('tilesOut') === false, {
  reply: stood('out'),
  tiles: stood('tilesOut'),
});
const [before, after] = [frameOf(stood('before')), frameOf(stood('after'))];
drive.check(
  'the list shows again where it stood',
  before !== undefined && after !== undefined && Math.abs(before.y - after.y) <= 0.5,
  { before, after },
);
drive.check('no row opened', stood('top') === '/', stood('top'));

const onRow = await named('pinch-row', [
  'clock data',
  ['band', 'tap hymn-3 pinch 0.97'],
  'clock settle',
  'clock data',
  ['bandTop', 'state find.top'],
  ['bandTiles', 'state find.tiles'],
  ['commit', 'tap hymn-3 pinch 0.6'],
  'clock settle',
  'clock data',
  ['commitTop', 'state find.top'],
  ['commitTiles', 'state find.tiles'],
]);
drive.check(
  'a pinch begun on a row that commits nothing opens no row',
  onRow('bandTop') === '/' && onRow('bandTiles') === false,
  { reply: onRow('band'), url: onRow('bandTop'), tiles: onRow('bandTiles') },
);
drive.check(
  'a pinch begun on a row that shows the tiles opens no row',
  onRow('commitTop') === '/' && onRow('commitTiles') === true,
  { reply: onRow('commit'), url: onRow('commitTop'), tiles: onRow('commitTiles') },
);

const scrolls = await named('pinch-scrolls', [
  'clock data',
  ...PINCH_IN_OUT,
  ['rested', 'layout hymn-12'],
  'tap hymn-list drag 0 -240',
  'clock settle',
  ['dragged', 'layout hymn-12'],
  ['hatches', 'state hatches'],
]);
const [rested, dragged] = [frameOf(scrolls('rested')), frameOf(scrolls('dragged'))];
drive.check(
  'after a pinch, a one-finger drag still scrolls the list',
  rested !== undefined && dragged !== undefined && rested.y - dragged.y > 100,
  { rested, dragged },
);
const hatches = JSON.stringify(scrolls('hatches') ?? null);
drive.check('the pinch hatch is live on the list’s column', hatches.includes('pinch'), hatches);

const opens = await named('pinch-opens', [
  'clock data',
  ...PINCH_IN_OUT,
  'clock settle',
  'tap hymn-3',
  'clock settle',
  'clock data',
  ['top', 'state find.top'],
]);
drive.check('after a pinch, a tap on a row still opens its hymn', opens('top') === '/hymns/3', {
  url: opens('top'),
});

process.exit(drive.finish());
