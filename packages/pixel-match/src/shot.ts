/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary, effect/noAs, effect/noTryCatch, effect/noAsyncFunction, no-await-in-loop -- a host tool that drives the port through `bun run exact agent` and reads its JSON replies: plain TypeScript as the exact-kit's drives are. */

/**
 * `pixel shot <app> <id>… [--web] [--scheme light|dark] [--size <size>]`:
 * the port against the One reference. For each iOS cell asked, the port is
 * launched on its Exact simulator through `bun run exact agent ios` (the
 * wrapper, its lock, its simulator) on the row's fixture written to its
 * store (an empty store for a row with none, `seedPort`) and on the
 * agent's clock at the reference's hour (`portClock`), set to the cell's
 * scheme, driven by the row's ops and its screen taken with Exact's
 * `compare` against the reference; `scoreShot` then scores the pair. With
 * `--web`, each web cell is the port's web build in the agent's own
 * Chromium (`bun run exact agent web`, which launches it with
 * `--use-mock-keychain --password-store=basic`) at the reference's
 * viewport (`--size`) and device scale (`EXACT_SCALE`, Chrome's own), on
 * the same fixture (`webSeedOf`, `web-store.ts`), read back before it is
 * scored; a row whose fixture the web store cannot hold yet is refused.
 */

import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { claimAppPort } from '@manna/exact-kit/port';

import { hostZone, portClock } from './clock.ts';
import { iosCommand, webCommand } from './command.ts';
import { writePortStore } from './port-store.ts';
import {
  atContentSize,
  contentSizeOf,
  overrideStatusBar,
  run,
  runLogged,
  setContentSize,
  setSteadyCaret,
} from './ios.ts';
import { cellName, cellsOf, hostsOf, IOS, type AppName, type Cell, type Row } from './model.ts';
import { refFile, shotFiles } from './paths.ts';
import { referenceOf, scoreShot, type Frame } from './score.ts';
import { readBackRefusal, seedPlan, storageFlags, webSeedOf } from './seed.ts';
import { writeWebStore } from './web-store.ts';

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
 * Readies the port's store for `row`'s shot on the simulator (`seedPlan`):
 * the row's fixture written into its named store (`port-store.ts`), made
 * at this instant as the reference's was at its own, or nothing written
 * for a store the agent empties; the agent's storage flags.
 */
const seedPort = (app: AppName, row: Row, udid: string) => {
  const plan = seedPlan(app, row, new Date());
  if (plan._tag === 'Seed') {
    const container = run([
      'xcrun',
      'simctl',
      'get_app_container',
      udid,
      plan.port.bundle,
      'data',
    ]).trim();
    writePortStore(container, plan.port, plan.storage, plan.store);
  }
  return storageFlags(plan);
};

/** The row's Exact side and the cell's reference, both there, or a throw naming which is not. */
const sideOf = (frame: Frame, row: Row, cell: Cell) => {
  const side = row.exact;
  if (side === undefined) throw new Error(`${row.id}: no Exact side written yet`);
  if (!existsSync(refFile(frame, cell))) throw new Error(`${cellName(cell)}: no reference`);
  return side;
};

