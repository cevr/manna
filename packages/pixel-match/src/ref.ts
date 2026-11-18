/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noTryCatch, effect/noAs, no-await-in-loop -- a host tool that drives a simulator step by step through the repo's driver, in order, awaiting each; a step that fails fails its cell, which is caught, named and the next cell taken. */

/**
 * `pixel ref <app> [<id>…]`: the One references. For each iOS cell of each
 * row asked, on the app's own reference simulator: the app stopped, the
 * row's fixture written, the scheme, text size, Reduce Motion and status
 * bar set and read back, the row's steps driven through `@manna/sim`, the
 * screen taken once it holds still, and the accessibility tree read for a
 * development overlay (a capture with one is refused). The picture goes to
 * `$PIXEL_REF/<one>/<app>/ios/<id>/<scheme>-<size>.png` with its metadata
 * beside it. The web cells are `web.ts`'s.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { faceAt, faceChanged, hostZone } from './clock.ts';
import { storeOf } from './fixtures.ts';
import {
  overrideStatusBar,
  rectIn,
  run,
  setLook,
  setReduceMotion,
  sleep,
  stillShot,
  terminate,
  writeStore,
} from './ios.ts';
import {
  cellName,
  cellsOf,
  IOS,
  type AppName,
  type Cell,
  type OneBand,
  type Row,
  type Side,
  type Step,
} from './model.ts';
import { refFile } from './paths.ts';
import { heartseedOne, hymnalOne } from './sim/apps.ts';

/** The capture's frame: the checkout, where references go, the One commit and the head. */
export interface Frame {
  readonly root: string;
  readonly refs: string;
  readonly one: string;
  readonly head: string;
}

const CONFIG = { heartseed: heartseedOne, hymnal: hymnalOne } as const;

const script = (frame: Frame, app: AppName) =>
  join(frame.root, 'packages', 'pixel-match', 'src', 'sim', `${app}.ts`);

/** The sim driver of `app`'s reference simulator, one command; its JSON line. */
const sim = (frame: Frame, app: AppName, args: ReadonlyArray<string>) => {
  const out = run(['bun', script(frame, app), ...args], frame.root);
  const line = out.trim().split('\n').at(-1) ?? '';
  return JSON.parse(line) as { readonly ok: boolean; readonly paths?: Record<string, string> };
};

/** The driver's command for a step, or the milliseconds a wait waits. */
const commandOf = (
  step: Step,
): { readonly args: ReadonlyArray<string> } | { readonly wait: number } => {
  if ('open' in step) return { args: ['open', step.open, '--expect', step.expect] };
  if ('tap' in step) return { args: ['tap', step.tap] };
  if ('scroll' in step) return { args: ['scroll', step.scroll, step.direction] };
  if ('fill' in step) return { args: ['fill', step.fill, step.value] };
  if ('back' in step) return { args: ['back'] };
  if ('relaunch' in step) return { args: ['relaunch'] };
  if ('pinch' in step) return { args: ['gesture', 'pinch', step.pinch, String(step.scale)] };
  if ('pan' in step)
    return {
      args: [
        'gesture',
        'pan',
        step.pan,
        ...(step.ms === undefined ? [] : ['--ms', String(step.ms)]),
        '--',
        String(step.dx),
        String(step.dy),
      ],
    };
  return { wait: step.wait };
};

/** The udid of the booted reference simulator, from its drive session. */
const udidOf = (frame: Frame, app: AppName) => {
  const session = JSON.parse(
    readFileSync(join(frame.root, 'tmp', CONFIG[app].simulator, 'session.json'), 'utf8'),
  ) as { readonly udid: string };
  return session.udid;
};

/** Marks a development overlay in a tree's text: LogBox's toasts and its full screen. */
const OVERLAY = /LogBox|Open debugger to view|Dismiss All|Render Error|Uncaught Error|Minimize/;

/** The tree now: its digest, and whether a development overlay is in it. The tree's file is removed once read: it holds the screen's words. */
const treeOf = (frame: Frame, app: AppName, name: string) => {
  const snapshot = sim(frame, app, ['snapshot', name]);
  const file = snapshot.paths?.['snapshot'] ?? '';
  const text = readFileSync(file, 'utf8');
  unlinkSync(file);
  return {
    digest: createHash('sha256').update(text).digest('hex').slice(0, 16),
    overlay: OVERLAY.test(text),
  };
};

/** The rect of `target` on screen in points, from the driver's own session; none when it is not there. */
const rectOf = (frame: Frame, app: AppName, target: string) => {
  const [by = '', ...rest] = target.split('=');
  const answer = Bun.spawnSync(
    [
      'agent-device',
      'get',
      'attrs',
      `${by}=${JSON.stringify(rest.join('='))}`,
      '--json',
      '--session',
      CONFIG[app].driverSession,
    ],
    {
      stdout: 'pipe',
      stderr: 'ignore',
      env: { ...Bun.env, HOME: join(frame.root, 'tmp', CONFIG[app].simulator, 'home') },
    },
  );
  if (answer.exitCode !== 0) return undefined;
  return rectIn(answer.stdout.toString());
};

/** The top of a banded row's band in device pixels, read from the screen's tree now (`OneBand`). */
const bandTopOf = (frame: Frame, app: AppName, band: OneBand) => {
  const rects = band.targets.flatMap((target) => {
    const rect = rectOf(frame, app, target);
    return rect === undefined ? [] : [rect];
  });
  if (rects.length === 0) throw new Error(`band: none of ${band.targets.join(', ')} is on screen`);
  const edges = rects.map((rect) => (band.edge === 'bottom' ? rect.y + rect.height : rect.y));
  const points = band.edge === 'bottom' ? Math.max(...edges) : Math.min(...edges);
  return Math.round(points * IOS.scale);
};

