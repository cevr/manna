/**
 * `@manna/hymnal-app/player/thumb` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here; the workspace's typecheck reads the
 * source): Exact's check stages a package's declarations, never its source,
 * and the source's events, cues and options are `effect` values, named here
 * by the shapes they take at run time. It names only what the key button's
 * model test reads; `src/keys/held.test.ts` holds it to the source.
 */

import type { Key } from '@manna/hymnal/chord';
import type { Move, Opt } from '@manna/hymnal-app/hymns/chords';

/** How long the dials stay open over the bar after a reset, in ms. */
export declare const RESET_WAIT: number;

export interface Thumb {
  readonly chords: boolean;
  readonly move: Move;
  readonly open: boolean;
}

/** An event at the key button, its dials or its wheel, by its tag. */
export type ThumbEvent =
  | { readonly _tag: 'Tap' }
  | { readonly _tag: 'Hold' }
  | { readonly _tag: 'TapPage' }
  | { readonly _tag: 'TurnKey'; readonly pitch: number }
  | { readonly _tag: 'StepKey'; readonly by: number }
  | { readonly _tag: 'TurnCapo'; readonly capo: number }
  | { readonly _tag: 'Reset' }
  | { readonly _tag: 'ResetShown' }
  | { readonly _tag: 'Tune' };

/** The events' constructors. */
export declare const ThumbEvent: {
  readonly Tap: () => ThumbEvent;
  readonly Hold: () => ThumbEvent;
  readonly TapPage: () => ThumbEvent;
  readonly TurnKey: (args: { readonly pitch: number }) => ThumbEvent;
  readonly StepKey: (args: { readonly by: number }) => ThumbEvent;
  readonly TurnCapo: (args: { readonly capo: number }) => ThumbEvent;
  readonly Reset: () => ThumbEvent;
  readonly ResetShown: () => ThumbEvent;
  readonly Tune: () => ThumbEvent;
};

/** A cue, by its tag. */
export type Cue = { readonly _tag: string };

export interface Step {
  readonly state: Thumb;
  readonly cues: ReadonlyArray<Cue>;
}

/** The state after `event`, for a hymn printed in `printed`, and the cues it makes. */
export declare const step: (printed: Key, state: Thumb, event: ThumbEvent) => Step;

/** The transpose, -5 to 6, that sounds a hymn printed in `printed` in the key on `pitch`. */
export declare const transposeTo: (printed: Key, pitch: number) => number;

/** The chips of the open dials' top row. */
export declare const chipsOf: (state: Thumb) => ReadonlyArray<'reset'>;

/** What the open dials show, top to bottom. */
export declare const shownOf: (state: Thumb) => ReadonlyArray<'chips' | 'capo' | 'key'>;

/** What the key button shows. */
export type Face =
  | { readonly _tag: 'Off' }
  | { readonly _tag: 'Key'; readonly over: string; readonly key: string };

export declare const faceOf: (printed: Key, state: Thumb) => Face;

/** What VoiceOver reads for the key button's value. */
export declare const saidOf: (printed: Key, state: Thumb) => string;

/** What VoiceOver reads for the key button's hint. */
export declare const hintOf: (printed: Opt<Key>, state: Thumb) => Opt<string>;

export interface KeyStop {
  readonly pitch: number;
  readonly name: string;
  readonly printed: boolean;
}

export declare const keyStops: (printed: Key) => ReadonlyArray<KeyStop>;

export interface CapoStop {
  readonly capo: number;
  readonly played: string;
  readonly open: boolean;
}

export declare const capoStops: (printed: Key, move: Move) => ReadonlyArray<CapoStop>;

/** What VoiceOver reads for the capo dial at `move`. */
export declare const capoSaid: (printed: Key, move: Move) => string;

/** What VoiceOver reads for the key dial at `move`. */
export declare const keySaid: (printed: Key, move: Move) => string;
