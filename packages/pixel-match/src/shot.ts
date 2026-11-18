/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary, effect/noAs, effect/noTryCatch -- a host tool that drives the port through `bun run exact agent` and reads its JSON replies: plain TypeScript as the exact-kit's drives are. */

/**
 * `pixel shot <app> <id>… [--scheme light|dark] [--size <size>]`: the port
 * against the One reference. For each iOS cell asked, the port is launched
 * on its Exact simulator through `bun run exact agent ios` (the wrapper, its
 * lock, its simulator) on the row's fixture written to its store (an empty
 * store for a row with none, `seedPort`) and on the agent's clock at the
 * reference's hour (`portClock`), set to the cell's scheme, driven by the
 * row's ops and its screen taken with Exact's `compare` against the
 * reference; `scoreShot` then scores the pair.
 */

import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { bandOps } from './agent-band.ts';
import { hostZone, portClock } from './clock.ts';
import { storeOf } from './fixtures.ts';
import { PORT_STORES, writePortStore } from './port-store.ts';
import { overrideStatusBar, run } from './ios.ts';
import { cellName, cellsOf, IOS, type AppName, type Cell, type Row } from './model.ts';
import { refFile, shotFiles } from './paths.ts';
import { referenceOf, scoreShot, type Frame } from './score.ts';

/** The Exact simulators the wrapper drives, by app. */
const EXACT_SIMULATORS: Readonly<Record<AppName, string>> = {
  heartseed: 'verify-heartseed-exact',
  hymnal: 'verify-hymnal-exact',
};

const udidOfName = (name: string) => {
  const listed = JSON.parse(run(['xcrun', 'simctl', 'list', 'devices', '--json'])) as {
    readonly devices: Record<
      string,
      ReadonlyArray<{ readonly name: string; readonly udid: string }>
    >;
  };
  const found = Object.values(listed.devices)
    .flat()
    .find((device) => device.name === name);
  if (found === undefined) throw new Error(`no simulator named ${name}`);
  return found.udid;
};

/**
 * Removes the route types One's dev server writes into each One app
 * (`apps/<app>/app/routes.d.ts`, ignored by git) while a reference is taken
 * in the same checkout. Each port imports its One app's package, and Exact's
 * bake stages every declaration in a package it reaches: that file names
 * `one`, whose 31.7 MiB of declarations take the bake over its 64 MiB cap,
 * so the port does not build. The next dev server start writes it again.
 */
const dropOneRoutes = (root: string) => {
  for (const app of ['heartseed', 'hymnal']) {
    const routes = join(root, 'apps', app, 'app', 'routes.d.ts');
    if (!existsSync(routes)) continue;
    unlinkSync(routes);
    console.log(`removed ${routes}: One's generated route types take the port's bake over its cap`);
  }
};

/**
 * Writes `row`'s fixture into the port's named store on the simulator
 * (`port-store.ts`), made at this instant as the reference's was at its
 * own; whether it did. A row with no fixture, or an app whose port store
 * is not described, starts from an empty store (`--reset-storage`).
 */
const seedPort = (app: AppName, row: Row, udid: string) => {
  const port = PORT_STORES[app];
  if (port === undefined || row.fixture === undefined) return false;
  const store = storeOf(app, row.fixture, new Date());
  if (store === undefined) throw new Error(`${row.id}: no fixture ${row.fixture}`);
  const container = run(['xcrun', 'simctl', 'get_app_container', udid, port.bundle, 'data']).trim();
  writePortStore(container, port, `pm-${row.id}`, store);
  return true;
};

/** Takes and scores the port's iOS cell of `row`. */
const shootCell = (frame: Frame, row: Row, cell: Cell) => {
  const side = row.exact;
  if (side === undefined) throw new Error(`${row.id}: no Exact side written yet`);
  if (!existsSync(refFile(frame, cell))) throw new Error(`${cellName(cell)}: no reference`);
  const reference = referenceOf(frame, cell);
  if (row.one?.band !== undefined && reference.band === undefined)
    throw new Error(`${cellName(cell)}: a banded row whose reference keeps no band: take it again`);
  if (reference.band !== undefined && side.band === undefined)
    throw new Error(`${row.id}: a banded row whose Exact side names no band`);
  const clock = portClock(reference.taken, new Date(), hostZone());
  if (clock._tag === 'Refused') throw new Error(`${cellName(cell)}: ${clock.reason}`);
  dropOneRoutes(frame.root);
  const udid = udidOfName(EXACT_SIMULATORS[cell.app]);
  const files = shotFiles(frame.root, cell);
  mkdirSync(dirname(files.screen), { recursive: true });
  if (cell.size !== IOS.size) run(['xcrun', 'simctl', 'ui', udid, 'content_size', cell.size]);
  overrideStatusBar(udid);
  const seeded = seedPort(cell.app, row, udid);
  const edges = side.band === undefined ? [] : bandOps(side.band);
  const ops = [
    `prefer prefers-color-scheme ${cell.scheme}`,
    'clock settle',
    ...side.ops,
    'clock settle',
    ...edges,
    `screenshot ${files.screen} window compare ${refFile(frame, cell)}`,
  ];
  const out = run(
    [
      'bun',
      'run',
      'exact',
      'agent',
      'ios',
      '--json',
      '--scale',
      String(IOS.scale),
      '--epoch',
      String(clock.epoch),
      '--time-zone',
      clock.timeZone,
      '--storage',
      `pm-${row.id}`,
      seeded ? '--keep-storage' : '--reset-storage',
      ...ops,
    ],
    join(frame.root, 'apps', `${cell.app}-exact`),
  );
  if (cell.size !== IOS.size) run(['xcrun', 'simctl', 'ui', udid, 'content_size', IOS.size]);
  return scoreShot(frame, row, cell, out);
};

/** Shoots the asked iOS cells of `rows`; one line per cell. */
export const shoot = (
  frame: Frame,
  app: AppName,
  rows: ReadonlyArray<Row>,
  only: { readonly scheme?: string; readonly size?: string },
) => {
  for (const row of rows)
    for (const cell of cellsOf(app, row).filter(
      (each) =>
        each.host === 'ios' &&
        (only.scheme === undefined || each.scheme === only.scheme) &&
        (only.size === undefined || each.size === only.size),
    )) {
      try {
        const result = shootCell(frame, row, cell);
        const share = ((result.differing / result.scored) * 100).toFixed(3);
        console.log(
          `${cellName(cell)}: ${result.differing} of ${result.scored} differ (${share} %), largest ${result.largest}, masked ${result.masked}; at 0/4/8/16: ${result.ladder.map((step) => step.differing).join('/')}; ${result.diff}`,
        );
        console.log(result.compare.replaceAll(/^/gm, '  '));
      } catch (error) {
        console.log(
          `FAILED ${cellName(cell)}: ${error instanceof Error ? error.message.slice(0, 600) : String(error)}`,
        );
      }
    }
};
