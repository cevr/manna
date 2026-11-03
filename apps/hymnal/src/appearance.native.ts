import { Appearance as RN } from 'react-native';

import type { Appearance } from './settings';

const style = { system: 'unspecified', light: 'light', dark: 'dark' } as const satisfies Record<
  Appearance,
  Parameters<typeof RN.setColorScheme>[0]
>;

export const applyAppearance = (appearance: Appearance): void => {
  RN.setColorScheme(style[appearance]);
};
