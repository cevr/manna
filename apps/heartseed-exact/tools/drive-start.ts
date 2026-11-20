/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noUnknownParameters, node/no-process-env -- Exact's app folder cannot import effect (docs/exact.md): a host script that drives the built app through `bun run exact agent`, writes a garden file into the simulator's agent store, and reads its untyped JSON replies by the fields it checks. */

/**
 * The launch's opening, live (hs-unread, `features/start.contract`), on the
 * host named (`bun tools/drive-start.ts web|ios`). Each row launches on a
 * store of its own and reads `startShown`, `startDecided` and the tree:
 *
 * 1. a fresh store opens home: the current app's first minute, which the
 *    port draws as home, nothing pushed;
 * 2. a launch at `/verses` stays there once the opening is decided;
 * 3. a store whose verse was said (planted and marked Good through Your
 *    verses' drive controls, so every launch sets `HEARTSEED_GARDEN_DRIVE`)
 *    opens home on its relaunch;
 * 4. iOS only, an unreadable garden opens Today: the drive writes "not a
 *    store" as the named agent store's garden file in the app's data
 *    container on its simulator (`xcrun simctl get_app_container
 *    verify-heartseed-exact app.heartseed.exact data`, then
 *    `Library/Caches/exact/app.heartseed.exact/agent/<store>/data/heartseed.json`,
 *    where `--storage <store>` keeps `app:/data`), then launches on it with
 *    the store kept. The web keeps `app:/data` in Chrome's IndexedDB, which
 *    no agent step writes, so the web runs rows 1 to 3.
 *
 * The iOS run needs the port built on its simulator (`bun run exact ios`).
 * Exits 1 on a failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
if (process.env.HEARTSEED_GARDEN_DRIVE !== '1') {
  const self = Bun.spawn(['bun', import.meta.path, host], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, HEARTSEED_GARDEN_DRIVE: '1', SIMCTL_CHILD_HEARTSEED_GARDEN_DRIVE: '1' },
  });
  process.exit(await self.exited);
}
const drive = makeDrive({ name: 'drive-start', host, appDir: app });
const stamp = Date.now().toString(36);
const storeOf = (row: string) => `start-${row}-${host}-${stamp}`;

/** The port's simulator (`@manna/exact-kit`'s `src/apps.ts`) and bundle id. */
const SIMULATOR = 'verify-heartseed-exact';
const BUNDLE = 'app.heartseed.exact';

interface Shown {
  readonly opening?: string;
  readonly route?: string;
}

const opened = ['clock data', 'clock settle', 'state startShown', 'state startDecided', 'tree'];
const has = (tree: unknown, id: string) => JSON.stringify(tree ?? '').includes(`"${id}"`);

/** What a launch's last `opened` ops read. */
const readOf = (replies: ReadonlyArray<unknown>) => {
  const at = replies.length - opened.length;
  const tree = replies[at + 4];
  return {
    shown: replies[at + 2] as Shown | undefined,
    decided: replies[at + 3],
    home: has(tree, 'home'),
    today: has(tree, 'today'),
    verses: has(tree, 'verses'),
  };
};

const fresh = readOf(await drive.launch(storeOf('fresh'), opened));
drive.check(
  'a fresh store opens home, the first minute, nothing pushed',
  fresh.shown?.opening === 'first' &&
    fresh.shown.route === '' &&
    fresh.decided === true &&
    fresh.home &&
    !fresh.today,
  fresh,
);

const deep = readOf(
  await drive.run(['--storage', storeOf('deep'), '--reset-storage', '--url', '/verses'], opened),
);
drive.check(
  'a launch at /verses stays there once the opening is decided',
  deep.decided === true && deep.verses && !deep.today,
  deep,
);

const saidStore = storeOf('said');
await drive.run(
  ['--storage', saidStore, '--reset-storage', '--url', '/verses'],
  [
    'clock data',
    'clock settle',
    'tap plant-three',
    'clock data',
    'tap good-John-3-16',
    'clock data',
  ],
);
const said = readOf(await drive.relaunch(saidStore, opened));
drive.check(
  'a store whose verse was said opens home on its relaunch',
  said.shown?.opening === 'home' &&
    said.shown.route === '' &&
    said.decided === true &&
    said.home &&
    !said.today,
  said,
);

if (host === 'ios') {
  const unreadStore = storeOf('unread');
  const container = Bun.spawnSync([
    'xcrun',
    'simctl',
    'get_app_container',
    SIMULATOR,
    BUNDLE,
    'data',
  ])
    .stdout.toString()
    .trim();
  const file = join(
    container,
    'Library/Caches/exact',
    BUNDLE,
    'agent',
    unreadStore,
    'data/heartseed.json',
  );
  if (container !== '') await Bun.write(file, 'not a store');
  const unread = readOf(await drive.relaunch(unreadStore, opened));
  drive.check(
    'an unreadable garden opens Today, pushed over home',
    container !== '' &&
      unread.shown?.opening === 'today' &&
      unread.shown.route === '/today' &&
      unread.decided === true &&
      unread.today,
    { container, unread },
  );
}

process.exit(drive.finish());
