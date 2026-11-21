/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module reads no effect here (docs/exact.md): a hymn with no printed key is `undefined`, and the rule branches plainly. */

/**
 * The bar's key button and its dials, as the current hymnal's model has
 * them (`apps/hymnal/src/player/thumb.ts`), in the port's terms: whether
 * chords show (for every hymn), the page's hymn's move, and whether the
 * dials above the bar are open. With chords off the key button is the
 * chords switch: a tap turns chords on and opens nothing. With chords on a
 * tap opens the dials or closes them, and a tap on the page closes them. A
 * hold (the key button's hold with chords off, the wheel's Chords off) turns
 * chords on or off, and turning them off closes the dials. The key dial
 * turns the sounding key and turns chords on; the capo dial is held to 0 to
 * 11, a turn past an end a wall. Reset is the hymn as printed; the dials
 * close once the reader has seen it (`shown`, after the bar's wait), or at
 * once when the hymn was home already. The wheel's Key ♭ and Key ♯ step the
 * sounding key a semitone and close the dials.
 *
 * A hymn with no printed key (no chords) takes only a hold, a tap on the
 * page and a tap with chords off, stepped as from C major, as the current
 * `Dials.tsx` `useThumb` does; anything else changes nothing.
 *
 * Each step answers the next state and the one cue it gives, or "" for none
 * (`src/keys/thumb.model.test.ts` holds it to the current app's `step`).
 */

import type { Key } from '@manna/hymnal/chord';
import { keyName, type Move, playedKey, soundingKey, still } from '@manna/hymnal-app/hymns/chords';

import { frettedTo, keyedTo } from '../chords/move.ts';

export interface Thumb {
  readonly chords: boolean;
  readonly move: Move;
  readonly open: boolean;
}

/** An event at the key button, its dials or its wheel. */
export type ThumbEvent =
  | { readonly kind: 'tap' }
  | { readonly kind: 'hold' }
  | { readonly kind: 'page' }
  | { readonly kind: 'key'; readonly pitch: number }
  | { readonly kind: 'step'; readonly by: number }
  | { readonly kind: 'capo'; readonly capo: number }
  | { readonly kind: 'reset' }
  | { readonly kind: 'shown' };

/** The cue a step gives, by the current app's name, or "" for none. */
export type Cue = '' | 'press' | 'chords-on' | 'chords-off' | 'wall' | 'reset';

