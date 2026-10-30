/**
 * The Feel seam: the moments a control can be felt or heard by, named. A
 * control tells its cues through `useCue()`; the bar's model (`thumb.ts`)
 * and the dials' physics (`dial.ts`) return the cues they give, and the
 * components that run them tell each one. A cue is plain data, so a worklet
 * can make one on the UI thread and hand it to JavaScript.
 *
 * The context's default does nothing, so no haptic plays and no sound is
 * made until a provider (`FeelProvider`) gives the cues a body (`body.ts`).
 * A cue is told only from a touch's handler: never as a control mounts,
 * and never for a value set from outside it.
 */

import { createContext, use } from 'react';

/** A dial a detent belongs to: keys, capo frets, text sizes or chord placement. */
export type DialName = 'key' | 'capo' | 'size' | 'placement';

/** The cues that carry nothing but their name. */
export type PlainCue =
  | 'wall'
  | 'reset'
  | 'chords-on'
  | 'chords-off'
  | 'play'
  | 'pause'
  | 'switch-on'
  | 'switch-off'
  | 'favourite-on'
  | 'favourite-off'
  | 'press'
  | 'choose'
  | 'tab'
  | 'zoom-out'
  | 'zoom-in'
  | 'sheet-open'
  | 'seek-grab'
  | 'seek-tick'
  | 'seek-release';

/** A moment a control gives. */
export type Cue =
  | { readonly _tag: PlainCue }
  /** A dial's row passed detent `at`, among the dial's own (on the key dial, a pitch class: 0 is C). */
  | { readonly _tag: 'detent'; readonly dial: DialName; readonly at: number }
  /** The topic at `place` among the hymn list's topics took the list's pin. */
  | { readonly _tag: 'section'; readonly place: number };

/** The cue named `name`, for the cues that carry nothing else. */
export const plain = (name: PlainCue): Cue => ({ _tag: name });

/** Tells one cue. */
export type Tell = (cue: Cue) => void;

const CueContext = createContext<Tell>(() => {});

/** Gives the cues a body: its value is told every cue the controls under it give. */
export const CueProvider = CueContext.Provider;

/** The way to tell a cue where the calling control is drawn. */
export const useCue = (): Tell => use(CueContext);
