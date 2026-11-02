/**
 * Acceptance (checkbulk S3, chordbulk m5): a melody that leans on the
 * grid's strong beats no more often than on another bar's does not confirm
 * the grid (`confirms`), so a tie never moves a chord by the grid's bars.
 *
 * Seven quarter-note syllables, the line's last the one accent, at beat 6:
 * a strong beat of 4/4 (bar 1, beat 2) and of 3/4 (bar 2, beat 0) alike.
 * Chords C at syllable 0, G at 3, C at 6. Under 4/4's strong-beat rule G
 * moves to syllable 4; under 3/4's it stays on 3. With a tie, 4/4 is either
 * not confirmed, or it places the chords as 3/4 does. Synthetic notes and
 * chords only.
 */

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import type * as Chord from './chord.js';
import * as Placement from './placement.js';

const TPB = 96;
const C: Chord.Chord = { root: 0, quality: '' };
const G: Chord.Chord = { root: 7, quality: '' };

const syllables: ReadonlyArray<Placement.Syllable> = Array.from({ length: 7 }, (_, k) => ({
  start: k * TPB,
  length: TPB,
  key: 60,
}));
const line: Placement.Line = {
  syllables,
  changes: [
    { syllable: 0, at: 0, chord: C },
    { syllable: 3, at: 0, chord: G },
    { syllable: 6, at: 0, chord: C },
  ],
  until: 7 * TPB,
  before: undefined,
};
const grid = (numerator: number, denominator: number): Placement.Grid => ({
  ticksPerBeat: TPB,
  meters: [{ tick: 0, numerator, denominator }],
  tonic: 0,
});
const placed = (g: Placement.Grid) =>
  Placement.apply('strong', line, g).map((change) => [change.syllable, change.at]);

describe('confirms on a tie', () => {
  it.effect('the two grids place the chords apart, so only a confirmation can move them', () =>
    Effect.sync(() => {
      expect(placed(grid(4, 4))).not.toEqual(placed(grid(3, 4)));
    }),
  );

  it.effect('does not confirm 4/4 where the one accent is as strong a beat of 3/4', () =>
    Effect.sync(() => {
      const four = grid(4, 4);
      const confirmed = Placement.confirms(four, [syllables]);
      expect({
        confirmed,
        placed: confirmed ? placed(four) : placed(grid(3, 4)),
      }).toEqual({ confirmed, placed: placed(grid(3, 4)) });
    }),
  );
});
