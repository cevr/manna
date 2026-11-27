/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noUnknownParameters -- a Bun test that reads the web budget's JSON and drive-web's source, to hold the budget to the runs it was taken from, and feeds the budget values that are not finite numbers (`null` among them) where a report's JSON may hold them. */

/**
 * The web build's budget (`tools/web/budget.json`) is what its runs say:
 * each byte count what every one of three or more drive-web measures
 * counted, at any load, and each time the median of five or more measures
 * at a load of 5 or less; the time floor (`TIME_SLACK_MS`) between the
 * widest spread of a time across the quiet runs and twice it. Runs that
 * count different bytes are refused, and a run over that load never sets
 * a time. drive-web checks by the budget module's rule, holding no floor
 * of its own.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  allowedOver,
  type Budget,
  budgetOf,
  bytesOf,
  fromOf,
  isTime,
  LEAST_BYTE_RUNS,
  LEAST_RUNS,
  limitsOf,
  MAX_LOAD,
  medianOf,
  overOf,
  type Run,
  spreadOf,
  TIME_SLACK_MS,
  timesOf,
  UNBUDGETED,
} from '../../tools/web/budget.ts';

const tools = join(import.meta.dir, '../../tools');
const budget = JSON.parse(readFileSync(join(tools, 'web/budget.json'), 'utf8')) as Budget;

/** A run of one page at `load`, `bytes` on the wire, shown at `rowMs`. */
const run = (load: number, bytes: number, rowMs: number): Run => ({
  load,
  measured: { '/ cold': { bytes, rowMs } },
});

