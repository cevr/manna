/**
 * The Feel seam: the moments a control can be felt or heard by, named. A
 * control tells its cues through `useCue()`; the bar's model (`thumb.ts`)
 * and the dials' physics (`dial.ts`) return the cues they give, and the
 * components that run them tell each one. A cue is plain data, so a worklet
 * can make one on the UI thread and hand it to JavaScript. The cues
 * themselves are `cues.ts`, which imports no React.
 *
 * The context's default does nothing, so no haptic plays and no sound is
 * made until a provider (`FeelProvider`) gives the cues a body (`body.ts`).
 * A cue is told only from a touch's handler: never as a control mounts,
 * and never for a value set from outside it. The one exception is `beat`:
 * the count-in (`src/follow/CountIn.tsx`) tells one for each beat the
 * player gives while the reader's `Click` is on, a touch's (Play's) result
 * told in time.
 */

import { createContext, use } from 'react';

import type { Tell } from './cues';

export { type Cue, type DialName, type PlainCue, plain, type Tell } from './cues';

const CueContext = createContext<Tell>(() => {});

/** Gives the cues a body: its value is told every cue the controls under it give. */
export const CueProvider = CueContext.Provider;

/** The way to tell a cue where the calling control is drawn. */
export const useCue = (): Tell => use(CueContext);
