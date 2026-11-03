import { createContext, use } from 'react';

export type DialName =
  | 'key'
  | 'capo'
  | 'size'
  | 'tempo'
  | 'placement'
  | 'hundreds'
  | 'tens'
  | 'ones';

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
  | 'seek-release'
  | 'rail-tick';

export type Cue =
  | { readonly _tag: PlainCue }
  | { readonly _tag: 'detent'; readonly dial: DialName; readonly at: number }
  | { readonly _tag: 'section'; readonly place: number }
  | { readonly _tag: 'beat'; readonly accent: boolean };

export const plain = (name: PlainCue): Cue => ({ _tag: name });

export type Tell = (cue: Cue) => void;

const CueContext = createContext<Tell>(() => {});

export const CueProvider = CueContext.Provider;

export const useCue = (): Tell => use(CueContext);