/** The app stopped, its store written with `fixture`, the look set and read back, the status bar overridden. */
const prepare = (frame: Frame, side: Side, cell: Cell, fixture: string, now: Date) => {
  const config = CONFIG[cell.app];
  const udid = udidOf(frame, cell.app);
  terminate(udid, config.bundleId);
  const store = storeOf(cell.app, fixture, now);
  if (store === undefined || config.store === undefined) throw new Error(`no fixture ${fixture}`);
  writeStore(udid, config.bundleId, config.store.file, store);
  setLook(udid, cell.scheme, cell.size);
  setReduceMotion(udid, side.reduceMotion === true);
  overrideStatusBar(udid);
  return udid;
};

/** Drives `side`'s steps in order. */
const drive = async (frame: Frame, app: AppName, side: Side) => {
  for (const step of side.steps) {
    const command = commandOf(step);
    if ('wait' in command) await sleep(command.wait);
    else sim(frame, app, command.args);
  }
};

/** The screen once still, `hold` pressed through it when given. */
const capture = async (
  frame: Frame,
  app: AppName,
  udid: string,
  hold: string | undefined,
  file: string,
) => {
  if (hold === undefined) {
    await sleep(600);
    return stillShot(udid, file);
  }
  const held = Bun.spawn(
    ['bun', script(frame, app), 'hold', hold, '--ms', '6000', '--settle', '0'],
    {
      cwd: frame.root,
      stdout: 'ignore',
      stderr: 'ignore',
    },
  );
  await sleep(2000);
  const shot = await stillShot(udid, file);
  await held.exited;
  return shot;
};

/** The metadata kept beside a reference: its hour and `capturedAt` are the still capture's, `startedAt` the cell's start. */
const metadataOf = (
  frame: Frame,
  cell: Cell,
  fixture: string,
  at: { readonly started: Date; readonly taken: Date },
  udid: string,
  tree: string,
  shot: Uint8Array,
) => ({
  cell: cellName(cell),
  one: frame.one,
  head: frame.head,
  fixture,
  hour: at.taken.getHours(),
  timeZone: hostZone(),
  startedAt: at.started.toISOString(),
  capturedAt: at.taken.toISOString(),
  simulator: CONFIG[cell.app].simulator,
  udid,
  tree,
  sha256: createHash('sha256').update(shot).digest('hex'),
});

/** Takes one iOS cell of `row`; the reason it was not taken, or none. */
const takeCell = async (frame: Frame, row: Row, side: Side, cell: Cell, started: Date) => {
  if (
    row.clock !== undefined &&
    faceAt(started.getHours()) !== faceAt(Number(row.clock.slice(0, 2)))
  )
    return `open: its greeting's face needs a local hour like ${row.clock}`;
  const fixture = row.fixture ?? '';
  const udid = prepare(frame, side, cell, fixture, started);
  await drive(frame, cell.app, side);
  const oneBand = side.band;
  let band: (OneBand & { readonly top: number }) | undefined;
  if (oneBand !== undefined)
    try {
      band = { ...oneBand, top: bandTopOf(frame, cell.app, oneBand) };
    } catch (error) {
      return String(error instanceof Error ? error.message : error);
    }
  const file = refFile(frame, cell);
  mkdirSync(join(file, '..'), { recursive: true });
  const shot = await capture(frame, cell.app, udid, side.hold, file);
  if (shot === undefined) {
    unlinkSync(file);
    return 'moving: no two takes 500 ms apart were the same bytes';
  }
  const taken = new Date();
  const changed = cell.app === 'heartseed' ? faceChanged(started, taken) : undefined;
  if (changed !== undefined) {
    unlinkSync(file);
    return changed;
  }
  const tree = treeOf(frame, cell.app, `pm-${row.id}`);
  if (tree.overlay) {
    unlinkSync(file);
    return 'refused: a development overlay is in the tree';
  }
  const at = { started, taken };
  const metadata = { ...metadataOf(frame, cell, fixture, at, udid, tree.digest, shot), band };
  writeFileSync(file.replace(/\.png$/, '.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  return undefined;
};

/** Takes one cell, its failure caught: the reason it was not taken, or none. */
const tryCell = async (frame: Frame, row: Row, side: Side, cell: Cell) => {
  const reason = side.notDrawn?.ios;
  if (reason !== undefined) return `not drawn: ${reason}`;
  try {
    return await takeCell(frame, row, side, cell, new Date());
  } catch (error) {
    return String(error instanceof Error ? error.message : error).slice(0, 300);
  }
};

/** Takes the iOS references of `rows` in `app`; one line per cell, and the cells not taken with their reasons. */
export const takeIos = async (frame: Frame, app: AppName, rows: ReadonlyArray<Row>) => {
  const missed: Array<readonly [string, string]> = [];
  for (const row of rows) {
    const side = row.one;
    if (side === undefined) continue;
    for (const cell of cellsOf(app, row).filter((each) => each.host === 'ios')) {
      const why = await tryCell(frame, row, side, cell);
      console.log(
        `${why === undefined ? 'took' : 'MISSED'} ${cellName(cell)}${why === undefined ? '' : `: ${why}`}`,
      );
      if (why !== undefined) missed.push([cellName(cell), why]);
    }
  }
  return missed;
};
