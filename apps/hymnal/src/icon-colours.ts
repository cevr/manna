/** One face of the icon or the launch screen: the ground, and the mark drawn on it. */
export interface Face {
  readonly ground: string;
  readonly mark: string;
}

/**
 * The app icon's colours, Heartseed's (`apps/heartseed/src/theme.ts`), so the
 * two apps read as one family on the home screen: the wheat in Heartseed's
 * gold (`gold`, `#d4a640`) on its garden ink (`ink`, `#2c4542`) by day, and on
 * its night ground (`dark.ground`, `#142420`) in dark. Tinted is a white mark
 * on black, for the system's tint.
 */
export const icon = {
  light: { ground: '#2c4542', mark: '#d4a640' },
  dark: { ground: '#142420', mark: '#d4a640' },
  tinted: { ground: '#000000', mark: '#ffffff' },
} satisfies Record<'light' | 'dark' | 'tinted', Face>;

/**
 * The launch screen's colours, on Heartseed's page grounds as the owner asked
 * (2026-11-12): its garden ink (`ink`, `#2c4542`) on its light page
 * (`ground`, `#f1f0e6`), and its gold (`#d4a640`) on its night ground
 * (`dark.ground`, `#142420`). The hymn list that follows keeps the hymnal's
 * own grounds, so the launch steps to it in one frame.
 */
export const launch = {
  light: { ground: '#f1f0e6', mark: '#2c4542' },
  dark: { ground: '#142420', mark: '#d4a640' },
} satisfies Record<'light' | 'dark', Face>;