describe('the web budget', () => {
  test('takes its times from five or more runs at a load of 5 or less, and its bytes from three or more', () => {
    expect(budget.runs.length).toBeGreaterThanOrEqual(LEAST_RUNS);
    for (const each of budget.runs) expect(each.load).toBeLessThanOrEqual(MAX_LOAD);
    expect(budget.byteRuns.length).toBeGreaterThanOrEqual(LEAST_BYTE_RUNS);
    for (const each of budget.byteRuns)
      for (const values of Object.values(each.measured))
        expect(Object.keys(values).filter(isTime)).toEqual([]);
    expect(budget.from).toBe(fromOf(budget.byteRuns.length, budget.runs.length));
  });

  test('each byte limit is what every byte run counted, and each time limit the median of its quiet runs', () => {
    expect(budget.limits).toEqual(limitsOf(budget.byteRuns, budget.runs));
    expect(Object.keys(budget.limits).toSorted()).toEqual([
      '/ cold',
      '/ warm',
      '/hymns/100 cold',
      '/hymns/100 warm',
    ]);
  });

  test('refuses runs that count different bytes, never taking their median', () => {
    expect(bytesOf([run(9, 100, 1), run(20, 100, 2), run(1, 100, 3)])).toEqual({
      '/ cold': { bytes: 100 },
    });
    expect(() => bytesOf([run(1, 100, 1), run(1, 101, 1), run(1, 100, 1)])).toThrow(
      'the runs count different bytes',
    );
    expect(() => bytesOf([run(1, 100, 1), run(1, 100, 1)])).toThrow('3 needed');
  });

  test('never sets a time from a run over the load, and needs five quiet ones', () => {
    const quiet = [1, 2, 3, 4, 5].map((ms) => run(2, 100, 100 + ms));
    expect(timesOf(quiet)).toEqual({ '/ cold': { rowMs: 103 } });
    expect(() => timesOf([...quiet, run(MAX_LOAD + 1, 100, 1)])).toThrow('sets no time');
    expect(() => timesOf(quiet.slice(1))).toThrow('5 needed');
    const loaded = [run(12, 100, 1), run(12, 100, 1), run(12, 100, 1)];
    expect(() => budgetOf(loaded)).toThrow('0 runs at a load of 5 or less');
    const made = budgetOf([...loaded, ...quiet]);
    expect(made.limits).toEqual({ '/ cold': { bytes: 100, rowMs: 103 } });
    expect(made.runs.every((each) => each.load <= MAX_LOAD)).toBe(true);
    expect(budgetOf(loaded, quiet).limits).toEqual({ '/ cold': { bytes: 100, rowMs: 103 } });
  });

  test('the time floor lies between the widest spread of a time across the runs and twice it', () => {
    const spread = spreadOf(budget.runs);
    expect(spread).toBeGreaterThan(0);
    expect(TIME_SLACK_MS).toBeGreaterThanOrEqual(spread);
    expect(TIME_SLACK_MS).toBeLessThanOrEqual(2 * spread);
    const warm = budget.limits['/ warm']?.['rowMs'] ?? 0;
    expect(allowedOver('rowMs', warm)).toBe(warm + TIME_SLACK_MS);
    expect(allowedOver('bytes', 1000)).toBeCloseTo(1100);
  });

  test('refuses, in every order, runs that measure different pages or names', () => {
    const page = { bytes: 100, html: 10, rowMs: 50 };
    const plain = (load: number): Run => ({ load, measured: { '/ cold': page, '/ warm': page } });
    const odd: ReadonlyArray<[string, Run]> = [
      [
        'a name more',
        { load: 2, measured: { '/ cold': { ...page, newKind: 20 }, '/ warm': page } },
      ],
      [
        'a name less',
        { load: 2, measured: { '/ cold': { bytes: 100, rowMs: 50 }, '/ warm': page } },
      ],
      [
        'a time less',
        { load: 2, measured: { '/ cold': { bytes: 100, html: 10 }, '/ warm': page } },
      ],
      ['a page less', { load: 2, measured: { '/ cold': page } }],
      ['a page more', { load: 2, measured: { '/ cold': page, '/ warm': page, '/x': page } }],
      ['an empty page more', { load: 2, measured: { '/ cold': page, '/ warm': page, '/x': {} } }],
      ['a page emptied', { load: 2, measured: { '/ cold': page, '/ warm': {} } }],
    ];
    /** Every order of `runs`. */
    const orders = (runs: ReadonlyArray<Run>): ReadonlyArray<ReadonlyArray<Run>> => {
      if (runs.length <= 1) return [runs];
      return runs.flatMap((first, at) =>
        orders(runs.toSpliced(at, 1)).map((rest) => [first, ...rest]),
      );
    };
    const same = [1, 2, 3, 4, 5].map(plain);
    expect(budgetOf(same).limits).toEqual({ '/ cold': page, '/ warm': page });
    for (const [what, one] of odd) {
      const mixed = [...same.slice(1), one];
      const all = orders(mixed);
      expect(all.length).toBe(120);
      for (const each of all) {
        expect(() => budgetOf(each), what).toThrow('different pages or names');
        expect(() => bytesOf(each)).toThrow('different pages or names');
      }
      expect(() => budgetOf([plain(9), plain(9), plain(9)], [...same.slice(1), one])).toThrow(
        'different pages or names',
      );
    }
  });

  test('a measure fails on a value with no limit, unless named unbudgeted with a reason, and on a limit with no value', () => {
    const limits = { '/ cold': { bytes: 100, rowMs: 50 } };
    expect(overOf({ '/ cold': { bytes: 100, rowMs: 50 } }, limits, true)).toEqual([]);
    expect(overOf({ '/ cold': { bytes: 100, rowMs: 999 } }, limits, false)).toEqual([]);
    expect(overOf({ '/ cold': { bytes: 111, rowMs: 50 } }, limits, true)).toEqual([
      '/ cold bytes 111 > 110',
    ]);
    const more = { '/ cold': { bytes: 100, rowMs: 50, newKind: 20 }, '/x': { bytes: 1 } };
    expect(overOf(more, limits, true)).toEqual([
      '/ cold newKind 20: no limit',
      '/x bytes 1: no limit',
    ]);
    expect(
      overOf(more, limits, true, { '/ cold newKind': 'a reason', '/x bytes': 'another' }),
    ).toEqual([]);
    expect(overOf({ '/ cold': { rowMs: 50 } }, limits, true)).toEqual([
      '/ cold bytes: limited, not measured',
    ]);
    expect(Object.values(UNBUDGETED).every((reason) => reason.length > 0)).toBe(true);
  });

  test('drive-web checks by the budget module, with no floor or rule of its own', () => {
    const drive = readFileSync(join(tools, 'drive-web.ts'), 'utf8');
    expect(drive).toContain("from './web/budget.ts'");
    expect(drive).toContain('overOf(measured, limits, timesChecked)');
    expect(drive).not.toMatch(/const TIME_SLACK_MS|limit \+ \d|write-budget|limit === undefined/u);
  });

  test('refuses, in every order, a run holding a value that is not a finite number, and takes legitimate runs', () => {
    const NOT_FINITE: ReadonlyArray<unknown> = [
      {},
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '40',
    ];
    const plain = (at: number): Run => ({
      load: 1 + at / 2,
      measured: { '/ cold': { bytes: 150, readyMs: 40 + at } },
    });
    /** Run `at` with `value` in place of its `where`: its load, its byte count or its time. */
    const spoiled = (at: number, where: 'load' | 'bytes' | 'readyMs', value: unknown) => {
      const run = structuredClone(plain(at));
      if (where === 'load') Reflect.set(run, 'load', value);
      else Reflect.set(run.measured['/ cold'] ?? {}, where, value);
      return run;
    };
    const orders = (runs: ReadonlyArray<Run>): ReadonlyArray<ReadonlyArray<Run>> => {
      if (runs.length <= 1) return [runs];
      return runs.flatMap((first, at) =>
        orders(runs.toSpliced(at, 1)).map((rest) => [first, ...rest]),
      );
    };
    const legit = [0, 1, 2, 3, 4].map(plain);
    for (const each of orders(legit))
      expect(budgetOf(each).limits).toEqual({ '/ cold': { bytes: 150, readyMs: 42 } });
    for (const value of NOT_FINITE)
      for (const where of ['load', 'bytes', 'readyMs'] as const)
        for (let bad = 0; bad < legit.length; bad++) {
          const runs = legit.toSpliced(bad, 1, spoiled(bad, where, value));
          for (const each of orders(runs)) {
            expect(() => budgetOf(each), `${String(value)} as ${where}`).toThrow(
              'not a finite number',
            );
            expect(() => budgetOf(legit, each)).toThrow('not a finite number');
          }
          if (where !== 'load') {
            expect(() => bytesOf(runs)).toThrow('not a finite number');
            expect(() => timesOf(runs)).toThrow('not a finite number');
          }
        }
    const limits = { '/ cold': { bytes: 150, readyMs: 40 } };
    for (const value of NOT_FINITE) {
      const odd = structuredClone(limits);
      Reflect.set(odd['/ cold'], 'readyMs', value);
      expect(() => overOf({ '/ cold': { bytes: 150, readyMs: 500 } }, odd, true)).toThrow(
        'the limits holds a value that is not a finite number',
      );
      expect(() => overOf(odd, limits, true)).toThrow(
        'the measure holds a value that is not a finite number',
      );
    }
  });

  test('a median of an even count is the mean of the middle two', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([61, 64, 62, 81])).toBe(63);
  });
});
