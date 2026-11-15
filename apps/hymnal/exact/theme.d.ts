/**
 * `src/theme.ts` as Exact's type check reads it (it stages a package's
 * declarations, never its source): the hymnal's colours, a hex value for
 * each named role in each scheme. The port's brand (`app.forma`) is held
 * to it role for role. `test/exact-declarations.ts` holds it to the source.
 */
export type Role =
  | 'ground'
  | 'ink'
  | 'muted'
  | 'line'
  | 'accent'
  | 'button'
  | 'onButton'
  | 'selected'
  | 'chord'
  | 'soft'
  | 'onAccent'
  | 'pressed'
  | 'onPressed'
  | 'panel'
  | 'edge'
  | 'bar'
  | 'pill'
  | 'onPill'
  | 'chosen'
  | 'onChosen'
  | 'alert'
  | 'shadow'
  | 'glass'
  | 'onGlass'
  | 'onGlassMuted'
  | 'glassChosen'
  | 'onGlassChosen';

/** The two schemes, light and dark, each a colour per role. */
export declare const theme: {
  readonly [scheme in 'light' | 'dark']: { readonly [role in Role]: string };
};
