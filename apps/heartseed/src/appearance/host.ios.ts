/* oxlint-disable effect/noNullish -- React Native names no scheme as null. */

/**
 * The interface style on iOS: the app's windows take the reader's choice
 * (`setColorScheme` light or dark, `unspecified` for System), so the status
 * bar, alerts and the system's own controls match the screens.
 *
 * Under a light or dark style React Native reports that style, not the
 * system's, and hears no change of the system; so the system's own
 * appearance is the last one reported while no style was set, read at the
 * module's load, before any style is.
 */

import { Appearance } from 'react-native';

import type { Choice } from '../appearance';

const STYLE = { system: 'unspecified', light: 'light', dark: 'dark' } as const satisfies Record<
  Choice,
  Parameters<typeof Appearance.setColorScheme>[0]
>;

const held = { styled: false, system: Appearance.getColorScheme() ?? null };

Appearance.addChangeListener(({ colorScheme }) => {
  if (!held.styled) held.system = colorScheme ?? null;
});

/** Sets the app's interface style to the choice's. */
export const applyStyle = (choice: Choice): void => {
  held.styled = choice !== 'system';
  Appearance.setColorScheme(STYLE[choice]);
};

/** The system's own appearance, as last reported with no style set. */
export const systemAppearance = (): string | null => held.system;
