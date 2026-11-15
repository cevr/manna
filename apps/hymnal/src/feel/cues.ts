/**
 * A dial a detent belongs to: keys, capo frets, text sizes, a hymn's tempo
 * or chord placement, or one of the find drums' three digits (`player/drums.ts`).
 */
export type DialName =
  | 'key'
  | 'capo'
  | 'size'
  | 'tempo'
  | 'placement'
  | 'hundreds'
  | 'tens'
  | 'ones';

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
  | 'seek-release'
  | 'rail-tick';

/** A moment a control gives. */
export type Cue =
  | { readonly _tag: PlainCue }
  /** A dial's row passed detent `at`, among the dial's own (on the key dial, a pitch class: 0 is C). */
  | { readonly _tag: 'detent'; readonly dial: DialName; readonly at: number }
  /** The topic at `place` among the hymn list's topics took the list's pin. */
  | { readonly _tag: 'section'; readonly place: number }
  /** A beat of the count-in came; `accent` on its first beat (`src/player/countin.ts`). */
  | { readonly _tag: 'beat'; readonly accent: boolean };

/** The cue named `name`, for the cues that carry nothing else. */
export const plain = (name: PlainCue): Cue => ({ _tag: name });

/** Tells one cue. */
export type Tell = (cue: Cue) => void;
