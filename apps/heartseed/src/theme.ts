/** Light or dark: the system's appearance a colour is drawn for. */
export type Scheme = 'light' | 'dark';

/** Each role a screen draws, by what it is drawn as. */
export interface Roles {
  /** The page, and the launch screen's ground. */
  readonly ground: string;
  /** Field rows, results and pills. */
  readonly card: string;
  /** Text, the big button, and the launch screen's mark. */
  readonly ink: string;
  /** The reference, the stage line, the phase line, cue letters, unread words and the suggested grade. */
  readonly quiet: string;
  /** Lines, the unsaid slot and progress segments; never under text. */
  readonly soft: string;
  /** The missed word's mark, a peeked word, and alerts. */
  readonly miss: string;
  /** The word being heard: opaque, the ground moved 22 % (light) or 25 % (dark) toward `glow`. */
  readonly hearing: string;
  /** The listening glow's colour. */
  readonly glow: string;
  /** The ring behind the big button. */
  readonly pulse: string;
  /** Text on an ink fill: the big button, a chosen grade, Plant. */
  readonly onInk: string;
  /** The big button's shadow; not text. */
  readonly shadow: string;
  /** The plant's seed, ripe ear and awn. */
  readonly gold: string;
  /** The plant's stem and leaf. */
  readonly leaf: string;
  /** The plant's unripe ear. */
  readonly greenEar: string;
  /** The plant's soil line. */
  readonly soil: string;
}

/** The roles in each scheme. */
export interface Palette {
  readonly light: Roles;
  readonly dark: Roles;
}

/**
 * Heartseed's colours: brand C, "Two leaves" (the owner's pick,
 * 2026-11-08), a seedling whose two first leaves open into a heart, in
 * sage. Light is a pale sage page under a deep garden ink; dark is the night
 * garden under a pale sage ink. The icon script (`scripts/icon.ts`) and the
 * native manifest (`vite/app.ts`) read the colours here, so the icon, the
 * launch screen and the screens cannot drift apart; the module imports
 * nothing, so plain scripts and tests load it.
 *
 * `quiet` and `miss` stand at the edge of WCAG AA on `hearing`, the darkest
 * ground they are drawn on by day and the lightest by night: each was moved
 * away from the ground until it read at 4.5:1 there, and no further, so they
 * stay as quiet as AA lets them. `theme.test.ts` holds every text role on
 * every ground it is drawn on to 4.5:1, unrounded.
 */
export const theme: Palette = {
  light: {
    ground: '#f1f0e6',
    card: '#f9f8f1',
    ink: '#2c4542',
    quiet: '#5a6761',
    soft: '#b9cfae',
    miss: '#a04a34',
    hearing: '#ebe0c1',
    glow: '#d4a640',
    pulse: 'rgba(212, 166, 64, 0.45)',
    onInk: '#f1f0e6',
    shadow: '#2c4542',
    gold: '#d4a640',
    leaf: '#6f9a4a',
    greenEar: '#9cbf6a',
    soil: '#8a6e4b',
  },
  dark: {
    ground: '#142420',
    card: '#1d322c',
    ink: '#e6eedb',
    quiet: '#a0b4a7',
    soft: '#3d5c4f',
    miss: '#f09982',
    hearing: '#444528',
    glow: '#d4a640',
    pulse: 'rgba(212, 166, 64, 0.45)',
    onInk: '#142420',
    shadow: '#000000',
    gold: '#d4a640',
    leaf: '#86b862',
    greenEar: '#a9cd78',
    soil: '#a88a62',
  },
};

/** One icon's square: its ground and the mark drawn on it. */
export interface IconColours {
  readonly ground: string;
  readonly mark: string;
}

/** The icon's colours in each scheme, and in the tinted style iOS draws in one hue. */
export interface IconPalette {
  readonly light: IconColours;
  readonly dark: IconColours;
  readonly tinted: IconColours;
}

/**
 * The app icon's colours, apart from the app's: by day the garden ink on a
 * paler sage than the page, by night a pale sage (not the dark ink) on the
 * night garden, as the brand's prototype draws them. The tinted icon is a
 * white mark on black, the grey scale iOS reads and tints in the reader's
 * hue; Android's monochrome layer takes the same white mark.
 */
export const icon: IconPalette = {
  light: { ground: '#dfe8cf', mark: '#2c4542' },
  dark: { ground: '#142420', mark: '#dfe8cf' },
  tinted: { ground: '#000000', mark: '#ffffff' },
};

/** The face of every text, the verse's among them: SF Rounded on iOS, which React Native maps from `ui-rounded`. */
export const face = 'ui-rounded';
