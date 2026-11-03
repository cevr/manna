import type { Appearance } from './settings';

const scheme = { system: 'light dark', light: 'light', dark: 'dark' } as const satisfies Record<
  Appearance,
  string
>;

export const applyAppearance = (appearance: Appearance): void => {
  document.documentElement.style.colorScheme = scheme[appearance];
};
