/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary, effect/noAs, effect/noTryCatch -- a host tool that drives the port through `bun run exact agent`, reads its JSON replies and the pictures on disk, and writes the result files: plain TypeScript as the exact-kit's drives are. */

/**
 * `pixel shot <app> <id>… [--scheme light|dark] [--size <size>]`: the port
 * against the One reference. For each iOS cell asked, the port is launched
 * on its Exact simulator through `bun run exact agent ios` (the wrapper, its
 * lock, its simulator) on a fresh store and on the agent's clock at the
 * reference's hour (`portClock`), set to the cell's scheme, driven by the
 * row's ops and its screen taken with Exact's `compare` against the
 * reference. The strict diff then scores the pair at the threshold's
 * channel; the result (with the count at channel 0, 4, 8 and 16), the diff
 * picture and Exact's `compare` text are written beside the screen.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { hostZone, portClock } from './clock.ts';
import { diffPicture, ladder, scorePair, type Band, type Banding, type Mask } from './diff.ts';
import { overrideStatusBar, rectIn, run } from './ios.ts';
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

/** Where the checkout and the references are. */
interface Frame {
  readonly root: string;
  readonly refs: string;
  readonly one: string;
}

/** The Exact simulators the wrapper drives, by app. */
const EXACT_SIMULATORS: Readonly<Record<AppName, string>> = {
  heartseed: 'verify-heartseed-exact',
  hymnal: 'verify-hymnal-exact',
};

/** The channel limit a pair is scored at: `accept.ts`'s. */
const CHANNEL = 16;

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
const pixelsOf = (masks: ReadonlyArray<MaskSpec>, scale: number): ReadonlyArray<Mask> =>
  masks.map((mask) => ({
    x: mask.x * scale,
    y: mask.y * scale,
    width: mask.width * scale,
    height: mask.height * scale,
    reason: mask.reason,
  }));

/** Scores one cell's screen against its reference and writes the result and the diff picture; the result. */
const score = (
  frame: Frame,
  cell: Cell,
  masks: ReadonlyArray<Mask>,
  compare: string,
  bands: Banding | undefined,
) => {
  const files = shotFiles(frame.root, cell);
  const wholeReference = decodePng(readFileSync(refFile(frame, cell)), 'reference');
  const wholeScreen = decodePng(readFileSync(files.screen), 'screen');
  const { reference, screen, laid, picture, scored } = scorePair(
    wholeReference,
    wholeScreen,
    masks,
    CHANNEL,
    bands,
  );
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
    picture,
    bands,
    ladder: ladder(reference, screen, laid, [0, 4, 8, 16]),
    masks: masks.map((mask) => mask.reason),
    diff: files.diff,
    compare,
  };
  writeFileSync(files.result, `${JSON.stringify(result, null, 2)}\n`);
  return result;
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
 * What a reference's metadata gives the port's side: its band (its top read
 * from One's tree at capture, to the picture's foot; none for a row not
 * banded) and its hour and zone, for the agent's clock.
 */
const referenceOf = (frame: Frame, cell: Cell) => {
  const metadata = JSON.parse(
    readFileSync(refFile(frame, cell).replace(/\.png$/, '.json'), 'utf8'),
  ) as {
    readonly band?: { readonly top: number };
    readonly hour: number;
    readonly timeZone?: string;
  };
  const band: Band | undefined =
    metadata.band === undefined
      ? undefined
      : { top: metadata.band.top, bottom: Number.POSITIVE_INFINITY };
  return { band, taken: { hour: metadata.hour, timeZone: metadata.timeZone } };
};

/**
 * The port's band in device pixels from the agent's `--json` output: the
 * agent prints one JSON line per op (`agent.mjs`, `JSON.stringify` of each
 * reply), so the two `layout` replies are the two lines before the last,
 * the screenshot's. From the bottom of the first node to the top of the
 * second; none when either holds no rect.
 */
export const edgesIn = (out: string): Band | undefined => {
  const replies = out.trim().split('\n').slice(-3);
  const [top, bottom] = [rectIn(replies[0] ?? ''), rectIn(replies[1] ?? '')];
  if (top === undefined || bottom === undefined) return undefined;
  return { top: (top.y + top.height) * IOS.scale, bottom: bottom.y * IOS.scale };
};

/**
 * Scores the port's screen of `cell`, already on disk, against its
 * reference, given the agent's `--json` output `out` of the drive that took
 * it: a banded row over its two bands, else the whole pictures. The result,
 * also written beside the screen.
 */
export const scoreShot = (frame: Frame, row: Row, cell: Cell, out: string) => {
  const oneBand = referenceOf(frame, cell).band;
  const compare = out.trim().split('\n').slice(-12).join('\n');
  let bands: Banding | undefined;
  if (oneBand !== undefined) {
    const screen = edgesIn(out);
    if (screen === undefined)
      throw new Error(
        `${row.id}: no rect in the agent's layout replies: ${out.trim().split('\n').slice(-3, -1).join(' | ').slice(0, 400)}`,
      );
    bands = { reference: oneBand, screen, anchor: row.anchor ?? 'top' };
  }
  return score(
    frame,
    cell,
    pixelsOf([...(row.one?.masks ?? []), ...(row.exact?.masks ?? [])], IOS.scale),
    compare,
    bands,
  );
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
  const edges =
    side.band === undefined ? [] : [`layout ${side.band.top}`, `layout ${side.band.bottom}`];
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
      '--reset-storage',
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