export interface Step {
  readonly state: Thumb;
  readonly cue: Cue;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** The seven letters, each at its pitch class above C, a space at each black key. */
const LETTERS = 'C D EF G A B';

/** The pitch class of a tonic as the hymnal spells it ("Db", "F#"), 0 = C: the hymnal's `Chord.pitchClass`. */
export const pitchOf = (tonic: string): number => {
  const letter = Math.max(0, LETTERS.indexOf(tonic.charAt(0)));
  const marks = [...tonic.slice(1)];
  return mod12(
    letter +
      marks.filter((mark) => mark === '#').length -
      marks.filter((mark) => mark === 'b').length,
  );
};

/** Whether `move` is the hymn as printed. */
export const isStill = (move: Move): boolean => move.transpose === 0 && move.capo === 0;

/** The cue a switch of chords to `on` gives. */
const chordsCue = (on: boolean): Cue => (on ? 'chords-on' : 'chords-off');

/** A hymn's printed key's place in the twelve: its pitch class. */
const printedPitch = (printed: Key): number => pitchOf(printed.tonic);

/** The pitch class the key `move` sounds in, `by` semitones on. */
const pitchBy = (printed: Key, move: Move, by: number): number =>
  mod12(pitchOf(soundingKey(printed, move).tonic) + by);

/** The state after `event`, for a hymn printed in `printed`, and its cue. */
export const step = (printed: Key, state: Thumb, event: ThumbEvent): Step => {
  switch (event.kind) {
    case 'tap':
      if (!state.chords)
        return { state: { ...state, chords: true, open: false }, cue: 'chords-on' };
      return { state: { ...state, open: !state.open }, cue: 'press' };
    case 'page':
      return { state: { ...state, open: false }, cue: '' };
    case 'hold':
      return {
        state: { ...state, chords: !state.chords, open: state.open && !state.chords },
        cue: chordsCue(!state.chords),
      };
    case 'key':
      return {
        state: {
          ...state,
          chords: true,
          move: keyedTo(state.move, printedPitch(printed), event.pitch),
        },
        cue: state.chords ? '' : 'chords-on',
      };
    case 'step':
      return {
        state: {
          ...state,
          chords: true,
          open: false,
          move: keyedTo(state.move, printedPitch(printed), pitchBy(printed, state.move, event.by)),
        },
        cue: state.chords ? '' : 'chords-on',
      };
    case 'capo': {
      const move = frettedTo(state.move, event.capo);
      return { state: { ...state, move }, cue: move.capo === event.capo ? '' : 'wall' };
    }
    case 'reset':
      if (isStill(state.move)) return { state: { ...state, open: false }, cue: '' };
      return { state: { ...state, move: still }, cue: 'reset' };
    case 'shown':
      return { state: { ...state, open: false }, cue: '' };
  }
};

/** The key a hymn with no chords steps from. */
const NO_KEY: Key = { tonic: 'C', minor: false };

/** The events a hymn with no printed key takes: a hold, a tap on the page, and a tap with chords off. */
const keyless = (event: ThumbEvent, chords: boolean): boolean =>
  event.kind === 'hold' || event.kind === 'page' || (event.kind === 'tap' && !chords);

/** `step` for a hymn whose printed key may be none: none takes only the keyless events, and the rest change nothing. */
export const stepOn = (printed: Key | undefined, state: Thumb, event: ThumbEvent): Step => {
  if (printed !== undefined) return step(printed, state, event);
  if (keyless(event, state.chords)) return step(NO_KEY, state, event);
  return { state, cue: '' };
};

/** The open dials' top row: Reset while chords are on and the move is not the hymn as printed. */
export const resetShown = (state: Thumb): boolean => state.chords && !isStill(state.move);

/** The rows the open dials show, top to bottom: the chips' row, the capo dial with chords on, the key dial. */
export const rowsOf = (state: Thumb): ReadonlyArray<'chips' | 'capo' | 'key'> => [
  ...(resetShown(state) ? (['chips'] as const) : []),
  ...(state.chords ? (['capo'] as const) : []),
  'key',
];

/** What the key button shows: the dim guitar with chords off (`over` and `key` empty), else a small word over a key. */
export interface Face {
  readonly on: boolean;
  readonly over: string;
  readonly key: string;
}

export const faceOf = (printed: Key, state: Thumb): Face => {
  if (!state.chords) return { on: false, over: '', key: '' };
  if (state.move.capo === 0)
    return { on: true, over: 'KEY', key: keyName(soundingKey(printed, state.move)) };
  return {
    on: true,
    over: `CAPO ${state.move.capo}`,
    key: keyName(playedKey(printed, state.move)),
  };
};

/** What VoiceOver reads for the key button's value; a hymn with no chords reads "No chords" with chords on. */
export const saidOf = (printed: Key | undefined, state: Thumb): string => {
  if (printed === undefined) return state.chords ? 'No chords' : 'Chords off';
  const face = faceOf(printed, state);
  if (!face.on) return 'Chords off';
  if (state.move.capo === 0) return face.key;
  return `${keyName(soundingKey(printed, state.move))}, capo ${state.move.capo}, ${face.key} shapes`;
};

/** What the key button's next tap does, said as its hint; "" on a hymn with no chords and chords on. */
export const hintOf = (printed: Key | undefined, state: Thumb): string => {
  if (!state.chords) return 'Turns chords on';
  if (printed === undefined) return '';
  if (state.open) return 'Closes the key and capo dials';
  return 'Opens the key and capo dials';
};

/** One stop of the key dial: a sounding key, on its pitch class. */
export interface KeyStop {
  readonly pitch: number;
  readonly name: string;
  readonly printed: boolean;
}

/** The key dial's twelve stops, C to B, each spelled as the hymn's transpose to it spells it. */
export const keyStops = (printed: Key): ReadonlyArray<KeyStop> =>
  Array.from({ length: 12 }, (_, pitch) => {
    const move = keyedTo(still, printedPitch(printed), pitch);
    return { pitch, name: keyName(soundingKey(printed, move)), printed: move.transpose === 0 };
  });

/** The shapes a guitar plays with no barre and no capo. */
const OPEN = new Set(['C', 'A', 'G', 'E', 'D']);

/** One stop of the capo dial: a fret, the key played there, and whether that is an open set. */
export interface CapoStop {
  readonly capo: number;
  readonly played: string;
  readonly open: boolean;
}

/** The capo dial's stops, fret 0 to 11, under the sounding key `move` reaches. */
export const capoStops = (printed: Key, move: Move): ReadonlyArray<CapoStop> =>
  Array.from({ length: 12 }, (_, capo) => {
    const key = playedKey(printed, { ...move, capo });
    return { capo, played: keyName(key), open: OPEN.has(key.tonic) };
  });

/** What VoiceOver reads for the capo dial at `move`. */
export const capoSaid = (printed: Key, move: Move): string => {
  if (move.capo === 0) return 'No capo';
  return `Capo ${move.capo}, ${keyName(playedKey(printed, move))} shapes`;
};

/** What VoiceOver reads for the key dial at `move`: the sounding key. */
export const keySaid = (printed: Key, move: Move): string => keyName(soundingKey(printed, move));

/** The pitch class the key dial stands on at `move`. */
export const keyIndexOf = (printed: Key, move: Move): number =>
  pitchOf(soundingKey(printed, move).tonic);
