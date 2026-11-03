import * as Chord from '@manna/hymnal/chord';
import { Data, Option } from 'effect';

import { type Cue, plain } from '~/feel/cue';
import { keyName, type Move, playedKey, soundingKey, still } from '~/hymns/chords';

export interface Thumb {
  readonly chords: boolean;
  readonly move: Move;
  readonly open: boolean;
}

export type ThumbEvent = Data.TaggedEnum<{
  Tap: {};
  Hold: {};
  TapPage: {};
  TurnKey: { readonly pitch: number };
  TurnCapo: { readonly capo: number };
  Reset: {};
  ResetShown: {};
  Tune: {};
}>;
export const ThumbEvent = Data.taggedEnum<ThumbEvent>();

export interface Step {
  readonly state: Thumb;
  readonly cues: ReadonlyArray<Cue>;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

export const transposeTo = (printed: Chord.Key, pitch: number): number =>
  mod12(pitch - Chord.pitchClass(printed.tonic) + 5) - 5;

export const isStill = (move: Move): boolean => move.transpose === 0 && move.capo === 0;

export const chordsCue = (on: boolean): Cue => plain((on && 'chords-on') || 'chords-off');

export const step = (printed: Chord.Key, state: Thumb, event: ThumbEvent): Step =>
  ThumbEvent.$match(event, {
    Tap: () => {
      if (!state.chords)
        return { state: { ...state, chords: true, open: false }, cues: [chordsCue(true)] };
      return { state: { ...state, open: !state.open }, cues: [plain('press')] };
    },
    TapPage: () => ({ state: { ...state, open: false }, cues: [] }),
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
    Reset: () => {
      if (isStill(state.move)) return { state: { ...state, open: false }, cues: [] };
      return { state: { ...state, move: still }, cues: [plain('reset')] };
    },
    ResetShown: () => ({ state: { ...state, open: false }, cues: [] }),
    Tune: () => ({ state: { ...state, open: false }, cues: [] }),
  });

export type Chip = 'tuner' | 'reset';

export const chipsOf = (state: Thumb, tuner: boolean): ReadonlyArray<Chip> => {
  const reset = state.chords && !isStill(state.move);
  if (tuner && reset) return ['tuner', 'reset'];
  if (tuner) return ['tuner'];
  if (reset) return ['reset'];
  return [];
};

export type Shown = 'chips' | 'capo' | 'key';

export const shownOf = (state: Thumb, tuner: boolean): ReadonlyArray<Shown> => {
  const chips: ReadonlyArray<Shown> = (chipsOf(state, tuner).length > 0 && ['chips']) || [];
  const capo: ReadonlyArray<Shown> = (state.chords && ['capo']) || [];
  return [...chips, ...capo, 'key'];
};

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

export const saidOf = (printed: Chord.Key, state: Thumb): string => {
  const face = faceOf(printed, state);
  if (face._tag === 'Off') return 'Chords off';
  if (state.move.capo === 0) return face.key;
  return `${keyName(soundingKey(printed, state.move))}, capo ${state.move.capo}, ${face.key} shapes`;
};

export const hintOf = (printed: Option.Option<Chord.Key>, state: Thumb): Option.Option<string> => {
  if (!state.chords) return Option.some('Turns chords on');
  if (state.open) return Option.as(printed, 'Closes the key and capo dials');
  return Option.as(printed, 'Opens the key and capo dials');
};

export interface KeyStop {
  readonly pitch: number;
  readonly name: string;
  readonly printed: boolean;
}

export const keyStops = (printed: Chord.Key): ReadonlyArray<KeyStop> =>
  Array.from({ length: 12 }, (_, pitch) => {
    const transpose = transposeTo(printed, pitch);
    return {
      pitch,
      name: keyName(soundingKey(printed, { transpose, capo: 0 })),
      printed: transpose === 0,
    };
  });

const OPEN = new Set(['C', 'A', 'G', 'E', 'D']);

export interface CapoStop {
  readonly capo: number;
  readonly played: string;
  readonly open: boolean;
}

export const capoStops = (printed: Chord.Key, move: Move): ReadonlyArray<CapoStop> =>
  Array.from({ length: 12 }, (_, capo) => {
    const key = playedKey(printed, { ...move, capo });
    return { capo, played: keyName(key), open: OPEN.has(key.tonic) };
  });

export const capoSaid = (printed: Chord.Key, move: Move): string => {
  if (move.capo === 0) return 'No capo';
  return `Capo ${move.capo}, ${keyName(playedKey(printed, move))} shapes`;
};

export const keySaid = (printed: Chord.Key, move: Move): string =>
  keyName(soundingKey(printed, move));
