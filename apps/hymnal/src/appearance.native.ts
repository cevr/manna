/**
 * The appearance setting shown on a phone: the app's interface style, which
 * the system bars and the theme's dynamic colours follow, and the scheme
 * the hook roles read (`useShownScheme`).
 */

import { Match } from 'effect';
import { createContext, createElement, type ReactNode, use, useSyncExternalStore } from 'react';
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
 * The scheme showing now, heard as it changes. React Native's own scheme
 * hook hears the system's changes but not `setColorScheme`'s (its
 * `Appearance` sets the scheme and tells no listener): this hears both.
 */
const useScheme = (): 'light' | 'dark' => useSyncExternalStore(follow, showing);

/** The scheme the root hands down, or `unset` under no `SchemeProvider`. */
const Scheme = createContext<'light' | 'dark' | 'unset'>('unset');

/**
 * Hands the showing scheme to every screen below it. A screen the stack
 * pauses (one under another, its effects cleaned up) hears no store, so a
 * scheme read there alone would keep the old colours until it shows again;
 * a change of this context reaches it, paused or not.
 */
export const SchemeProvider = ({ children }: { readonly children: ReactNode }) =>
  createElement(Scheme, { value: useScheme() }, children);

/** The scheme showing now: the root's, else this reader's own. */
export const useShownScheme = (): 'light' | 'dark' => {
  const own = useScheme();
  return Match.value(use(Scheme)).pipe(
    Match.when('unset', () => own),
    Match.orElse((handed) => handed),
  );
};
