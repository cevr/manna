/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, effect/noNewPromise, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads its replies and prints what it found. */

/**
 * The pinch's live checks, which a `.test.contract` cannot hold, on the host
 * named (`bun tools/drive-pinch.ts web|ios [--touch platform]`; on iOS the
 * driver's pinch is a real UIKit gesture under `--touch platform`):
 *
 * - a pinch in on the list shows the tiles, a pinch out on them shows the
 *   list again where it stood (a row's place read before and after);
 * - a pinch begun on a row opens no row, whether it commits or not;
 * - after a pinch the list's one-finger drag still scrolls it, and a tap on
 *   a row still opens its hymn;
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

const stood = await launch('pinch-stood', [
  'clock data',
  'tap hymn-list drag 0 -240',
  'clock settle',
  'layout hymn-12',
  'tap hymn-list pinch 0.7',
  'clock settle',
  'clock data',
  'state find.tiles',
  'tap tiles pinch 1.4',
  'clock settle',
  'clock data',
  'state find.tiles',
  'layout hymn-12',
  'state find.top',
]);
drive.check('a pinch in on the list shows the tiles', stood[6] === true, {
  reply: stood[4],
  tiles: stood[6],
});
drive.check('a pinch out on the tiles shows the list', stood[10] === false, {
  reply: stood[7],
  tiles: stood[10],
});
const [before, after] = [frameOf(stood[3]), frameOf(stood[11])];
drive.check(
  'the list shows again where it stood',
  before !== undefined && after !== undefined && Math.abs(before.y - after.y) <= 0.5,
  { before, after },
);
drive.check('no row opened', stood[12] === '/', stood[12]);

const onRow = await launch('pinch-row', [
  'clock data',
  'tap hymn-3 pinch 0.97',
  'clock settle',
  'clock data',
  'state find.top',
  'state find.tiles',
  'tap hymn-3 pinch 0.6',
  'clock settle',
  'clock data',
  'state find.top',
  'state find.tiles',
]);
drive.check(
  'a pinch begun on a row that commits nothing opens no row',
  onRow[4] === '/' && onRow[5] === false,
  { reply: onRow[1], url: onRow[4], tiles: onRow[5] },
);
drive.check(
  'a pinch begun on a row that shows the tiles opens no row',
  onRow[9] === '/' && onRow[10] === true,
  { reply: onRow[6], url: onRow[9], tiles: onRow[10] },
);

const still = await launch('pinch-still', [
  'clock data',
  'tap hymn-list pinch 0.7',
  'clock settle',
  'clock data',
  'tap tiles pinch 1.4',
  'clock settle',
  'clock data',
  'layout hymn-12',
  'tap hymn-list drag 0 -240',
  'clock settle',
  'layout hymn-12',
  'state hatches',
  'tap hymn-12',
  'clock settle',
  'clock data',
  'state find.top',
]);
const [rested, dragged] = [frameOf(still[7]), frameOf(still[10])];
drive.check(
  'after a pinch, a one-finger drag still scrolls the list',
  rested !== undefined && dragged !== undefined && rested.y - dragged.y > 100,
  { rested, dragged },
);
drive.check('after a pinch, a tap on a row still opens its hymn', still[15] === '/hymns/12', {
  url: still[15],
});
const hatches = JSON.stringify(still[11] ?? null);
drive.check('the pinch hatch is live on the list’s column', hatches.includes('pinch'), hatches);

process.exit(drive.finish());
