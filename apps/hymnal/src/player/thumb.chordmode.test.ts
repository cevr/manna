/**
 * Acceptance (chordmode A1): the bar's key button is the chords switch while
 * chords are off, and no step leaves the dials open with chords off.
 *
 * The rule, over `step`'s whole domain as written: every key a signature
 * names (15 major, 15 minor; every printed key the chord book uses is one of
 * them), chords on and off, every move (transpose -5 to 6, capo 0 to 11),
 * the dials open and closed, against every event (a tap, a hold, a tap on
 * the page, the key dial turned to each of the twelve pitches, the capo dial
 * turned to each fret and one past each end, reset, the end of a reset's
 * wait, a tap on the Tuner, the wheel's key step a semitone either way):
 *
 * - a1 A tap with chords off turns chords on and opens nothing, the move as
 *   it was, with one `chords-on` cue.
 * - a2 A tap with chords on opens closed dials and closes open ones, with a
 *   press; chords and the move as they were.
 * - a3 A hold with chords on turns chords off and closes the dials, with a
 *   `chords-off` cue; with chords off it turns chords on, the dials as they
 *   were, with a `chords-on` cue. The move stays.
 * - a4 From every state whose dials are open only with chords on, every
 *   event's next state keeps them so.
 * - a5 Only a key turn, a capo turn and a reset change the move: the switch
 *   never writes a hymn's key.
 *
 * The domain is walked once (`walk`) and each rule keeps its count of steps
 * checked and its first misses, so a case names the step it fails on.
 */

import * as Chord from '@manna/hymnal/chord';
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { type Cue, plain } from '~/feel/cue';
import type { Move } from '~/hymns/chords';

import { type Step, step, type Thumb, ThumbEvent } from './thumb';

/** Every key a signature names, seven flats to seven sharps, major and minor. */
const printedKeys: ReadonlyArray<Chord.Key> = [false, true].flatMap((minor) =>
  Array.from({ length: 15 }, (_, k) => Chord.keyFromSignature(k - 7, minor)),
);

const moves: ReadonlyArray<Move> = Array.from({ length: 12 }, (_, t) =>
  Array.from({ length: 12 }, (__, capo) => ({ transpose: t - 5, capo })),
).flat();

const states: ReadonlyArray<Thumb> = [false, true].flatMap((chords) =>
  moves.flatMap((move) => [false, true].map((open) => ({ chords, move, open }))),
);

/** Every event, by tag: a tag added to `ThumbEvent` and missing here fails the typecheck. */
const eventsByTag = {
  Tap: [ThumbEvent.Tap()],
  Hold: [ThumbEvent.Hold()],
  TapPage: [ThumbEvent.TapPage()],
  TurnKey: Array.from({ length: 12 }, (_, pitch) => ThumbEvent.TurnKey({ pitch })),
  TurnCapo: Array.from({ length: 14 }, (_, k) => ThumbEvent.TurnCapo({ capo: k - 1 })),
  Reset: [ThumbEvent.Reset()],
  ResetShown: [ThumbEvent.ResetShown()],
  Tune: [ThumbEvent.Tune()],
  StepKey: [ThumbEvent.StepKey({ by: -1 }), ThumbEvent.StepKey({ by: 1 })],
} satisfies { readonly [Tag in ThumbEvent['_tag']]: ReadonlyArray<ThumbEvent> };
const events: ReadonlyArray<ThumbEvent> = Object.values(eventsByTag).flat();

/** The tags whose step may change the move. */
const moving: ReadonlySet<string> = new Set(['TurnKey', 'StepKey', 'TurnCapo', 'Reset']);

type Rule = 'a1' | 'a2' | 'a3' | 'a4' | 'a5';

interface Miss {
  readonly printed: Chord.Key;
  readonly state: Thumb;
  readonly event: ThumbEvent;
  readonly got: Step;
}

interface Tally {
  checked: number;
  missed: number;
  readonly first: Array<Miss>;
}

const sameMove = (a: Move, b: Move): boolean => a.transpose === b.transpose && a.capo === b.capo;

/** The cues as words: each one's name and its count of fields (a plain cue carries its name alone). */
const cuesSaid = (cues: ReadonlyArray<Cue>): string =>
  cues.map((cue) => `${cue._tag}/${Object.keys(cue).length}`).join(' ');

