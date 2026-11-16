/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAs, effect/noTernary, effect/noNullish, effect/noKnownValueWidening -- a host script that writes `tools/web/budget.json` from drive-web's JSON reports, whose measures are open records of numbers by page and name, and the rule drive-web checks a measure by; it never runs in the data module. */

/**
 * The web build's budget (`tools/web/budget.json`): each byte count and
 * time of drive-web's `measure` is the median of its runs at a load of 5
 * or less, at least five of them, and the runs it was taken from are kept
 * beside it, so its test (`src/web/budget.test.ts`) can take the medians
 * again. A measure passes when each byte count is within a tenth over its
 * limit, and each time within a tenth or `TIME_SLACK_MS` over, whichever
 * is more: the floor lies between the widest spread of a time across
 * those runs and twice it, the spread of one sitting and the drift between
 * sittings (up to 20 ms across four sittings in round 1).
 *
 * `bun tools/web/budget.ts <report.json>…` writes the budget from
 * drive-web's `--json` reports, each of one `measure` run, keeping only the
 * runs at a load of 5 or less.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A measure: each page and cache state's byte counts and times by name. */
export type Measured = Record<string, Record<string, number>>;

/** One drive-web `measure` run and the one-minute load it ran at. */
export interface Run {
  readonly load: number;
  readonly measured: Measured;
}

export interface Budget {
  readonly from: string;
  readonly runs: ReadonlyArray<Run>;
  readonly limits: Measured;
}

/** A time's least allowance over its limit: no less than the widest spread of a time across the budget's runs, no more than twice it. */
export const TIME_SLACK_MS = 20;
/** The highest load a time is measured or checked at. */
export const MAX_LOAD = 5;
/** The fewest runs a budget is taken from. */
export const LEAST_RUNS = 5;

export const isTime = (name: string): boolean => name.endsWith('Ms');

/** The median, the mean of the middle two of an even count, rounded. */
export const medianOf = (values: ReadonlyArray<number>): number => {
  const sorted = values.toSorted((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  const middle =
    sorted.length % 2 === 1
      ? (sorted[half] ?? 0)
      : ((sorted[half - 1] ?? 0) + (sorted[half] ?? 0)) / 2;
  return Math.round(middle);
};

/** Each value's median across `runs`. */
export const limitsOf = (runs: ReadonlyArray<Run>): Measured => {
  const limits: Measured = {};
  for (const [key, values] of Object.entries(runs[0]?.measured ?? {})) {
    limits[key] = {};
    for (const name of Object.keys(values))
      limits[key][name] = medianOf(runs.map((run) => run.measured[key]?.[name] ?? Number.NaN));
  }
  return limits;
};

/** The widest spread of any time across `runs`. */
export const spreadOf = (runs: ReadonlyArray<Run>): number => {
  let widest = 0;
  for (const [key, values] of Object.entries(runs[0]?.measured ?? {}))
    for (const name of Object.keys(values).filter(isTime)) {
      const all = runs.map((run) => run.measured[key]?.[name] ?? Number.NaN);
      widest = Math.max(widest, Math.max(...all) - Math.min(...all));
    }
  return widest;
};

/** How far a value may reach over its limit. */
export const allowedOver = (name: string, limit: number): number =>
  isTime(name) ? Math.max(limit * 1.1, limit + TIME_SLACK_MS) : limit * 1.1;

/** The budget from `runs`, those at a load over `MAX_LOAD` left out. */
export const budgetOf = (runs: ReadonlyArray<Run>): Budget => {
  const kept = runs.filter((run) => run.load <= MAX_LOAD);
  if (kept.length < LEAST_RUNS)
    throw new Error(`${kept.length} runs at a load of ${MAX_LOAD} or less; ${LEAST_RUNS} needed`);
  return {
    from: `the median of ${kept.length} drive-web measure runs at a load of ${MAX_LOAD} or less`,
    runs: kept.map((run) => ({ load: Math.round(run.load * 10) / 10, measured: run.measured })),
    limits: limitsOf(kept),
  };
};

if (import.meta.main) {
  const runs = process.argv.slice(2).map((file) => {
    const report = JSON.parse(readFileSync(file, 'utf8')) as {
      measure?: Run & { throttled?: boolean };
    };
    if (report.measure === undefined || report.measure.throttled === true)
      throw new Error(`${file}: no unthrottled measure`);
    return { load: report.measure.load, measured: report.measure.measured };
  });
  const budget = budgetOf(runs);
  const file = join(import.meta.dir, 'budget.json');
  writeFileSync(file, `${JSON.stringify(budget, null, 1)}\n`);
  console.log(
    `wrote ${file}: ${budget.from}; widest time spread ${spreadOf(budget.runs)} ms, TIME_SLACK_MS ${TIME_SLACK_MS}`,
  );
}
