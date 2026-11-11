/**
 * The bar's key model over its whole domain: chords on or off, every move
 * (transpose -5 to 6, capo 0 to 11) and the dials closed or open, 576
 * states, against every event: a tap, a hold, a tap on the page, the key
 * dial turned to each of the twelve sounding keys, the capo dial turned to
 * each fret and one past each end, reset, the end of a reset’s wait, and the
 * key button’s Tuner; the key turned a semitone either way. Three printed
 * keys: hymn 100’s D-flat, a sharp key, and a minor one.
 */

import * as Chord from '@manna/hymnal/chord';
import { describe, expect, it } from 'bun:test';
import { Match, Option } from 'effect';

import { plain } from '~/feel/cue';
import { type Move, soundingKey, still } from '~/hymns/chords';

import {
  capoStops,
  chipsOf,
  faceOf,
  hintOf,
  isStill,
  keyStops,
  type Shown,
  shownOf,
  step,
  type Thumb,
  ThumbEvent,
  turnBy,
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
  ThumbEvent.Tune(),
];

const each = (check: (printed: Chord.Key, state: Thumb, event: ThumbEvent) => void) => {
  for (const printed of printedKeys)
    for (const state of states) for (const event of events) check(printed, state, event);
};

describe('the key model', () => {
  it('walks 576 states against 32 events', () => {
    expect(states).toHaveLength(576);
    expect(events).toHaveLength(32);
  });

  it('resets a moved hymn to the printed key and no capo, the dials and chords as they were, with one cue', () =>
    each((printed, state, event) => {
      if (event._tag !== 'Reset' || isStill(state.move)) return;
      const next = step(printed, state, event);
      expect(next.state).toEqual({ chords: state.chords, move: still, open: state.open });
      expect(next.cues).toEqual([plain('reset')]);
    }));

  it('closes the dials at once on a reset of a hymn already at home, with no cue (barfix m7)', () =>
    each((printed, state, event) => {
      if (event._tag !== 'Reset' || !isStill(state.move)) return;
      expect(step(printed, state, event)).toEqual({ state: { ...state, open: false }, cues: [] });
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

  it('flips chords on a hold and leaves the move; a hold to off closes the dials, a hold to on leaves them', () =>
    each((printed, state, event) => {
      if (event._tag !== 'Hold') return;
      const next = step(printed, state, event);
      expect(next.state).toEqual({
        ...state,
        chords: !state.chords,
        open: !state.chords && state.open,
      });
      expect(next.cues).toEqual([plain((state.chords && 'chords-off') || 'chords-on')]);
    }));

  it('with chords on, opens closed dials on a tap and closes open ones, with a press; with chords off, a tap turns chords on and opens nothing; a tap on the page closes them', () =>
    each((printed, state, event) => {
      if (event._tag === 'Tap' && state.chords)
        expect(step(printed, state, event)).toEqual({
          state: { ...state, open: !state.open },
          cues: [plain('press')],
        });
      if (event._tag === 'Tap' && !state.chords)
        expect(step(printed, state, event)).toEqual({
          state: { ...state, chords: true, open: false },
          cues: [plain('chords-on')],
        });
      if (event._tag === 'TapPage')
        expect(step(printed, state, event)).toEqual({
          state: { ...state, open: false },
          cues: [],
        });
    }));

  it('hints what a tap does: turns chords on, opens the dials, or closes them; on a hymn with no chords, with chords on, nothing', () =>
    each((printed, state, event) => {
      if (event._tag !== 'Tap') return;
      const next = step(printed, state, event).state;
      const done = Match.value({ on: !state.chords && next.chords, open: next.open }).pipe(
        Match.when({ on: true }, () => 'Turns chords on'),
        Match.when({ open: true }, () => 'Opens the key and capo dials'),
        Match.orElse(() => 'Closes the key and capo dials'),
      );
      expect({
        printed: hintOf(Option.some(printed), state),
        none: hintOf(Option.none(), state),
      }).toEqual({
        printed: Option.some(done),
        none: (state.chords && Option.none()) || Option.some('Turns chords on'),
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

  it('closes the dials as the key button’s Tuner opens, the move and chords as they were, with no cue', () =>
    each((printed, state, event) => {
      if (event._tag !== 'Tune') return;
      expect(step(printed, state, event)).toEqual({ state: { ...state, open: false }, cues: [] });
    }));

  it('holds no Tuner chip: Reset alone while moved with chords on; shows the chips while they hold one, the capo with chords on, and the key last', () =>
    each((printed, state, event) => {
      const next = step(printed, state, event).state;
      const reset = next.chords && !isStill(next.move);
      const dials: ReadonlyArray<Shown> = (next.chords && (['capo', 'key'] as const)) || ['key'];
      expect({ chips: chipsOf(next), shown: shownOf(next) }).toEqual({
        chips: (reset && ['reset']) || [],
        shown: [...((reset && (['chips'] as const)) || []), ...dials],
      });
    }));

  it('turns the key a semitone either way from the key it sounds in, wrapping', () =>
    each((printed, state, event) => {
      if (event._tag !== 'Tap') return;
      const sounding = Chord.pitchClass(soundingKey(printed, state.move).tonic);
      expect([turnBy(printed, state.move, -1), turnBy(printed, state.move, 1)]).toEqual([
        ThumbEvent.TurnKey({ pitch: (sounding + 11) % 12 }),
        ThumbEvent.TurnKey({ pitch: (sounding + 1) % 12 }),
      ]);
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
