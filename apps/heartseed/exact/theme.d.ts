/** Light or dark, as a screen is drawn. */
export type Scheme = 'light' | 'dark';
/** Each role's colour in one scheme, by the role's name; see `src/theme.ts` for what each draws. */
export type Roles = Readonly<
  Record<
    | 'ground'
    | 'card'
    | 'ink'
    | 'quiet'
    | 'soft'
    | 'miss'
    | 'hearing'
    | 'glow'
    | 'pulse'
    | 'onInk'
    | 'shadow'
    | 'gold'
    | 'leaf'
    | 'greenEar'
    | 'soil'
    | 'furrow'
    | 'sun',
    string
  >
>;
/** The roles in light and in dark. */
export type Palette = Readonly<Record<Scheme, Roles>>;
/** Heartseed's colours, brand C; the Exact port's brand file is held to them. */
export declare const theme: Palette;
