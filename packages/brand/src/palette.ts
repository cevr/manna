/**
 * The brand's colours: Moonlit wheat, the wheat `#ffefae` on the night
 * `#12354e`, which the owner chose after brand round 5 (2026-10-24, with
 * lockup D and site direction N2, “The sky turns”). Every role keeps the
 * wheat's hue or the night's, or is a grey between them, but the dusk's
 * stops, which carry the day into the night, and the painted sky.
 *
 * This module is the one source. The First the Blade site re-exports it
 * (`apps/firsttheblade/src/palette.ts`): its stylesheet's `:root` names each
 * role as `--color-<role>` with these same values (the site's tests hold the
 * two together), and its letters, manifest, series marks and YouTube kit read
 * them. The hymnal draws its theme's roles and its icons from them
 * (`apps/hymnal/src/theme.ts`, `apps/hymnal/scripts/icon.ts`).
 */

/** Each role the site and the kit use, and where it comes from. */
export const PALETTE = {
  /** The page by day: the wheat, tinted 62% toward white. */
  paper: '#fff9e0',
  /** The bands and the marks' tiles: the wheat, tinted 25%. */
  band: '#fff3c2',
  /** The wheat itself: the warm end of the day, and the brand's light colour. */
  wheat: '#ffefae',
  /** Text and the wordmark by day: the night. */
  ink: '#12354e',
  /** Quiet text: the night, tinted 25%. */
  soft: '#4d687a',
  /**
   * Labels, references, the series marks and the lockup's wheat and “the”
   * on the paper: the wheat deepened at its own hue until it reads at 4.5:1
   * on the paper, the bands and the wheat.
   */
  accent: '#7a6813',
  /** The morning sky the field is painted with, for the browser's own chrome. */
  sky: '#bac9db',
  /** The page by night, and the brand's dark colour. */
  night: '#12354e',
  /** Text by night: the wheat. */
  nightInk: '#ffefae',
  /** The lockup, the buttons and the focus ring by night: the wheat. */
  nightAccent: '#ffefae',
  /** Quiet text and the field's edge by night: the wheat, 30% toward the night. */
  nightSoft: '#b8b791',
  /** The rule over the footer: the night, 22% toward the wheat. */
  nightRule: '#465e63',
  /** The dusk's first warm stop, after the wheat. */
  duskGold: '#f6c98a',
  /** The dusk's rose middle. */
  duskRose: '#d99a86',
  /** The dusk's last light, before the night. */
  duskLate: '#6e6683',
} as const;

export type Role = keyof typeof PALETTE;
