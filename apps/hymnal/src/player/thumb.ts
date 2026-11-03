/**
 * The bar's key button and its dials, as a model, pure: whether chords show
 * (for every hymn), the page's hymn's move (its transpose and its capo), and
 * whether the dials above the bar are open. With chords off the key button
 * is the chords switch: a tap turns chords on and opens nothing (a chords-on
 * cue). With chords on a tap opens the dials, or closes them (a press cue).
 * A tap on the page closes them. A hold turns chords on or off, and a hold
 * that turns them off closes the dials: no step leaves them open with chords
 * off. The key dial turns the sounding key, and turning it
 * turns chords on, keeping the key turned to. The capo dial sets the fret,
 * held to 0 to 11: a turn past an end stays at the end and cues a wall.
 * Reset is the hymn as printed: its key and no capo. Over the bar the dials
 * stay open while the rows turn home, and close once the reader has seen
 * them go (`ResetShown`, which the bar tells when its wait is over). A reset
 * of a hymn already at home (a double tap on a dial there) closes them at
 * once, with no cue. A tap on the dials' Tuner closes them, with no cue, as
 * the tuner opens over the page.
 *
 * Each step gives the next state and the cues it makes (`~/feel/cue`). A
 * step gives nothing else: no player command has a place in it, so no
 * dial, reset or hold reaches the sound.
 */

import * as Chord from '@manna/hymnal/chord';
import { Data } from 'effect';

import { type Cue, plain } from '~/feel/cue';
import { keyName, type Move, playedKey, soundingKey, still } from '~/hymns/chords';

export interface Thumb {
  /** Whether chords show, for every hymn. */
  readonly chords: boolean;
  /** The page's hymn's move. */
  readonly move: Move;
  /** Whether the dials above the bar are open. */
  readonly open: boolean;
}

export type ThumbEvent = Data.TaggedEnum<{
  /** A tap on the key button. */
  Tap: {};
  /** A hold of the key button, or VoiceOver's action on it. */
  Hold: {};
  /** A tap on the page while the dials are open. */
  TapPage: {};
  /** The key dial turned to the sounding key on `pitch` (a pitch class, 0 = C). */
  TurnKey: { readonly pitch: number };
  /** The capo dial turned to fret `capo`; a turn may ask for one past an end. */
  TurnCapo: { readonly capo: number };
  /** Reset, or a double tap on a dial. */
  Reset: {};
  /** A reset's turn home has been seen: the dials close. */
  ResetShown: {};
  /** A tap on the dials' Tuner: the dials close as the tuner opens. */
  Tune: {};
}>;
export const ThumbEvent = Data.taggedEnum<ThumbEvent>();

