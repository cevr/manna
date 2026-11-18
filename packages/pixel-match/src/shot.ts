/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noTryCatch -- a host tool that drives the port through `bun run exact agent`, reads its JSON replies and the pictures on disk, and writes the result files: plain TypeScript as the exact-kit's drives are. */

/**
 * `pixel shot <app> <id>… [--scheme light|dark] [--size <size>]`: the port
 * against the One reference. For each iOS cell asked, the port is launched
 * on its Exact simulator through `bun run exact agent ios` (the wrapper, its
 * lock, its simulator) on a fresh store, set to the cell's scheme, driven by
 * the row's ops and its screen taken with Exact's `compare` against the
 * reference. The strict diff then scores the pair at the threshold's
 * channel; the result (with the count at channel 0, 4, 8 and 16), the diff
 * picture and Exact's `compare` text are written beside the screen.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { diff, diffPicture, ladder, type Mask } from './diff.ts';
import { overrideStatusBar, run } from './ios.ts';
import {
  cellName,
  cellsOf,
  IOS,
  type AppName,
  type Cell,
  type MaskSpec,
  type Row,
} from './model.ts';
import { refFile, shotFiles } from './paths.ts';
import { decodePng, encodePng } from './png.ts';

/** The Exact simulators the wrapper drives, by app. */
const EXACT_SIMULATORS: Readonly<Record<AppName, string>> = {
  heartseed: 'verify-heartseed-exact',
  hymnal: 'verify-hymnal-exact',
};

/** The channel limit a pair is scored at: `accept.ts`'s. */
export const CHANNEL = 16;

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

/** Masks in points as device pixels. */
export const pixelsOf = (masks: ReadonlyArray<MaskSpec>, scale: number): ReadonlyArray<Mask> =>
  masks.map((mask) => ({
    x: mask.x * scale,
    y: mask.y * scale,
    width: mask.width * scale,
    height: mask.height * scale,
    reason: mask.reason,
  }));

/** Scores one cell's screen against its reference and writes the result and the diff picture; the result. */
export const score = (
  frame: { readonly root: string; readonly refs: string; readonly one: string },
  cell: Cell,
  masks: ReadonlyArray<Mask>,
  compare: string,
) => {
  const files = shotFiles(frame.root, cell);
  const reference = decodePng(readFileSync(refFile(frame, cell)), 'reference');
  const screen = decodePng(readFileSync(files.screen), 'screen');
  const scored = diff(reference, screen, masks, CHANNEL);
  if (scored._tag === 'Sizes')
    throw new Error(`${cellName(cell)}: reference ${scored.reference}, screen ${scored.screen}`);
  writeFileSync(files.diff, encodePng(diffPicture(reference, screen, scored)));
  const result = {
    channel: scored.channel,
    scored: scored.scored,
    differing: scored.differing,
    largest: scored.largest,
    masked: scored.masked,
    total: scored.total,
    ladder: ladder(reference, screen, masks, [0, 4, 8, 16]),
    masks: masks.map((mask) => mask.reason),
    diff: files.diff,
    compare,
  };
  writeFileSync(files.result, `${JSON.stringify(result, null, 2)}\n`);
  return result;
};

/** Takes and scores the port's iOS cell of `row`. */
const shootCell = (
  frame: { readonly root: string; readonly refs: string; readonly one: string },
  row: Row,
  cell: Cell,
) => {
  const side = row.exact;
  if (side === undefined) throw new Error(`${row.id}: no Exact side written yet`);
  if (!existsSync(refFile(frame, cell))) throw new Error(`${cellName(cell)}: no reference`);
  const udid = udidOfName(EXACT_SIMULATORS[cell.app]);
  const files = shotFiles(frame.root, cell);
  mkdirSync(dirname(files.screen), { recursive: true });
  if (cell.size !== IOS.size) run(['xcrun', 'simctl', 'ui', udid, 'content_size', cell.size]);
  overrideStatusBar(udid);
  const ops = [
    `prefer prefers-color-scheme ${cell.scheme}`,
    'clock settle',
    ...side.ops,
    'clock settle',
    `screenshot ${files.screen} compare ${refFile(frame, cell)}`,
  ];
  const out = run(
    [
      'bun',
      'run',
      'exact',
      'agent',
      'ios',
      '--sim',
      udid,
      '--storage',
      `pm-${row.id}`,
      '--reset-storage',
      ...ops,
    ],
    join(frame.root, 'apps', `${cell.app}-exact`),
  );
  if (cell.size !== IOS.size) run(['xcrun', 'simctl', 'ui', udid, 'content_size', IOS.size]);
  const compare = out.trim().split('\n').slice(-12).join('\n');
  return score(
    frame,
    cell,
    pixelsOf([...(row.one?.masks ?? []), ...(side.masks ?? [])], IOS.scale),
    compare,
  );
};

/** Shoots the asked iOS cells of `rows`; one line per cell. */
export const shoot = (
  frame: { readonly root: string; readonly refs: string; readonly one: string },
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