const sameStep = (got: Step, want: Wanted): boolean =>
  got.state.chords === want.state.chords &&
  got.state.open === want.state.open &&
  sameMove(got.state.move, want.state.move) &&
  cuesSaid(got.cues) === cuesSaid(want.cues);

interface Wanted {
  readonly rule: Rule;
  readonly state: Thumb;
  readonly cues: ReadonlyArray<Cue>;
}

/** What a1 to a3 ask of a tap or a hold from `state`; nothing for any other event. */
const wanted = (state: Thumb, event: ThumbEvent): Option.Option<Wanted> => {
  if (event._tag === 'Tap' && !state.chords)
    return Option.some({
      rule: 'a1',
      state: { ...state, chords: true, open: false },
      cues: [plain('chords-on')],
    });
  if (event._tag === 'Tap')
    return Option.some({
      rule: 'a2',
      state: { ...state, open: !state.open },
      cues: [plain('press')],
    });
  if (event._tag === 'Hold' && state.chords)
    return Option.some({
      rule: 'a3',
      state: { ...state, chords: false, open: false },
      cues: [plain('chords-off')],
    });
  if (event._tag === 'Hold')
    return Option.some({
      rule: 'a3',
      state: { ...state, chords: true },
      cues: [plain('chords-on')],
    });
  return Option.none();
};

/** Walks the whole domain once, every rule over every step. */
const walk = (): Record<Rule, Tally> => {
  const tallies: Record<Rule, Tally> = {
    a1: { checked: 0, missed: 0, first: [] },
    a2: { checked: 0, missed: 0, first: [] },
    a3: { checked: 0, missed: 0, first: [] },
    a4: { checked: 0, missed: 0, first: [] },
    a5: { checked: 0, missed: 0, first: [] },
  };
  const tally = (
    rule: Rule,
    ok: boolean,
    printed: Chord.Key,
    state: Thumb,
    event: ThumbEvent,
    got: Step,
  ) => {
    const at = tallies[rule];
    at.checked += 1;
    if (ok) return;
    at.missed += 1;
    if (at.first.length < 3) at.first.push({ printed, state, event, got });
  };
  for (const printed of printedKeys)
    for (const state of states)
      for (const event of events) {
        const got = step(printed, state, event);
        const want = wanted(state, event);
        if (Option.isSome(want))
          tally(want.value.rule, sameStep(got, want.value), printed, state, event, got);
        if (!state.open || state.chords)
          tally('a4', !got.state.open || got.state.chords, printed, state, event, got);
        if (!moving.has(event._tag))
          tally('a5', sameMove(got.state.move, state.move), printed, state, event, got);
      }
  return tallies;
};

const tallies = walk();

/** The rule's misses, with the count of steps it checked. */
const verdict = (rule: Rule) => {
  const { checked, missed, first } = tallies[rule];
  return { checked, missed, first };
};

const keys = 30;
/** States with chords off (or on): 144 moves, the dials open or closed. */
const half = 288;

describe('the key button as the chords switch (chordmode A1)', () => {
  it('walks 30 printed keys, 576 states and 34 events', () => {
    expect(new Set(printedKeys.map((key) => `${key.tonic}:${key.minor}`)).size).toBe(keys);
    expect(states).toHaveLength(2 * half);
    expect(events).toHaveLength(34);
  });

  it('a1: a tap with chords off turns chords on and opens nothing, the move kept, with one chords-on cue', () => {
    expect(verdict('a1')).toEqual({ checked: keys * half, missed: 0, first: [] });
  });

  it('a2: a tap with chords on opens closed dials and closes open ones, with a press, chords and the move kept', () => {
    expect(verdict('a2')).toEqual({ checked: keys * half, missed: 0, first: [] });
  });

  it('a3: a hold turns chords off and closes the dials, or turns chords on with the dials as they were, the move kept', () => {
    expect(verdict('a3')).toEqual({ checked: keys * 2 * half, missed: 0, first: [] });
  });

  it('a4: no event leaves the dials open with chords off, from any state whose dials are open only with chords on', () => {
    expect(verdict('a4')).toEqual({
      checked: keys * (2 * half - 144) * events.length,
      missed: 0,
      first: [],
    });
  });

  it('a5: only a key turn or step, a capo turn and a reset change the move', () => {
    expect(verdict('a5')).toEqual({
      checked: keys * 2 * half * (events.length - 12 - 2 - 14 - 1),
      missed: 0,
      first: [],
    });
  });
});
