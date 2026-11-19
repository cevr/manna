/* oxlint-disable effect/noGlobals -- the fixtures are made at a fixed local instant, a host `Date` as `storeOf` takes. */

import { describe, expect, it } from 'bun:test';

import { storeOf } from './fixtures.ts';
import type { Row } from './model.ts';
import { PORT_STORES } from './port-store.ts';
import { seedPlan, storageFlags } from './seed.ts';

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

  it('refuses a row naming a fixture that does not exist', () => {
    expect(() => seedPlan('heartseed', row('home.ghost', 'hs-no-such'), NOW)).toThrow(
      'home.ghost: no fixture hs-no-such',
    );
  });
});
