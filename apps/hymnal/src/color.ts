/**
 * The web's colours: the theme's roles as CSS custom properties that follow
 * the page's colour scheme (`light-dark()`), which the appearance setting
 * sets. The root layout writes `webColors`.
 */

import type { ColorValue } from 'react-native';

import { type Roles, theme } from './theme';

const roles = [
  'ground',
  'ink',
  'muted',
  'line',
  'accent',
  'button',
  'onButton',
  'selected',
  'soft',
  'onAccent',
  'pressed',
  'onPressed',
  'panel',
  'edge',
  'chord',
  'bar',
  'pill',
  'onPill',
  'chosen',
  'onChosen',
  'glass',
  'onGlass',
  'onGlassMuted',
  'glassChosen',
  'onGlassChosen',
] as const satisfies ReadonlyArray<keyof Roles>;

export const color = {
  ground: 'var(--ground)',
  ink: 'var(--ink)',
  muted: 'var(--muted)',
  line: 'var(--line)',
  soft: 'var(--soft)',
  panel: 'var(--panel)',
  edge: 'var(--edge)',
  chord: 'var(--chord)',
  bar: 'var(--bar)',
  pill: 'var(--pill)',
  onPill: 'var(--onPill)',
  chosen: 'var(--chosen)',
  onChosen: 'var(--onChosen)',
  glass: 'var(--glass)',
  onGlass: 'var(--onGlass)',
  onGlassMuted: 'var(--onGlassMuted)',
  glassChosen: 'var(--glassChosen)',
  onGlassChosen: 'var(--onGlassChosen)',
} satisfies Record<Exclude<keyof Roles, Fill>, ColorValue>;

/** The roles a screen reads through a hook: the accent, the button and their fills' text, pressed or not, and the selected fill. */
type Fill = 'accent' | 'onAccent' | 'pressed' | 'onPressed' | 'button' | 'onButton' | 'selected';

/** The accent in the scheme showing now. */
export const useAccent = (): ColorValue => 'var(--accent)';

/** A button's tint or fill in the scheme showing now. */
export const useButton = (): ColorValue => 'var(--button)';

/** Text and marks on the button's fill in the scheme showing now. */
export const useOnButton = (): ColorValue => 'var(--onButton)';

/** A chosen tab's fill in the scheme showing now. */
export const useSelected = (): ColorValue => 'var(--selected)';

/** Text on the accent in the scheme showing now. */
export const useOnAccent = (): ColorValue => 'var(--onAccent)';

/** The accent fill while pressed, and its text, in the scheme showing now. */
export const usePressed = () => ({
  fill: 'var(--pressed)',
  text: 'var(--onPressed)',
});

export const webColors = `
:root {
  color-scheme: light dark;
${roles.map((role) => `  --${role}: light-dark(${theme.light[role]}, ${theme.dark[role]});`).join('\n')}
}
html, body { margin: 0; background: var(--ground); color: var(--ink); }
body { display: flex; flex-direction: column; height: 100dvh; font-family: system-ui, -apple-system, sans-serif; }
::selection { background: var(--soft); color: var(--ink); }
`;
