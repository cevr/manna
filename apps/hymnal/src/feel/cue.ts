/**
 * The Feel seam: the moments a control can be felt or heard by, named. A
 * control tells its cues through `useCue()`; the bar's model (`thumb.ts`)
 * and the dials' physics (`dial.ts`) return the cues they give, and the
 * components that run them tell each one. The context's default does
 * nothing, so no haptic plays and no sound is made until a provider gives
 * the cues a body.
 */

import { createContext, use } from 'react';

/** A moment a control gives. */
export type Cue =
  | 'detent'
  | 'wall'
  | 'reset'
  | 'chords-on'
  | 'chords-off'
  | 'play'
  | 'pause'
  | 'seek-grab'
  | 'seek-release'
  | 'sheet-open';

/** Tells one cue. */
export type Tell = (cue: Cue) => void;

const CueContext = createContext<Tell>(() => {});

/** Gives the cues a body: its value is told every cue the controls under it give. */
export const CueProvider = CueContext.Provider;

/** The way to tell a cue where the calling control is drawn. */
export const useCue = (): Tell => use(CueContext);
