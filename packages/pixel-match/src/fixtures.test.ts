/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish -- the fixtures are functions of the host's local day: the test hands them fixed local dates; a row names its fixture or none. */
import { describe, expect, test } from 'bun:test';

import { ROWS } from '../screens/index.ts';
import { storeOf } from './fixtures.ts';

/** Captures on several days and hours, so the fixtures hold whatever day they are made on. */
const NOWS = [
  new Date(2026, 10, 18, 9, 41),
  new Date(2026, 10, 18, 20, 41),
  new Date(2027, 2, 14, 12, 0),
  new Date(2027, 0, 1, 6, 0),
];

/** The fixtures the rows of `app` name. */
const named = (app: 'heartseed' | 'hymnal') => [
  ...new Set(ROWS[app].flatMap((row) => (row.fixture === undefined ? [] : [row.fixture]))),
];

describe('the fixtures', () => {
  test('every Heartseed fixture a row names lands on the stages and due states it names, on any day', () => {
    for (const now of NOWS)
      for (const name of named('heartseed')) {
        const store = storeOf('heartseed', name, now);
        const pairs = store?._tag === 'Pairs' ? store.pairs.length : -1;
        expect([name, pairs > 0, pairs < 0]).toEqual([
          name,
          !['hs-new', 'hs-unread'].includes(name),
          name === 'hs-unread',
        ]);
      }
  });

  test('a Heartseed fixture is the same pairs on two captures of one day', () => {
    const [morning, evening] = [NOWS[0] ?? new Date(0), NOWS[1] ?? new Date(0)];
    for (const name of named('heartseed'))
      expect(storeOf('heartseed', name, morning)).toEqual(storeOf('heartseed', name, evening));
  });

  test('every hymnal fixture keeps Sound and Sounds and haptics off', () => {
    for (const name of named('hymnal')) {
      const store = storeOf('hymnal', name, NOWS[0] ?? new Date(0));
      const pairs = new Map(store?._tag === 'Pairs' ? store.pairs : []);
      expect([name, pairs.get('sound'), pairs.get('feel')]).toEqual([name, 'false', 'false']);
    }
  });
});
