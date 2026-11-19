/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish -- the fixtures are made at a fixed local instant, a host `Date` as `storeOf` takes; a seed's case is narrowed in place and a row's fixture is given or not. */

import { describe, expect, it } from 'bun:test';

import { ROWS } from '../screens/index.ts';
import { storeOf } from './fixtures.ts';
import { cellsOf, type Row } from './model.ts';
import { PORT_STORES } from './port-store.ts';
import { readBackRefusal, seedPlan, storageFlags, webSeedOf } from './seed.ts';

const NOW = new Date(2026, 10, 18, 13, 30);

const bare = (id: string): Row => ({ id, unit: 'pm-test', kind: 'match' });

const row = (id: string, fixture: string): Row => ({ ...bare(id), fixture });

describe("the store a row's port shot starts from", () => {
  it('writes exactly the row’s fixture, made at the instant given, into the row’s own store, and keeps it', () => {
    const plan = seedPlan('heartseed', row('home.lists', 'hs-lists'), NOW);
    expect(plan).toEqual({
      _tag: 'Seed',
      storage: 'pm-home.lists',
      port: PORT_STORES.heartseed ?? { _tag: 'File', bundle: '', file: '' },
      store: storeOf('heartseed', 'hs-lists', NOW) ?? { _tag: 'Broken' },
    });
    expect(storageFlags(plan)).toEqual(['--storage', 'pm-home.lists', '--keep-storage']);
  });

  it('gives each row its own store', () => {
    const first = seedPlan('heartseed', row('home.lists', 'hs-lists'), NOW);
    const second = seedPlan('heartseed', row('home.foot', 'hs-lists'), NOW);
    expect(first.storage).not.toBe(second.storage);
    expect(seedPlan('heartseed', bare('home.fresh'), NOW).storage).toBe('pm-home.fresh');
  });

  it('empties the store of a row with no fixture', () => {
    const empty = seedPlan('heartseed', bare('home.fresh'), NOW);
    expect(empty).toEqual({ _tag: 'Reset', storage: 'pm-home.fresh' });
    expect(storageFlags(empty)).toEqual(['--storage', 'pm-home.fresh', '--reset-storage']);
    expect(seedPlan('hymnal', bare('about.page'), NOW)._tag).toBe('Reset');
  });

  it('seeds the hymnal port as Heartseed’s, into its persisted states', () => {
    const plan = seedPlan('hymnal', row('recent.page', 'hy-used'), NOW);
    expect(plan._tag).toBe('Seed');
    expect(storageFlags(plan)).toEqual(['--storage', 'pm-recent.page', '--keep-storage']);
  });

  it('seeds a hymnal web cell with the same fixture as its iOS shot, Sounds and haptics off with it, and keeps the store', () => {
    const seed = webSeedOf('hymnal', row('recent.page', 'hy-used'), NOW);
    expect(seed).toEqual({
      _tag: 'Seed',
      storage: 'pm-recent.page',
      bundle: 'im.cvr.hymnal.exact',
      states: [
        ['settingsFeelKept', '"off"'],
        ['favouriteList', '[1,100,529]'],
        ['recentList', '[12,100,1]'],
      ],
    });
    expect(storageFlags(seed._tag === 'Seed' ? seed : { _tag: 'Reset', storage: '' })).toEqual([
      '--storage',
      'pm-recent.page',
      '--keep-storage',
    ]);
  });

  it('runs a web cell with no fixture on an emptied store', () => {
    const seed = webSeedOf('hymnal', bare('about.page'), NOW);
    expect(seed).toEqual({ _tag: 'Reset', storage: 'pm-about.page' });
    expect(storageFlags(seed._tag === 'Reset' ? seed : { _tag: 'Seed', storage: '' })).toEqual([
      '--storage',
      'pm-about.page',
      '--reset-storage',
    ]);
  });

  it('refuses a web cell whose fixture the port keeps in a file, naming the row, never shooting it on an empty store', () => {
    const seed = webSeedOf('heartseed', row('home.lists', 'hs-lists'), NOW);
    expect(seed._tag).toBe('Refused');
    expect(seed._tag === 'Refused' ? seed.reason : '').toStartWith(
      'home.lists: its fixture hs-lists cannot be seeded on the web yet',
    );
  });

  it('gives every hymnal web cell with a fixture a seeded, kept store', () => {
    const web = ROWS.hymnal.filter(
      (each) => each.fixture !== undefined && cellsOf('hymnal', each).some((c) => c.host === 'web'),
    );
    expect(web.length).toBeGreaterThan(0);
    for (const each of web) {
      const seed = webSeedOf('hymnal', each, NOW);
      expect([each.id, seed._tag]).toEqual([each.id, 'Seed']);
      if (seed._tag === 'Seed') expect(seed.states).toContainEqual(['settingsFeelKept', '"off"']);
    }
  });

  it('reads the seeded states back from the drive’s replies after `prefer` and the first settle, or says which were not read', () => {
    const states = [
      ['settingsFeelKept', '"off"'],
      ['recentList', '[12,100,1]'],
    ] as const;
    const out = (...replies: ReadonlyArray<string>) =>
      ['{"ok":true}', '{"clock":0,"settled":true}', ...replies, '{"compare":"x"}'].join('\n');
    expect(readBackRefusal(out('"off"', '[12, 100, 1]'), states)).toBeUndefined();
    expect(readBackRefusal(out('"on"', '[]'), states)).toBe(
      'the web store was not read: settingsFeelKept read "on", seeded "off"; recentList read [], seeded [12,100,1]',
    );
    expect(readBackRefusal(out(), [])).toBeUndefined();
  });

  it('refuses a row naming a fixture that does not exist', () => {
    expect(() => seedPlan('heartseed', row('home.ghost', 'hs-no-such'), NOW)).toThrow(
      'home.ghost: no fixture hs-no-such',
    );
  });
});
