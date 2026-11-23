/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a Bun test that reads the web budget's JSON and drive-web's source, to hold the budget to the runs it was taken from. */

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
  type Run,
  spreadOf,
  TIME_SLACK_MS,
  timesOf,
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

  test('drive-web checks by the budget module, with no floor of its own', () => {
    const drive = readFileSync(join(tools, 'drive-web.ts'), 'utf8');
    expect(drive).toContain("from './web/budget.ts'");
    expect(drive).toContain('allowedOver(name, limit)');
    expect(drive).not.toMatch(/const TIME_SLACK_MS|limit \+ \d|write-budget/u);
  });

  test('a median of an even count is the mean of the middle two', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([61, 64, 62, 81])).toBe(63);
  });
});
