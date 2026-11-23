/**
 * A plain cue the port's taps tell, by its name. This file is
 * `@manna/hymnal-app/feel/cues` as Exact's type check reads it (the app's
 * `tsconfig.json` maps it here); it names only those cues, and the repo's
 * typecheck reads the source itself.
 */
type Told =
  | 'play'
  | 'pause'
  | 'choose'
  | 'press'
  | 'tab'
  | 'favourite-on'
  | 'favourite-off'
  | 'chords-on'
  | 'chords-off'
  | 'rail-tick';

/** A moment a control gives. */
export type Cue = { readonly _tag: string };

/** The cue named `name`. */
export declare const plain: (name: Told) => Cue;
