/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAs, effect/noTernary, effect/noNullish, effect/noKnownValueWidening -- a host script that writes `tools/web/budget.json` from drive-web's JSON reports, whose measures are open records of numbers by page and name, and the rule drive-web checks a measure by; it never runs in the data module. */

/**
 * The web build's budget (`tools/web/budget.json`), in two halves. A byte
 * count does not hang on the host's load: each is what every one of three
 * or more drive-web `measure` runs counted, at any load, and runs that
 * count differently are refused, never averaged; so are runs that measure
 * different pages or names, in whatever order they come. A time does hang on it:
 * each is the median of five or more runs at a load of 5 or less, and a
 * run over that load never sets one. The runs each half was taken from are
 * kept beside it (`byteRuns`, the byte counts alone, and `runs`), so its
 * test (`src/web/budget.test.ts`) can take the limits again. A measure
 * (`overOf`) fails on a value with no limit, unless `UNBUDGETED` names it
 * with its reason, and on a limit with no value; it passes when each byte
 * count is within a tenth over its limit, and each
 * time within a tenth or `TIME_SLACK_MS` over, whichever is more: the
 * floor lies between the widest spread of a time across the quiet runs
 * and twice it, the spread of one sitting and the drift between sittings
 * (up to 20 ms across four sittings in round 1).
 *
 * `bun tools/web/budget.ts <report.json>…` writes the budget from
 * drive-web's `--json` reports, each of one `measure` run: the bytes from
 * them all, the times from those at a load of 5 or less. With
 * `--keep-times` the time half is kept as the budget holds it, its runs
 * and limits untouched, when the host gave too few quiet runs.
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
  /** The quiet runs the times are taken from. */
  readonly runs: ReadonlyArray<Run>;
  /** The runs the byte counts are taken from, their byte counts alone. */
  readonly byteRuns: ReadonlyArray<Run>;
  readonly limits: Measured;
}

/** A time's least allowance over its limit: no less than the widest spread of a time across the budget's runs, no more than twice it. */
export const TIME_SLACK_MS = 25;
/** The highest load a time is measured or checked at. */
export const MAX_LOAD = 5;
/** The fewest quiet runs the times are taken from. */
export const LEAST_RUNS = 5;
/** The fewest runs the byte counts are taken from, all of which must agree. */
export const LEAST_BYTE_RUNS = 3;

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

/** `measured` with only the values `keep` names. */
const only = (measured: Measured, keep: (name: string) => boolean): Measured =>
  Object.fromEntries(
    Object.entries(measured).map(([key, values]) => [
      key,
      Object.fromEntries(Object.entries(values).filter(([name]) => keep(name))),
    ]),
  );

/**
 * Every page a measure holds, as `<page>:`, and every name under it, as
 * `<page> <name>`, sorted: a page counts whether or not it holds a value,
 * so a run with an extra page that measured nothing differs from one
 * without it.
 */
export const entriesOf = (measured: Measured): ReadonlyArray<string> =>
  Object.entries(measured)
    .flatMap(([key, values]) => [`${key}:`, ...Object.keys(values).map((name) => `${key} ${name}`)])
    .toSorted();

/**
 * Refuses `runs` unless every one measured the same pages and names: a
 * page or name one run has and another lacks is named, whichever run
 * comes first, so no order of the same runs takes a limit from some and
 * leaves it out for the rest.
 */
export const sameEntries = (runs: ReadonlyArray<Run>): void => {
  const all = new Set(runs.flatMap((run) => entriesOf(run.measured)));
  const odd = [...all].toSorted().flatMap((entry) => {
    const lacking = runs.flatMap((run, at) =>
      entriesOf(run.measured).includes(entry) ? [] : [at + 1],
    );
    return lacking.length === 0 ? [] : [`${entry}: not in run ${lacking.join(', ')}`];
  });
  if (odd.length > 0)
    throw new Error(`the runs measure different pages or names:\n${odd.join('\n')}`);
};

/**
 * The measured values a page has no limit for, by `<page> <name>`, each
 * with why it is measured and not budgeted. None is today: every value a
 * measure holds has a limit.
 */
export const UNBUDGETED: Readonly<Record<string, string>> = {};

/**
 * What a measure breaks of `limits`: each value over its allowance (times
 * only when `timesChecked`), each value with no limit and not listed in
 * `unbudgeted`, and each limit with no value measured.
 */
export const overOf = (
  measured: Measured,
  limits: Measured,
  timesChecked: boolean,
  unbudgeted: Readonly<Record<string, string>> = UNBUDGETED,
): ReadonlyArray<string> => {
  /** What one measured value breaks: its limit's allowance, or having none. */
  const breaks = (key: string, name: string, value: number): ReadonlyArray<string> => {
    const limit = limits[key]?.[name];
    if (limit === undefined)
      return unbudgeted[`${key} ${name}`] === undefined
        ? [`${key} ${name} ${value}: no limit`]
        : [];
    if (isTime(name) && !timesChecked) return [];
    const allowed = allowedOver(name, limit);
    return value > allowed ? [`${key} ${name} ${value} > ${Math.floor(allowed)}`] : [];
  };
  const over = Object.entries(measured).flatMap(([key, values]) =>
    Object.entries(values).flatMap(([name, value]) => breaks(key, name, value)),
  );
  const unmeasured = Object.entries(limits).flatMap(([key, values]) =>
    Object.keys(values)
      .filter((name) => measured[key]?.[name] === undefined)
      .map((name) => `${key} ${name}: limited, not measured`),
  );
  return [...over, ...unmeasured];
};

