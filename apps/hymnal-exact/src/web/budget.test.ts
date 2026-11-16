/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a Bun test that reads the web budget's JSON and drive-web's source, to hold the budget to the runs it was taken from. */

/**
 * The web build's budget (`tools/web/budget.json`) is what its runs say:
 * five or more drive-web measures at a load of 5 or less, every limit
 * their median, and the time floor (`TIME_SLACK_MS`) between the widest
 * spread of a time across them and twice it. drive-web checks by the budget
 * module's rule, holding no floor of its own.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  allowedOver,
  type Budget,
  LEAST_RUNS,
  limitsOf,
  MAX_LOAD,
  medianOf,
  spreadOf,
  TIME_SLACK_MS,
} from '../../tools/web/budget.ts';

const tools = join(import.meta.dir, '../../tools');
const budget = JSON.parse(readFileSync(join(tools, 'web/budget.json'), 'utf8')) as Budget;

describe('the web budget', () => {
  test('is taken from five or more runs at a load of 5 or less', () => {
    expect(budget.runs.length).toBeGreaterThanOrEqual(LEAST_RUNS);
    for (const run of budget.runs) expect(run.load).toBeLessThanOrEqual(MAX_LOAD);
    expect(budget.from).toContain(`${budget.runs.length} drive-web measure runs`);
  });

  test('each limit is the median of its runs', () => {
    expect(budget.limits).toEqual(limitsOf(budget.runs));
    expect(Object.keys(budget.limits).toSorted()).toEqual([
      '/ cold',
      '/ warm',
      '/hymns/100 cold',
      '/hymns/100 warm',
    ]);
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