/** Takes and scores the port's iOS cell of `row`. */
const shootIos = (frame: Frame, row: Row, cell: Cell) => {
  const side = sideOf(frame, row, cell);
  const reference = referenceOf(frame, cell);
  if (row.one?.band !== undefined && reference.band === undefined)
    throw new Error(`${cellName(cell)}: a banded row whose reference keeps no band: take it again`);
  if (row.one?.band !== undefined && side.band === undefined)
    throw new Error(`${row.id}: a banded row whose Exact side names no band`);
  const clock = portClock(reference.taken, new Date(), hostZone());
  if (clock._tag === 'Refused') throw new Error(`${cellName(cell)}: ${clock.reason}`);
  dropOneRoutes(frame.root);
  const udid = udidOfName(EXACT_SIMULATORS[cell.app]);
  const files = shotFiles(frame.root, cell);
  mkdirSync(dirname(files.screen), { recursive: true });
  const sim = {
    read: () => contentSizeOf(udid),
    set: (size: string) => {
      setContentSize(udid, size);
    },
  };
  return atContentSize(sim, cell.size, IOS.size, (readBack) => {
    overrideStatusBar(udid);
    setSteadyCaret(udid);
    const storage = seedPort(cell.app, row, udid);
    const argv = iosCommand(
      { ...row, exact: side },
      cell,
      { screen: files.screen, reference: refFile(frame, cell) },
      clock,
      storage,
    );
    const out = runLogged(argv, files.log, join(frame.root, 'apps', `${cell.app}-exact`));
    return scoreShot(frame, row, cell, out, readBack());
  });
};

/**
 * Takes and scores the port's web cell of `row`, on the row's fixture as
 * the reference's page held it (`webSeedOf`): written into the drive's
 * Chrome store on the one port the cell claims and drives on, read back
 * by the drive before the row's ops, or the cell refused.
 */
const shootWeb = async (frame: Frame, row: Row, cell: Cell) => {
  sideOf(frame, row, cell);
  const seed = webSeedOf(cell.app, row, new Date());
  if (seed._tag === 'Refused') throw new Error(seed.reason);
  dropOneRoutes(frame.root);
  const files = shotFiles(frame.root, cell);
  mkdirSync(dirname(files.screen), { recursive: true });
  const appDir = join(frame.root, 'apps', `${cell.app}-exact`);
  const claim = await claimAppPort(appDir, { label: `pixel shot ${cellName(cell)}` });
  try {
    const states = seed._tag === 'Seed' ? seed.states : [];
    if (seed._tag === 'Seed') await writeWebStore(appDir, claim.port, seed);
    const command = webCommand(
      row,
      cell,
      { screen: files.screen, reference: refFile(frame, cell) },
      ['--port', String(claim.port), ...storageFlags(seed)],
      states.map(([name]) => name),
    );
    const out = runLogged(command.argv, files.log, appDir, command.env);
    const unread = readBackRefusal(out, states);
    if (unread !== undefined) throw new Error(`${row.id}: ${unread}`);
    return scoreShot(frame, row, cell, out);
  } finally {
    claim.give();
  }
};

/** Shoots the asked cells of `rows` on one host; one line per cell. */
export const shoot = async (
  frame: Frame,
  app: AppName,
  rows: ReadonlyArray<Row>,
  only: { readonly web: boolean; readonly scheme?: string; readonly size?: string },
) => {
  const host = only.web ? 'web' : 'ios';
  const asked = rows.flatMap((row) =>
    cellsOf(app, row)
      .filter(
        (each) =>
          each.host === host &&
          (only.scheme === undefined || each.scheme === only.scheme) &&
          (only.size === undefined || each.size === only.size),
      )
      .map((cell) => ({ row, cell })),
  );
  if (asked.length === 0)
    console.log(
      `pixel shot: no ${host} cell of ${app} matches; ${app} is drawn on ${hostsOf(app).join(' and ')}`,
    );
  for (const { row, cell } of asked) {
    try {
      const result = host === 'web' ? await shootWeb(frame, row, cell) : shootIos(frame, row, cell);
      const share = ((result.differing / result.scored) * 100).toFixed(3);
      console.log(
        `${cellName(cell)}: ${result.differing} of ${result.scored} differ (${share} %), largest ${result.largest}, masked ${result.masked}, scored over ${result.total} of ${result.picture}; at 0/4/8/16: ${result.ladder.map((step) => step.differing).join('/')}; ${result.diff}`,
      );
      console.log(result.compare.replaceAll(/^/gm, '  '));
    } catch (error) {
      console.log(
        `FAILED ${cellName(cell)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
};
