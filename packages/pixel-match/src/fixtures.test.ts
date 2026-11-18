/* oxlint-disable effect/noGlobals, effect/noTernary -- the fixtures are functions of the host's local day: the test hands them fixed local dates. */
import { describe, expect, test } from 'bun:test';

import * as Fsrs from '@manna/heartseed/fsrs';

import { heartseedFixtures, hymnalFixtures, NEW_CARD, storeOf } from './fixtures.ts';

/** Captures on several days and hours, so the fixtures hold whatever day they are made on. */
const NOWS = [
  new Date(2026, 10, 18, 9, 41),
  new Date(2026, 10, 18, 20, 41),
  new Date(2027, 2, 14, 12, 0),
  new Date(2027, 0, 1, 6, 0),
];

describe('the fixtures', () => {
  test("the new card is the app's own", () => {
    const own: unknown = Object.entries(Fsrs).find(([name]) => name === 'NEW_CARD')?.[1];
    expect(own).toEqual(NEW_CARD);
  });

  test('every Heartseed fixture lands on the stages and due states it names, on any day', () => {
    for (const now of NOWS)
      for (const name of Object.keys(heartseedFixtures(now))) {
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
    for (const name of Object.keys(heartseedFixtures(morning)))
      expect(storeOf('heartseed', name, morning)).toEqual(storeOf('heartseed', name, evening));
  });

  test('every hymnal fixture keeps Sound and Sounds and haptics off', () => {
    for (const name of Object.keys(hymnalFixtures)) {
      const store = storeOf('hymnal', name, NOWS[0] ?? new Date(0));
      const pairs = new Map(store?._tag === 'Pairs' ? store.pairs : []);
      expect([pairs.get('sound'), pairs.get('feel')]).toEqual(['false', 'false']);
    }
  });
});
