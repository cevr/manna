/* oxlint-disable effect/noNullish -- React Native names no scheme as null, and a host's hook may answer undefined. */

/**
 * The scheme a screen is drawn in and the styles built for it. Every screen
 * paints only roles of `theme[scheme]` (`./theme`), each text in `face`; its
 * styles are built once per scheme at module load (`themed`) and picked by
 * the scheme now (`useThemed`), so a change of the system's appearance
 * repaints the shown screen in its next frame, with no style built per
 * render. `useScheme` is the one place the scheme is decided.
 *
 * One listener to the system's appearance, held from the module's load for
 * the app's life, tells every mounted screen of a change at once, so they
 * all repaint in one render, and a change is heard whenever a screen
 * mounts; each screen reads the scheme from `Appearance` itself.
 */

import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import { face, theme, type Roles, type Scheme } from './theme';

/** The scheme for what the system names: dark for `dark`, light for `light`, none, or anything else. */
export const schemeOf = (system: string | null | undefined): Scheme => {
  if (system === 'dark') return 'dark';
  return 'light';
};

const watchers = new Set<() => void>();

Appearance.addChangeListener(() => {
  for (const watcher of watchers) watcher();
});

const watch = (watcher: () => void) => {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
};

const systemNow = () => schemeOf(Appearance.getColorScheme());

/** The scheme the screens are drawn in now: the system's appearance, as `schemeOf` reads it. */
export const useScheme = (): Scheme => useSyncExternalStore(watch, systemNow, systemNow);

/** A value built for each scheme. */
export type Themed<A> = Readonly<Record<Scheme, A>>;

/** `build` run once for each scheme, over its roles and the face every text is drawn in. */
export const themed = <A,>(build: (roles: Roles, face: string) => A): Themed<A> => ({
  light: build(theme.light, face),
  dark: build(theme.dark, face),
});

/** The value of `sheets` built for the scheme now. */
export const useThemed = <A,>(sheets: Themed<A>): A => sheets[useScheme()];
