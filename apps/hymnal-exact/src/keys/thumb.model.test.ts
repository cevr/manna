/* oxlint-disable effect/noTernary, effect/noNullish -- a Bun test drawing generated histories with the app's seeded generator; the port's rule names a hymn with no printed key `undefined`, as the data module reads no effect. */

/**
 * The key button's rule, model-based: generated histories of the current
 * app's events (taps, holds, page taps, key and capo turns past either end,
 * key steps, resets and the reset's close), for every key a hymn of the
 * hymnal is printed in, run side by side on the port's `step`
 * (`src/keys/thumb.ts`) and on the current app's own `step`
 * (`apps/hymnal/src/player/thumb.ts`). After every event the two agree on
 * the chords, the move and the dials open, the cue, the face, the said
 * value and hint, the chips and rows shown, every stop of both dials and
 * what VoiceOver reads for each. The Tuner is left out: the port has no ear.
 *
 * A hymn with no printed key takes only a hold, a page tap and a tap with
 * chords off, stepped from C major (the current `Dials.tsx` `keyless`); its
 * other events change nothing.
 */

import { describe, expect, test } from 'bun:test';

import type { Key } from '@manna/hymnal/chord';
import { hasChords, keyName } from '@manna/hymnal-app/hymns/chords';
import { simple } from '@manna/hymnal-app/hymns/simple';
import * as one from '@manna/hymnal-app/player/thumb';
import { Option } from 'effect';

import { currentBook } from '../chords/shipped.testing.ts';
import { book } from '../hymns/book.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';
import {
  capoSaid,
  capoStops,
  faceOf,
  hintOf,
  keyIndexOf,
  keySaid,
  keyStops,
  pitchOf,
  resetShown,
  rowsOf,
  saidOf,
  step,
  stepOn,
  type Thumb,
  type ThumbEvent,
} from './thumb.ts';

/** Every key a hymn of the hymnal is printed in, as the dials read it: its chords' key in the Simple style. */
const printedKeys = (() => {
  const keys = new Map<string, Key>();
  for (const hymn of book.hymns) {
    const chords = currentBook.of(hymn.number);
    if (chords._tag !== 'Some' || !hasChords(chords.value)) continue;
    const key = simple(chords.value).key;
    keys.set(keyName(key), key);
  }
  return [...keys.values()];
})();

/** A generated event, in both apps' terms. */
const eventOf = (random: Random): readonly [ThumbEvent, one.ThumbEvent] => {
  const roll = below(random, 9);
  if (roll === 0) return [{ kind: 'tap' }, one.ThumbEvent.Tap()];
  if (roll === 1) return [{ kind: 'hold' }, one.ThumbEvent.Hold()];
  if (roll === 2) return [{ kind: 'page' }, one.ThumbEvent.TapPage()];
  if (roll === 3) {
    const pitch = below(random, 12);
    return [{ kind: 'key', pitch }, one.ThumbEvent.TurnKey({ pitch })];
  }
  if (roll === 4) {
    const by = pick(random, [-1, 1]);
    return [{ kind: 'step', by }, one.ThumbEvent.StepKey({ by })];
  }
  if (roll === 5) {
    const capo = below(random, 14) - 1;
    return [{ kind: 'capo', capo }, one.ThumbEvent.TurnCapo({ capo })];
  }
  if (roll === 6) return [{ kind: 'reset' }, one.ThumbEvent.Reset()];
  if (roll === 7) return [{ kind: 'shown' }, one.ThumbEvent.ResetShown()];
  return [{ kind: 'tap' }, one.ThumbEvent.Tap()];
};

/** The current app's face, in the port's terms. */
const oneFace = (face: one.Face) =>
  face._tag === 'Off'
    ? { on: false, over: '', key: '' }
    : { on: true, over: face.over, key: face.key };

/** A cue as a list of its tags: none for the port's empty one. */
const cuedOf = (cue: string): ReadonlyArray<string> => (cue === '' ? [] : [cue]);

const tagsOf = (cues: ReadonlyArray<{ readonly _tag: string }>): ReadonlyArray<string> =>
  cues.map((cue) => cue._tag);

const optional = (value: Option.Option<string>) => Option.getOrElse(value, () => '');

describe('the key button’s rule, against the current app’s', () => {
  test('the hymnal prints its hymns in more than one key', () => {
    expect(printedKeys.length).toBeGreaterThan(8);
  });

  test('every spelling’s pitch class is the one the current app transposes from', () => {
    for (const key of printedKeys)
      expect(pitchOf(key.tonic)).toBe(((-one.transposeTo(key, 0) % 12) + 12) % 12);
    for (const stop of printedKeys.flatMap((key) => one.keyStops(key)))
      expect(pitchOf(stop.name.replace('m', ''))).toBe(stop.pitch);
  });

  test('generated histories over every printed key give the current app’s state, cues and drawing', () => {
    const random = seeded(23);
    for (const printed of printedKeys) {
      for (let run = 0; run < 12; run++) {
        let port: Thumb = { chords: random() < 0.5, move: { transpose: 0, capo: 0 }, open: false };
        let theirs: one.Thumb = port;
        for (let k = 0; k < 40; k++) {
          const [ours, them] = eventOf(random);
          const next = step(printed, port, ours);
          const want = one.step(printed, theirs, them);
          expect(next.state).toEqual(want.state);
          expect(cuedOf(next.cue)).toEqual(tagsOf(want.cues));
          port = next.state;
          theirs = want.state;
          expect(faceOf(printed, port)).toEqual(oneFace(one.faceOf(printed, theirs)));
          expect(saidOf(printed, port)).toBe(one.saidOf(printed, theirs));
          expect(hintOf(printed, port)).toBe(optional(one.hintOf(Option.some(printed), theirs)));
          expect(resetShown(port)).toBe(one.chipsOf(theirs).includes('reset'));
          expect(rowsOf(port)).toEqual(one.shownOf(theirs));
          expect(keyIndexOf(printed, port.move)).toBe(
            one
              .keyStops(printed)
              .findIndex((stop) => one.transposeTo(printed, stop.pitch) === theirs.move.transpose),
          );
          expect(capoStops(printed, port.move)).toEqual(one.capoStops(printed, theirs.move));
          expect(capoSaid(printed, port.move)).toBe(one.capoSaid(printed, theirs.move));
          expect(keySaid(printed, port.move)).toBe(one.keySaid(printed, theirs.move));
        }
      }
      expect(keyStops(printed)).toEqual(one.keyStops(printed));
    }
  });

  test('a hymn with no printed key takes only the keyless events, from C major', () => {
    const random = seeded(5);
    const c: Key = { tonic: 'C', minor: false };
    let state: Thumb = { chords: false, move: { transpose: 0, capo: 0 }, open: false };
    for (let k = 0; k < 400; k++) {
      const [ours, them] = eventOf(random);
      const next = stepOn(undefined, state, ours);
      const keyless =
        ours.kind === 'hold' || ours.kind === 'page' || (ours.kind === 'tap' && !state.chords);
      if (keyless) {
        const want = one.step(c, state, them);
        expect(next.state).toEqual(want.state);
        expect(cuedOf(next.cue)).toEqual(tagsOf(want.cues));
      } else expect(next).toEqual({ state, cue: '' });
      state = next.state;
      expect(saidOf(undefined, state)).toBe(state.chords ? 'No chords' : 'Chords off');
      expect(hintOf(undefined, state)).toBe(optional(one.hintOf(Option.none(), state)));
    }
  });
});
