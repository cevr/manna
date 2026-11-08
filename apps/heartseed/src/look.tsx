/* oxlint-disable effect/noNullish -- React Native names no scheme as null, and a host's hook may answer undefined. */

/**
 * The scheme a screen is drawn in and the styles built for it. Every screen
 * paints only roles of `theme[scheme]` (`./theme`), each text in `face`; its
 * styles are built once per scheme at module load (`themed`) and picked by
 * the scheme now (`useScheme`), so a change of the reader's appearance or of
 * the system's repaints the shown screen in its next frame, with no style
 * built per render. `useScheme` is the one place the scheme is decided:
 * `schemeOf` (`./appearance`) over the appearance shown and the system's.
 *
 * One listener to the system's appearance, held from the module's load for
 * the app's life, and the root's `showAppearance` tell every mounted screen
 * of a change at once, so they all repaint in one render; each screen reads
 * the scheme from the shown appearance and `Appearance` itself. Until the
 * root shows the reader's appearance, and after it leaves, it is System.
 */

import { MutableRef } from 'effect';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import { schemeOf as schemeUnder, type Choice } from './appearance';
import { face, theme, type Roles, type Scheme } from './theme';

/** The appearance the screens are drawn under now. */
const shown = MutableRef.make<Choice>('system');

const watchers = new Set<() => void>();

const tell = () => {
  for (const watcher of watchers) watcher();
};

Appearance.addChangeListener(tell);

const watch = (watcher: () => void) => {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
};

/** The scheme the screens show for what the system names, under the appearance shown: Light's and Dark's own, and for System dark for `dark` and light for anything else. */
export const schemeOf = (system: string | null | undefined): Scheme =>
  schemeUnder(MutableRef.get(shown), system);

/** Draws every screen under `choice` from now on, each mounted one repainted at once. */
export const showAppearance = (choice: Choice): void => {
  if (MutableRef.get(shown) === choice) return;
  MutableRef.set(shown, choice);
  tell();
};

const schemeNow = () => schemeOf(Appearance.getColorScheme());

/** The scheme the screens are drawn in now: the appearance shown over the system's, as `schemeOf` reads them. */
export const useScheme = (): Scheme => useSyncExternalStore(watch, schemeNow, schemeNow);

/** A value built for each scheme. */
export type Themed<A> = Readonly<Record<Scheme, A>>;

/** `build` run once for each scheme, over its roles and the face every text is drawn in. */
export const themed = <A,>(build: (roles: Roles, face: string) => A): Themed<A> => ({
  light: build(theme.light, face),
  dark: build(theme.dark, face),
});

/** The value of `sheets` built for the scheme now. */
export const useThemed = <A,>(sheets: Themed<A>): A => sheets[useScheme()];
