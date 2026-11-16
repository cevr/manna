/**
 * Sounds and haptics reads its kept word as the hymnal's row does (owner,
 * q116): a fresh store and any text but its two words leave the ticks on,
 * `off` alone turns them off, and the settings' source answers that read.
 * The kept texts are each word, its near misses and seeded arbitrary text.
 */

import { describe, expect, it } from 'bun:test';

import { seeded } from '../test/random';
import { settingsSources } from './choices';
import { feelAnswer, feelOf, feels } from './feel';

const RUNS = 400;

const NEAR = ['', 'On', 'OFF', ' on', 'off ', '"on"', '"off"', 'true', 'false', '0', 'null', 'no'];

/** Every kept text the test tries: each word, its near misses, and seeded arbitrary text. */
const keptTexts = () => {
  const random = seeded(116);
  const arbitrary = Array.from({ length: RUNS }, () =>
    Array.from({ length: random.below(6) }, () => random.pick([...'efnor "\'01'])).join(''),
  );
  return [...feels, ...NEAR, ...arbitrary];
};

describe('Sounds and haptics', () => {
  it('is on in a fresh store', () => {
    expect(feelAnswer('')).toEqual({ on: true });
    expect(settingsSources.settingsFeelOf([''])).toEqual({ on: true });
  });

  it('is off for the word off alone, and on for any other kept text', () => {
    for (const kept of keptTexts()) {
      const on = kept !== 'off';
      expect({ kept, on: feelAnswer(kept).on }).toEqual({ kept, on });
      expect({ kept, on: settingsSources.settingsFeelOf([kept]).on }).toEqual({ kept, on });
      expect(feelOf(kept) === 'on').toBe(on);
      expect(feels).toContain(feelOf(kept));
    }
  });
});