export interface Step {
  readonly state: Thumb;
  readonly cues: ReadonlyArray<Cue>;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** The transpose, -5 to 6, that sounds a hymn printed in `printed` in the key on `pitch`. */
export const transposeTo = (printed: Chord.Key, pitch: number): number =>
  mod12(pitch - Chord.pitchClass(printed.tonic) + 5) - 5;

/** Whether `move` is the hymn as printed. */
export const isStill = (move: Move): boolean => move.transpose === 0 && move.capo === 0;

const chordsCue = (on: boolean): Cue => plain((on && 'chords-on') || 'chords-off');

/** The state after `event`, for a hymn printed in `printed`, and the cues it makes. */
export const step = (printed: Chord.Key, state: Thumb, event: ThumbEvent): Step =>
  ThumbEvent.$match(event, {
    // With chords off the key button is the chords switch: a tap turns chords on and opens nothing.
    Tap: () => {
      if (!state.chords)
        return { state: { ...state, chords: true, open: false }, cues: [chordsCue(true)] };
      return { state: { ...state, open: !state.open }, cues: [plain('press')] };
    },
    TapPage: () => ({ state: { ...state, open: false }, cues: [] }),
    // A hold that turns chords off closes the dials, so no dials stand with chords off.
    Hold: () => ({
      state: { ...state, chords: !state.chords, open: state.open && !state.chords },
      cues: [chordsCue(!state.chords)],
    }),
    TurnKey: ({ pitch }) => ({
      state: {
        ...state,
        chords: true,
        move: { ...state.move, transpose: transposeTo(printed, pitch) },
      },
      cues: (state.chords && []) || [plain('chords-on')],
    }),
    TurnCapo: ({ capo }) => {
      const held = Math.min(Math.max(capo, 0), 11);
      return {
        state: { ...state, move: { ...state.move, capo: held } },
        cues: (held !== capo && [plain('wall')]) || [],
      };
    },
    // A reset of a hymn already at home has nothing to turn home: the dials close at once, with no cue.
    Reset: () => {
      if (isStill(state.move)) return { state: { ...state, open: false }, cues: [] };
      return { state: { ...state, move: still }, cues: [plain('reset')] };
    },
    ResetShown: () => ({ state: { ...state, open: false }, cues: [] }),
    // The tuner path is silent: opening it closes the dials and cues nothing.
    Tune: () => ({ state: { ...state, open: false }, cues: [] }),
  });

/** A chip of the open dials' top row. */
export type Chip = 'tuner' | 'reset';

/**
 * The chips of the open dials' top row, leading to trailing: the Tuner where
 * the panel holds it (`tuner`: the hymn page's panel on a device with the
 * ear), then Reset while chords are on and the move is not the hymn as printed.
 */
export const chipsOf = (state: Thumb, tuner: boolean): ReadonlyArray<Chip> => {
  const reset = state.chords && !isStill(state.move);
  if (tuner && reset) return ['tuner', 'reset'];
  if (tuner) return ['tuner'];
  if (reset) return ['reset'];
  return [];
};

export type Shown = 'chips' | 'capo' | 'key';

/**
 * What the open dials show, top to bottom: the chips' row while it holds a
 * chip (`chipsOf`), the capo dial with chords on, and the key dial.
 */
export const shownOf = (state: Thumb, tuner: boolean): ReadonlyArray<Shown> => {
  const chips: ReadonlyArray<Shown> = (chipsOf(state, tuner).length > 0 && ['chips']) || [];
  const capo: ReadonlyArray<Shown> = (state.chords && ['capo']) || [];
  return [...chips, ...capo, 'key'];
};

/** What the key button shows: the dim guitar with chords off, else a small word over a key. */
export type Face =
  | { readonly _tag: 'Off' }
  | { readonly _tag: 'Key'; readonly over: string; readonly key: string };

export const faceOf = (printed: Chord.Key, state: Thumb): Face => {
  if (!state.chords) return { _tag: 'Off' };
  if (state.move.capo === 0)
    return { _tag: 'Key', over: 'KEY', key: keyName(soundingKey(printed, state.move)) };
  return {
    _tag: 'Key',
    over: `CAPO ${state.move.capo}`,
    key: keyName(playedKey(printed, state.move)),
  };
};

/** What VoiceOver reads for the key button's value. */
export const saidOf = (printed: Chord.Key, state: Thumb): string => {
  const face = faceOf(printed, state);
  if (face._tag === 'Off') return 'Chords off';
  if (state.move.capo === 0) return face.key;
  return `${keyName(soundingKey(printed, state.move))}, capo ${state.move.capo}, ${face.key} shapes`;
};

/** One detent of the key dial: a sounding key, on its pitch class. */
export interface KeyStop {
  readonly pitch: number;
  readonly name: string;
  /** Whether it is the key the hymn is printed in. */
  readonly printed: boolean;
}

/** The key dial's twelve detents, C to B, each spelled as the hymn's transpose to it spells it. */
export const keyStops = (printed: Chord.Key): ReadonlyArray<KeyStop> =>
  Array.from({ length: 12 }, (_, pitch) => {
    const transpose = transposeTo(printed, pitch);
    return {
      pitch,
      name: keyName(soundingKey(printed, { transpose, capo: 0 })),
      printed: transpose === 0,
    };
  });

/** The shapes a guitar plays with no barre and no capo: the open keys. */
const OPEN = new Set(['C', 'A', 'G', 'E', 'D']);

/** One detent of the capo dial: a fret, and the key played there in the sounding key. */
export interface CapoStop {
  readonly capo: number;
  readonly played: string;
  /** Whether the chords played there are an open set (C, A, G, E or D). */
  readonly open: boolean;
}

/** The capo dial's detents, fret 0 to 11, under the sounding key `move` reaches. */
export const capoStops = (printed: Chord.Key, move: Move): ReadonlyArray<CapoStop> =>
  Array.from({ length: 12 }, (_, capo) => {
    const key = playedKey(printed, { ...move, capo });
    return { capo, played: keyName(key), open: OPEN.has(key.tonic) };
  });

/** What VoiceOver reads for the capo dial at `move`. */
export const capoSaid = (printed: Chord.Key, move: Move): string => {
  if (move.capo === 0) return 'No capo';
  return `Capo ${move.capo}, ${keyName(playedKey(printed, move))} shapes`;
};

/** What VoiceOver reads for the key dial at `move`: the sounding key. */
export const keySaid = (printed: Chord.Key, move: Move): string =>
  keyName(soundingKey(printed, move));
