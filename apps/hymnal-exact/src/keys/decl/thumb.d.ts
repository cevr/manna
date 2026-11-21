/**
 * `@manna/hymnal-app/player/thumb` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here; the workspace's typecheck reads the
 * source): Exact's check stages a package's declarations, never its source,
 * and the source's events, cues and options are `effect` values, named here
 * by the shapes they take at run time. It names what the key button's
 * sources and tests read; `src/keys/held.test.ts` holds it to the source.
 */

import type { Key } from '@manna/hymnal/chord';
import type { Move, Opt } from '@manna/hymnal-app/hymns/chords';

/** How long the dials stay open over the bar after a reset, in ms. */
export declare const RESET_WAIT: number;

/** Chords on or off, the hymn's move, and the dials open. */
export type Thumb = { readonly chords: boolean; readonly move: Move; readonly open: boolean };

/** An event at the key button, its dials or its wheel, by its tag. */
export type ThumbEvent =
  | { readonly _tag: 'Tap' | 'Hold' | 'TapPage' | 'Reset' | 'ResetShown' | 'Tune' }
  | { readonly _tag: 'TurnKey'; readonly pitch: number }
  | { readonly _tag: 'StepKey'; readonly by: number }
  | { readonly _tag: 'TurnCapo'; readonly capo: number };

/** The events' constructors. */
export declare const ThumbEvent: {
  readonly Tap: () => ThumbEvent;
  readonly Hold: () => ThumbEvent;
  readonly TapPage: () => ThumbEvent;
  readonly TurnKey: (by: { readonly pitch: number }) => ThumbEvent;
  readonly StepKey: (by: { readonly by: number }) => ThumbEvent;
  readonly TurnCapo: (by: { readonly capo: number }) => ThumbEvent;
  readonly Reset: () => ThumbEvent;
  readonly ResetShown: () => ThumbEvent;
  readonly Tune: () => ThumbEvent;
};

/** A step's state after it and the cues it makes, each by its tag. */
export type Step = {
  readonly state: Thumb;
  readonly cues: ReadonlyArray<{ readonly _tag: string }>;
};

/** The state after `event`, for a hymn printed in `printed`, and the cues it makes. */
export declare const step: (printed: Key, state: Thumb, event: ThumbEvent) => Step;

/** Whether `move` is the hymn as printed. */
export declare const isStill: (move: Move) => boolean;

/** The transpose that sounds a hymn printed in `printed` in the key on `pitch`. */
export declare const transposeTo: (printed: Key, pitch: number) => number;

/** The chips of the open dials' top row. */
export declare const chipsOf: (state: Thumb) => ReadonlyArray<'reset'>;

/** What the open dials show, top to bottom. */
export declare const shownOf: (state: Thumb) => ReadonlyArray<'chips' | 'capo' | 'key'>;

/** What the key button shows: off, or the words over the key. */
export type Face =
  | { readonly _tag: 'Off' }
  | { readonly _tag: 'Key'; readonly over: string; readonly key: string };

/** The key button's face for `state`. */
export declare const faceOf: (printed: Key, state: Thumb) => Face;

/** What VoiceOver reads for the key button's value. */
export declare const saidOf: (printed: Key, state: Thumb) => string;

/** What VoiceOver reads for the key button's hint. */
export declare const hintOf: (printed: Opt<Key>, state: Thumb) => Opt<string>;

/** The key dial's twelve stops. */
export declare const keyStops: (
  printed: Key,
) => ReadonlyArray<{ readonly pitch: number; readonly name: string; readonly printed: boolean }>;

/** The capo dial's stops. */
export declare const capoStops: (
  printed: Key,
  move: Move,
) => ReadonlyArray<{ readonly capo: number; readonly played: string; readonly open: boolean }>;

/** What VoiceOver reads for the capo dial at `move`. */
export declare const capoSaid: (printed: Key, move: Move) => string;

/** What VoiceOver reads for the key dial at `move`. */
export declare const keySaid: (printed: Key, move: Move) => string;
