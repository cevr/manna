import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';

import { isKnownUnavailable, KNOWN_UNAVAILABLE, unavailableReason } from './unavailable.js';

describe('KNOWN_UNAVAILABLE', () => {
  const test = it.effect;

  test('holds exactly the eighteen measured publications', () =>
    Effect.sync(() => {
      expect(KNOWN_UNAVAILABLE).toHaveLength(18);
    }));

  test('keys every entry by a distinct book id', () =>
    Effect.sync(() => {
      const ids = KNOWN_UNAVAILABLE.map((entry) => entry.bookId);
      expect(new Set(ids).size).toBe(ids.length);
    }));

  test('identifies by numeric id, not by code', () =>
    Effect.sync(() => {
      expect(isKnownUnavailable(12515)).toBe(true);
      expect(unavailableReason(12515)).toEqual(Option.some('subscription'));
    }));

  test('does not claim an available book is unavailable', () =>
    Effect.sync(() => {
      expect(isKnownUnavailable(130)).toBe(false);
      expect(unavailableReason(130)).toEqual(Option.none());
    }));

  test('separates subscription gating from third-party licensing', () =>
    Effect.sync(() => {
      expect(unavailableReason(14340)).toEqual(Option.some('third-party-licence'));
      expect(unavailableReason(12668)).toEqual(Option.some('subscription'));

      const licensed = KNOWN_UNAVAILABLE.filter((entry) => entry.reason === 'third-party-licence');
      expect(licensed.map((entry) => entry.code).sort()).toEqual([
        'ICB',
        'NCV',
        'NET',
        'NIV',
        'NKJV',
      ]);
    }));
});
