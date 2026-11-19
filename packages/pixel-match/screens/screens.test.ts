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

  test("Heartseed's Garden rows, both Abouts and the Handbook row are scored over a band, the other sheets and the hymnal's rows whole", () => {
    const garden = /^(home|list|today)\./;
    const about = /^(about\.|add\.handbook$)/;
    for (const app of APPS)
      for (const row of ROWS[app].filter((each) => each.kind !== 'exact-only'))
        expect([row.id, row.one?.band !== undefined]).toEqual([
          row.id,
          (app === 'heartseed' && garden.test(row.id)) || about.test(row.id),
        ]);
  });

  test("the hymnal's About lifts its half-height Settings sheet to full by a real touch before its band is read, and its web cell does not", () => {
    const about = ROWS.hymnal.find((row) => row.id === 'about.page');
    const ops = about?.exact?.ops ?? [];
    const lift = ops.findIndex((op) => /^tap about drag 0 -\d+/u.test(op));
    expect(about?.exact?.touch).toBe('platform');
    expect(lift).toBeGreaterThan(ops.indexOf('tap about-row'));
    expect(about?.exact?.web?.ops?.some((op) => op.includes(' drag '))).toBe(false);
  });

  test("no row's masks hide more than the cap of an iPhone 17's picture: the keyboard is left out by its band, never masked", () => {
    const picture = 402 * 874;
    for (const app of APPS)
      for (const row of ROWS[app]) {
        const masks = [...(row.one?.masks ?? []), ...(row.exact?.masks ?? [])];
        const area = masks.reduce((sum, mask) => sum + mask.width * mask.height, 0);
        expect([row.id, area / picture <= 0.06]).toEqual([row.id, true]);
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
