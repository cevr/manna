/**
 * The appearance setting shown on a phone: the app's interface style, which
 * the system bars and the theme's dynamic colours follow, and the scheme
 * the hook roles read (`useScheme`).
 */

import { Match } from 'effect';
import { useSyncExternalStore } from 'react';
import { Appearance as RN } from 'react-native';

import type { Appearance } from './settings';

const style = { system: 'unspecified', light: 'light', dark: 'dark' } as const satisfies Record<
  Appearance,
  Parameters<typeof RN.setColorScheme>[0]
>;

/** Each mounted reader of `useScheme`, told when the setting changes the style. */
const readers = new Set<() => void>();

const follow = (redraw: () => void) => {
  readers.add(redraw);
  const system = RN.addChangeListener(redraw);
  return () => {
    readers.delete(redraw);
    system.remove();
  };
};

export const applyAppearance = (appearance: Appearance): void => {
  RN.setColorScheme(style[appearance]);
  for (const redraw of readers) redraw();
};

/** The scheme showing now: dark, or light where React Native says light or nothing. */
const showing = () =>
  Match.value(RN.getColorScheme()).pipe(
    Match.when('dark', () => 'dark' as const),
    Match.orElse(() => 'light' as const),
  );

/**
 * The scheme showing now. React Native's own scheme hook hears the
 * system's changes but not `setColorScheme`'s (its `Appearance` sets the
 * scheme and tells no listener), so a screen open while the setting changed
 * would keep the old scheme's colours: this hears both.
 */
export const useScheme = (): 'light' | 'dark' => useSyncExternalStore(follow, showing);
