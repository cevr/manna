/* oxlint-disable effect/noGlobals, effect/noNullish -- the fixtures are functions of the host's local day: the test hands them a fixed local date. */
import { describe, expect, test } from 'bun:test';

import { storeOf } from '../src/fixtures.ts';
import { cellsOf, type AppName } from '../src/model.ts';
import { ROWS } from './index.ts';

const APPS: ReadonlyArray<AppName> = ['heartseed', 'hymnal'];

describe('the screens', () => {
  test('each app names a row once, and the inventory has 70 match rows, 22 gap rows and 423 cells', () => {
    for (const app of APPS) {
      const ids = ROWS[app].map((row) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const rows = APPS.flatMap((app) => ROWS[app]);
    expect(rows.filter((row) => row.kind === 'match').length).toBe(70);
    expect(rows.filter((row) => row.kind === 'gap').length).toBe(22);
    expect(APPS.flatMap((app) => ROWS[app].flatMap((row) => cellsOf(app, row))).length).toBe(423);
  });

  test('every match and gap row has a One side over a fixture the harness makes', () => {
    const day = new Date(2026, 10, 18, 9, 41);
    for (const app of APPS)
      for (const row of ROWS[app].filter((each) => each.kind !== 'exact-only')) {
        expect([row.id, row.one === undefined]).toEqual([row.id, false]);
        expect([row.id, storeOf(app, row.fixture ?? '', day) === undefined]).toEqual([
          row.id,
          false,
        ]);
      }
  });

  test('an Exact-only row has no One side and no cell', () => {
    for (const app of APPS)
      for (const row of ROWS[app].filter((each) => each.kind === 'exact-only')) {
        expect(row.one).toBeUndefined();
        expect(cellsOf(app, row)).toEqual([]);
      }
  });
});
