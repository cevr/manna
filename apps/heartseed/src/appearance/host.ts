/* oxlint-disable effect/noNullish -- React Native names no scheme as null. */

/**
 * The interface style off iOS (the web and the tests): react-native-web has
 * no `setColorScheme`, so a choice draws only the app's own screens, and the
 * system's appearance is what `Appearance` reports.
 */

import { Appearance } from 'react-native';

import type { Choice } from '../appearance';

/** Sets the interface style the system draws its own parts in; nothing here. */
export const applyStyle = (_choice: Choice): void => {};

/** The system's own appearance, whatever the app's style. */
export const systemAppearance = (): string | null => Appearance.getColorScheme() ?? null;