/** Each time's median across `runs`, which must all be quiet and measure the same names. */
export const timesOf = (runs: ReadonlyArray<Run>): Measured => {
  sameEntries(runs);
  const loaded = runs.filter((run) => run.load > MAX_LOAD);
  if (loaded.length > 0)
    throw new Error(
      `a run at a load over ${MAX_LOAD} sets no time (loads ${loaded.map((run) => run.load).join(', ')})`,
    );
  if (runs.length < LEAST_RUNS)
    throw new Error(`${runs.length} runs at a load of ${MAX_LOAD} or less; ${LEAST_RUNS} needed`);
  const limits: Measured = {};
  for (const [key, values] of Object.entries(runs[0]?.measured ?? {})) {
    limits[key] = {};
    for (const name of Object.keys(values).filter(isTime))
      limits[key][name] = medianOf(runs.map((run) => run.measured[key]?.[name] ?? Number.NaN));
  }
  return limits;
};

/** Each byte count every one of `runs` measured: refused when fewer than `LEAST_BYTE_RUNS`, when they measure different pages or names, or when any two differ. */
export const bytesOf = (runs: ReadonlyArray<Run>): Measured => {
  if (runs.length < LEAST_BYTE_RUNS)
    throw new Error(`${runs.length} runs for the byte counts; ${LEAST_BYTE_RUNS} needed`);
  sameEntries(runs);
  const limits: Measured = {};
  const differ: Array<string> = [];
  for (const [key, values] of Object.entries(runs[0]?.measured ?? {})) {
    limits[key] = {};
    for (const name of Object.keys(values).filter((each) => !isTime(each))) {
      const all = runs.map((run) => run.measured[key]?.[name] ?? Number.NaN);
      if (all.some((value) => value !== all[0])) differ.push(`${key} ${name}: ${all.join(', ')}`);
      limits[key][name] = all[0] ?? Number.NaN;
    }
  }
  if (differ.length > 0) throw new Error(`the runs count different bytes:\n${differ.join('\n')}`);
  return limits;
};

/** The limits: each page's byte counts from `byteRuns`, then its times from the quiet `runs`, both halves over the same pages. */
export const limitsOf = (byteRuns: ReadonlyArray<Run>, runs: ReadonlyArray<Run>): Measured => {
  const bytes = bytesOf(byteRuns);
  const times = timesOf(runs);
  const pages = (measured: Measured) => Object.keys(measured).toSorted().join(', ');
  if (pages(bytes) !== pages(times))
    throw new Error(`the byte runs measure ${pages(bytes)}; the time runs ${pages(times)}`);
  return Object.fromEntries(
    Object.entries(bytes).map(([key, values]) => [key, { ...values, ...times[key] }]),
  );
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

const rounded = (run: Run): Run => ({
  load: Math.round(run.load * 10) / 10,
  measured: run.measured,
});

/** What the budget says it was taken from. */
export const fromOf = (byteRuns: number, runs: number): string =>
  `bytes: what each of ${byteRuns} drive-web measure runs counted, at any load; times: the median of ${runs} drive-web measure runs at a load of ${MAX_LOAD} or less`;

/** The budget from `reports`: bytes from them all, times from the quiet ones, or from `kept`'s runs when given. */
export const budgetOf = (reports: ReadonlyArray<Run>, kept?: ReadonlyArray<Run>): Budget => {
  sameEntries(reports);
  const runs = (kept ?? reports.filter((run) => run.load <= MAX_LOAD)).map(rounded);
  const timed = (run: Run): Run => ({ ...run, measured: only(run.measured, isTime) });
  sameEntries([...reports, ...runs].map(timed));
  const byteRuns = reports.map((run) =>
    rounded({ ...run, measured: only(run.measured, (name) => !isTime(name)) }),
  );
  return {
    from: fromOf(byteRuns.length, runs.length),
    runs,
    byteRuns,
    limits: limitsOf(byteRuns, runs),
  };
};

if (import.meta.main) {
  const file = join(import.meta.dir, 'budget.json');
  const keepTimes = process.argv.includes('--keep-times');
  const reports = process.argv
    .slice(2)
    .filter((arg) => arg !== '--keep-times')
    .map((path) => {
      const report = JSON.parse(readFileSync(path, 'utf8')) as {
        measure?: Run & { throttled?: boolean };
      };
      if (report.measure === undefined || report.measure.throttled === true)
        throw new Error(`${path}: no unthrottled measure`);
      return { load: report.measure.load, measured: report.measure.measured };
    });
  const kept = keepTimes ? (JSON.parse(readFileSync(file, 'utf8')) as Budget).runs : undefined;
  const budget = budgetOf(reports, kept);
  writeFileSync(file, `${JSON.stringify(budget, null, 1)}\n`);
  console.log(
    `wrote ${file}: ${budget.from}${keepTimes ? ' (times kept as they were)' : ''}; widest time spread ${spreadOf(budget.runs)} ms, TIME_SLACK_MS ${TIME_SLACK_MS}`,
  );
}
