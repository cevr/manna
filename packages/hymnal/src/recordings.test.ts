import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  creditText,
  KEY_TRANSPOSES,
  keySet,
  RECORDING_SET,
  RECORDING_SETS,
  recordingKey,
  setOf,
} from './recordings.js';

describe('recordings', () => {
  it.effect('keys a hymn by its unpadded number inside the set', () =>
    Effect.sync(() => {
      expect(RECORDING_SET).toBe('warm-1');
      expect(recordingKey(1)).toBe('sdah/1.mp3');
      expect(recordingKey(695)).toBe('sdah/695.mp3');
    }),
  );

  it.effect('credits the piano as CC BY 3.0 asks, and the strings', () =>
    Effect.sync(() => {
      const text = creditText();
      for (const words of [
        'Salamander Grand Piano V3',
        'Alexander Holm',
        'CC BY 3.0',
        'https://creativecommons.org/licenses/by/3.0/',
        'VS Chamber Orchestra 2',
        'Versilian Studios',
        'CC0',
      ])
        expect(text).toContain(words);
      expect(text).toBe(
        "The recordings are played from the hymnal's own scores. " +
          'Piano: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). ' +
          'Strings: VS Chamber Orchestra 2: Community Edition by Versilian Studios, CC0 1.0.',
      );
    }),
  );

  it.effect('names each other key a set of its own, up or down, with no plus sign', () =>
    Effect.sync(() => {
      expect(keySet('warm-1', 2)).toBe('warm-1-up2');
      expect(keySet('warm-1', -3)).toBe('warm-1-down3');
      expect(keySet('warm-2', 6)).toBe('warm-2-up6');
      expect(keySet('warm-1', 0)).toBe('warm-1');
      expect(KEY_TRANSPOSES).toEqual([1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6]);
      expect(
        KEY_TRANSPOSES.map((t) => keySet('warm-1', t)).filter((set) => set.includes('+')),
      ).toEqual([]);
    }),
  );

  it.effect('plays each hymn from the latest set that holds it', () =>
    Effect.sync(() => {
      expect(RECORDING_SETS.map((set) => set.name)).toEqual(['warm-1', 'warm-2']);
      expect(setOf(663)).toBe('warm-2');
      expect([1, 662, 664, 695].map(setOf)).toEqual(['warm-1', 'warm-1', 'warm-1', 'warm-1']);
      const later = RECORDING_SETS.slice(1).flatMap((set) =>
        set.hymns === 'every' ? [] : set.hymns,
      );
      expect(later.filter((hymn, k) => later.indexOf(hymn) !== k)).toEqual([]);
      expect(RECORDING_SETS.filter((set) => set.hymns === 'every').map((set) => set.name)).toEqual([
        RECORDING_SET,
      ]);
    }),
  );
});
