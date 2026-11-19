/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, node/no-process-env -- the harness's command line: argv, PIXEL_REF and git, then the steps in order; plain TypeScript as the exact-kit's tools are. */

/**
 * `bun run pixel <command>` (docs/pixel-match.md):
 *
 *   ref <app> [<id>…] [--web] [--repin]   the One references under the pinned One commit (the reference simulator booted and installed)
 *   shot <app> <id>… [--web] [--scheme light|dark] [--size <size>]   the port against them
 *   report [--unit <unit>]      tmp/pixel-match/report.json, as accept.ts reads it
 *
 * The capture modules (Playwright's, the simulator's) load only once a
 * command captures, so a report or a refusal starts without them.
 */

import { join } from 'node:path';

import { Option } from 'effect';

import { ROWS } from '../screens/index.ts';
import { parseArgs } from './args.ts';
import type { AppName } from './model.ts';
import { run } from './ios.ts';
import type { Frame } from './ref.ts';
import { recordMissed, writeReport } from './report.ts';
import { rowsAsked } from './rows.ts';
import { cellName, cellsOf } from './model.ts';
import { driftLine, driftOf, readNeutral, readPin, refKey, writePin } from './pin.ts';

const USAGE =
  'usage: pixel ref <heartseed|hymnal> [<id>…] [--web] [--repin] · pixel shot <app> <id>… [--web] [--scheme s] [--size z] · pixel report [--unit u]';

/** Playwright's capture of One on the web, loaded when a web `ref` runs. */
const loadWebCapture = () => import('./web.ts');

/** The simulator's capture of One, loaded when an iOS `ref` runs. */
const loadIosCapture = () => import('./ref.ts');

/** The port's capture and score, loaded when `shot` runs. */
const loadShot = () => import('./shot.ts');

/** `pixel ref`: takes the rows' cells of one host under `key`'s commit, records what it missed, and pins the commit on `--repin`. */
const take = async (
  frame: Frame,
  app: AppName,
  rows: ReadonlyArray<(typeof ROWS)[AppName][number]>,
  web: boolean,
  key: { readonly one: string; readonly repin: boolean },
) => {
  const taking: Frame = { ...frame, one: key.one };
  const host = web ? 'web' : 'ios';
  const missed = web
    ? await (await loadWebCapture()).takeWeb(taking, rows)
    : await (await loadIosCapture()).takeIos(taking, app, rows);
  const cells = rows
    .flatMap((row) => cellsOf(app, row).filter((cell) => cell.host === host))
    .map(cellName);
  const failed = new Set(missed.map(([cell]) => cell));
  recordMissed(
    taking,
    cells.filter((cell) => !failed.has(cell)),
    missed,
  );
  if (key.repin) writePin(frame.root, key.one);
  console.log(
    `pixel ref ${app} ${host}: ${cells.length - failed.size} of ${cells.length} cells taken into ${join(taking.refs, taking.one)}${key.repin ? `; pinned ${key.one}` : ''}`,
  );
};

const main = async () => {
  const asked = parseArgs(process.argv.slice(2));
  if (asked._tag === 'Refused') {
    console.error(`pixel: ${asked.reason}`);
    console.error(USAGE);
    return 1;
  }
  const root = run(['git', 'rev-parse', '--show-toplevel']).trim();
  const pinned = readPin(root);
  const drift = driftOf((args) => run(['git', ...args], root), pinned, readNeutral(root));
  if (Option.isSome(drift)) console.error(driftLine(drift.value));
  const frame: Frame = {
    root,
    refs: process.env['PIXEL_REF'] ?? join(root, 'tmp', 'pixel-match', 'ref'),
    one: pinned,
    head: run(['git', 'rev-parse', '--short=12', 'HEAD'], root).trim(),
  };
  const { command, words } = asked;
  const app = words[0] as AppName | undefined;

  if (command === 'report') {
    const written = writeReport(frame, asked.unit);
    console.log(
      `pixel report: ${written.references} references, ${written.results} results, ${written.missing} missing; ${written.file}`,
    );
    return 0;
  }
  if ((command === 'ref' || command === 'shot') && (app === 'heartseed' || app === 'hymnal')) {
    const ids = words.slice(1);
    const key = command === 'ref' ? refKey(pinned, drift, asked.repin) : undefined;
    if (key?._tag === 'Refused') {
      console.error(key.reason);
      return 1;
    }
    const picked = rowsAsked(app, ROWS[app], ids);
    if (picked._tag === 'Refused') {
      console.error(picked.reason);
      return 1;
    }
    const { rows } = picked;
    if (command === 'shot') {
      const { shoot } = await loadShot();
      await shoot(frame, app, rows, { web: asked.web, scheme: asked.scheme, size: asked.size });
      return 0;
    }
    await take(frame, app, rows, asked.web, key ?? { one: pinned, repin: false });
    return 0;
  }
  console.log(USAGE);
  return 2;
};

process.exit(await main());
