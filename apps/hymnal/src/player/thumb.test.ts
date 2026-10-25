/**
 * The bar's key model over its whole domain: chords on or off, every move
 * (transpose -5 to 6, capo 0 to 11) and the dials closed or open, 576
 * states, against every event: a tap, a hold, a tap on the page, the key
 * dial turned to each of the twelve sounding keys, the capo dial turned to
 * each fret and one past each end, reset, and the end of a reset's wait. Three printed keys: hymn
 * 100's D-flat, a sharp key, and a minor one.
 */

import * as Chord from '@manna/hymnal/chord';
import { describe, expect, it } from 'bun:test';

import { plain } from '~/feel/cue';
import { type Move, soundingKey, still } from '~/hymns/chords';

import {
  capoStops,
  faceOf,
  isStill,
  keyStops,
  shownOf,
  step,
  type Thumb,
  ThumbEvent,
} from './thumb';

const printedKeys: ReadonlyArray<Chord.Key> = [
  { tonic: 'Db', minor: false },
  { tonic: 'A', minor: false },
  { tonic: 'E', minor: true },
];

const moves: ReadonlyArray<Move> = Array.from({ length: 12 }, (_, t) =>
  Array.from({ length: 12 }, (__, capo) => ({ transpose: t - 5, capo })),
).flat();

const states: ReadonlyArray<Thumb> = [false, true].flatMap((chords) =>
  moves.flatMap((move) => [false, true].map((open) => ({ chords, move, open }))),
);

const events: ReadonlyArray<ThumbEvent> = [
  ThumbEvent.Tap(),
  ThumbEvent.Hold(),
  ThumbEvent.TapPage(),
  ...Array.from({ length: 12 }, (_, pitch) => ThumbEvent.TurnKey({ pitch })),
  ...Array.from({ length: 14 }, (_, k) => ThumbEvent.TurnCapo({ capo: k - 1 })),
  ThumbEvent.Reset(),
  ThumbEvent.ResetShown(),
];

const each = (check: (printed: Chord.Key, state: Thumb, event: ThumbEvent) => void) => {
  for (const printed of printedKeys)
    for (const state of states) for (const event of events) check(printed, state, event);
};

describe('the key model', () => {
  it('walks 576 states against 31 events', () => {
    expect(states).toHaveLength(576);
    expect(events).toHaveLength(31);
  });

  it('resets to the printed key and no capo, the dials and chords as they were, with one cue', () =>
    each((printed, state, event) => {
      if (event._tag !== 'Reset') return;
      const next = step(printed, state, event);
      expect(next.state).toEqual({ chords: state.chords, move: still, open: state.open });
      expect(next.cues).toEqual([plain('reset')]);
    }));

  it('closes the dials once a reset’s turn home has been seen, the move and chords as they were, with no cue', () =>
    each((printed, state, event) => {
      if (event._tag !== 'ResetShown') return;
      const next = step(printed, state, event);
      expect(next.state).toEqual({ ...state, open: false });
      expect(next.cues).toEqual([]);
    }));

  it('turns the key to the key turned to, keeps the capo, and turns chords on', () =>
    each((printed, state, event) => {
      if (event._tag !== 'TurnKey') return;
      const next = step(printed, state, event);
      expect(Chord.pitchClass(soundingKey(printed, next.state.move).tonic)).toBe(event.pitch);
      expect(next.state.move.capo).toBe(state.move.capo);
      expect(next.state.move.transpose).toBeGreaterThanOrEqual(-5);
      expect(next.state.move.transpose).toBeLessThanOrEqual(6);
      expect(next.state.chords).toBe(true);
      expect(next.state.open).toBe(state.open);
      expect(next.cues).toEqual((state.chords && []) || [plain('chords-on')]);
    }));

  it('flips chords on a hold, and leaves the move and the dials', () =>
    each((printed, state, event) => {
      if (event._tag !== 'Hold') return;
      const next = step(printed, state, event);
      expect(next.state).toEqual({ ...state, chords: !state.chords });
      expect(next.cues).toEqual([plain((state.chords && 'chords-off') || 'chords-on')]);
    }));

  it('opens closed dials on a tap and closes open ones, with a press; a tap on the page closes them', () =>
    each((printed, state, event) => {
      if (event._tag === 'Tap')
        expect(step(printed, state, event)).toEqual({
          state: { ...state, open: !state.open },
          cues: [plain('press')],
        });
      if (event._tag === 'TapPage')
        expect(step(printed, state, event)).toEqual({
          state: { ...state, open: false },
          cues: [],
        });
    }));

  it('sets the capo held to 0 to 11, leaves the transpose, and cues a wall once past an end', () =>
    each((printed, state, event) => {
      if (event._tag !== 'TurnCapo') return;
      const next = step(printed, state, event);
      const held = Math.min(Math.max(event.capo, 0), 11);
      expect(next.state).toEqual({ ...state, move: { ...state.move, capo: held } });
      expect(next.cues).toEqual((held !== event.capo && [plain('wall')]) || []);
    }));

  it('shows the capo and key dials with chords on, reset while moved, and the key alone with chords off', () =>
    each((printed, state, event) => {
      const next = step(printed, state, event).state;
      const shown = shownOf(next);
      if (!next.chords) expect(shown).toEqual(['key']);
      else if (isStill(next.move)) expect(shown).toEqual(['capo', 'key']);
      else expect(shown).toEqual(['reset', 'capo', 'key']);
    }));

  it('gives nothing but a state and cues: no step carries a command for the player', () =>
    each((printed, state, event) => {
      expect(Object.keys(step(printed, state, event)).toSorted()).toEqual(['cues', 'state']);
    }));
});

describe('the key button and the dials’ detents', () => {
  const db: Chord.Key = { tonic: 'Db', minor: false };

  it('shows the key with no capo, the capo over the shapes with one, and nothing with chords off', () => {
    expect(faceOf(db, { chords: true, move: still, open: false })).toEqual({
      _tag: 'Key',
      over: 'KEY',
      key: 'Db',
    });
    expect(faceOf(db, { chords: true, move: { transpose: 0, capo: 1 }, open: false })).toEqual({
      _tag: 'Key',
      over: 'CAPO 1',
      key: 'C',
    });
    expect(faceOf(db, { chords: false, move: still, open: false })).toEqual({ _tag: 'Off' });
  });

  it('marks the printed key among twelve, and the open shapes among the capo’s frets', () => {
    const keys = keyStops(db);
    expect(keys.map((stop) => stop.pitch)).toEqual(Array.from({ length: 12 }, (_, k) => k));
    expect(keys.filter((stop) => stop.printed).map((stop) => stop.name)).toEqual(['Db']);
    const frets = capoStops(db, still);
    expect(frets.map((stop) => stop.played).slice(0, 3)).toEqual(['Db', 'C', 'B']);
    expect(frets.filter((stop) => stop.open).map((stop) => stop.capo)).toEqual([1, 4, 6, 9, 11]);
  });
});
