/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, node/no-process-env -- the harness's command line: argv, PIXEL_REF and git, then the steps in order; plain TypeScript as the exact-kit's tools are. */

/**
 * `bun run pixel <command>` (docs/pixel-match.md):
 *
 *   ref <app> [<id>…] [--web]   the One references (the reference simulator booted and installed)
 *   shot <app> <id>… [--scheme light|dark] [--size <size>]   the port against them
 *   report [--unit <unit>]      tmp/pixel-match/report.json, as accept.ts reads it
 */

import { join } from 'node:path';

import { ROWS } from '../screens/index.ts';
import type { AppName } from './model.ts';
import { run } from './ios.ts';
import type { Frame } from './ref.ts';
import { takeIos } from './ref.ts';
import { recordMissed, writeReport } from './report.ts';
import { shoot } from './shot.ts';
import { cellName, cellsOf } from './model.ts';
import { takeWeb } from './web.ts';

const root = run(['git', 'rev-parse', '--show-toplevel']).trim();

/** The One commit: the last commit that changed either One app or the packages they draw from. */
const one = run(
  [
    'git',
    'log',
    '-1',
    '--format=%h',
    '--abbrev=12',
    '--',
    'apps/heartseed',
    'apps/hymnal',
    'packages/hymnal',
    'packages/core',
  ],
  root,
).trim();

const frame: Frame = {
  root,
  refs: process.env['PIXEL_REF'] ?? join(root, 'tmp', 'pixel-match', 'ref'),
  one,
  head: run(['git', 'rev-parse', '--short=12', 'HEAD'], root).trim(),
};

const [command = '', ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const at = rest.indexOf(`--${name}`);
  return at < 0 ? undefined : rest[at + 1];
};
const words = rest.filter((word, i) => !word.startsWith('--') && !rest[i - 1]?.startsWith('--'));
const app = words[0] as AppName | undefined;

const rowsAsked = (name: AppName, ids: ReadonlyArray<string>) =>
  ROWS[name].filter((row) => ids.length === 0 || ids.includes(row.id));

const main = async () => {
  if (command === 'report') {
    const written = writeReport(frame, flag('unit'));
    console.log(
      `pixel report: ${written.references} references, ${written.results} results, ${written.missing} missing; ${written.file}`,
    );
    return 0;
  }
  if ((command === 'ref' || command === 'shot') && (app === 'heartseed' || app === 'hymnal')) {
    const rows = rowsAsked(app, words.slice(1));
    if (command === 'shot') {
      shoot(frame, app, rows, { scheme: flag('scheme'), size: flag('size') });
      return 0;
    }
    const host = rest.includes('--web') ? 'web' : 'ios';
    const missed = host === 'web' ? await takeWeb(frame, rows) : await takeIos(frame, app, rows);
    const asked = rows
      .flatMap((row) => cellsOf(app, row).filter((cell) => cell.host === host))
      .map(cellName);
    const failed = new Set(missed.map(([cell]) => cell));
    recordMissed(
      frame,
      asked.filter((cell) => !failed.has(cell)),
      missed,
    );
    console.log(
      `pixel ref ${app} ${host}: ${asked.length - failed.size} of ${asked.length} cells taken into ${join(frame.refs, frame.one)}`,
    );
    return 0;
  }
  console.log(
    'usage: pixel ref <heartseed|hymnal> [<id>…] [--web] · pixel shot <app> <id>… [--scheme s] [--size z] · pixel report [--unit u]',
  );
  return 2;
};

process.exit(await main());
