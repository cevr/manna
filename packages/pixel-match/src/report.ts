/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish, effect/noAs, effect/noGlobals, effect/noTernary -- a host tool that reads the pictures' metadata and results on disk as JSON and writes one JSON file, plain TypeScript as the harness's other tools. */

/**
 * `pixel report [--unit <unit>]`: every cell of the inventory, as
 * `accept.ts` reads it. `references` names each cell whose One picture is on
 * disk under the One commit; `results` holds each cell a `pixel shot`
 * scored, read from its result file (the numbers the strict diff made from
 * the pictures on disk); `missing` names each cell with no reference and
 * why, as the last capture recorded it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ROWS } from '../screens/index.ts';
import type { Score } from './diff.ts';
import { cellName, cellsOf, type AppName } from './model.ts';
import { refFile, reportFile, shotFiles } from './paths.ts';

/** What one capture run could not take: cell name to reason, by app and host, kept beside the references. */
const missedFile = (frame: { readonly refs: string; readonly one: string }) =>
  join(frame.refs, frame.one, 'missed.json');

const readMissed = (file: string): Record<string, string> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {};

/** Records what a run missed and forgets what it took, so the file names only cells still without a picture. */
export const recordMissed = (
  frame: { readonly refs: string; readonly one: string },
  taken: ReadonlyArray<string>,
  missed: ReadonlyArray<readonly [string, string]>,
) => {
  const file = missedFile(frame);
  const known = readMissed(file);
  for (const cell of taken) delete known[cell];
  for (const [cell, why] of missed) known[cell] = why;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(known, null, 2)}\n`);
};

/** A scored cell as the report holds it. */
interface Result extends Score {
  readonly cell: string;
}

export const writeReport = (
  frame: {
    readonly root: string;
    readonly refs: string;
    readonly one: string;
    readonly head: string;
  },
  unit: string | undefined,
) => {
  const references: string[] = [];
  const results: Result[] = [];
  const missed = readMissed(missedFile(frame));
  const missing: Record<string, string> = {};
  for (const app of Object.keys(ROWS) as AppName[])
    for (const row of ROWS[app]) {
      if (unit !== undefined && unit !== 'pm-harness' && row.unit !== unit) continue;
      for (const cell of cellsOf(app, row)) {
        const name = cellName(cell);
        if (existsSync(refFile(frame, cell))) references.push(name);
        else missing[name] = missed[name] ?? 'not captured yet';
        const result = shotFiles(frame.root, cell).result;
        if (existsSync(result))
          results.push({ cell: name, ...(JSON.parse(readFileSync(result, 'utf8')) as Score) });
      }
    }
  const report = {
    head: frame.head,
    one: frame.one,
    unit: unit ?? 'all',
    references,
    results,
    missing,
  };
  const file = reportFile(frame.root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return {
    file,
    references: references.length,
    results: results.length,
    missing: Object.keys(missing).length,
  };
};
