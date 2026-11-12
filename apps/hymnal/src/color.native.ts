/**
 * A phone's colours. On iOS each role is the theme's pair as one dynamic
 * colour (`DynamicColorIOS`), which follows the app's interface style as the
 * appearance setting sets it. Android has no dynamic colour in React Native,
 * so it keeps the system's own colours until the theme ships as night-mode
 * colour resources.
 */

import { type ColorValue, DynamicColorIOS, Platform, PlatformColor } from 'react-native';

import { useShownScheme } from './appearance.native';
import { type Roles, theme } from './theme';

const dynamic = (role: keyof Roles) =>
  DynamicColorIOS({ light: theme.light[role], dark: theme.dark[role] });

export const color = Platform.select({
  ios: () => ({
    ground: dynamic('ground'),
    ink: dynamic('ink'),
    muted: dynamic('muted'),
    line: dynamic('line'),
    soft: dynamic('soft'),
    panel: dynamic('panel'),
    edge: dynamic('edge'),
    chord: dynamic('chord'),
    bar: dynamic('bar'),
    pill: dynamic('pill'),
    onPill: dynamic('onPill'),
    chosen: dynamic('chosen'),
    onChosen: dynamic('onChosen'),
    alert: dynamic('alert'),
    glass: dynamic('glass'),
    onGlass: dynamic('onGlass'),
    onGlassMuted: dynamic('onGlassMuted'),
    glassChosen: dynamic('glassChosen'),
    onGlassChosen: dynamic('onGlassChosen'),
  }),
  default: () => ({
    ground: PlatformColor('?android:attr/colorBackground'),
    ink: PlatformColor('?android:attr/colorForeground'),
    muted: PlatformColor('?android:attr/colorForeground'),
    line: PlatformColor('?android:attr/colorControlHighlight'),
    soft: PlatformColor('?android:attr/colorControlHighlight'),
    panel: PlatformColor('?android:attr/colorBackground'),
    edge: PlatformColor('?android:attr/colorForeground'),
    chord: PlatformColor('?android:attr/colorForeground'),
    bar: PlatformColor('?android:attr/colorBackground'),
    pill: PlatformColor('?android:attr/colorControlHighlight'),
    onPill: PlatformColor('?android:attr/colorForeground'),
    chosen: PlatformColor('?android:attr/colorForeground'),
    onChosen: PlatformColor('?android:attr/colorBackground'),
    alert: PlatformColor('?android:attr/colorForeground'),
    glass: PlatformColor('?android:attr/colorControlHighlight'),
    onGlass: PlatformColor('?android:attr/colorForeground'),
    onGlassMuted: PlatformColor('?android:attr/colorForeground'),
    glassChosen: PlatformColor('?android:attr/colorForeground'),
    onGlassChosen: PlatformColor('?android:attr/colorBackground'),
  }),
})() satisfies Record<Exclude<keyof Roles, Fill>, ColorValue>;

/** The roles a screen reads through a hook: the accent, the button and their fills' text, pressed or not, the selected fill, and the shadow. */
type Fill =
  | 'accent'
  | 'onAccent'
  | 'pressed'
  | 'onPressed'
  | 'button'
  | 'onButton'
  | 'selected'
  | 'shadow';

/** The theme's roles in the scheme showing now, redrawn when the appearance setting or the system changes it. */
const useRoles = (): Roles => theme[useShownScheme()];

/** The accent in the scheme showing now. */
export const useAccent = (): ColorValue => useRoles().accent;

/** A button's tint or fill in the scheme showing now. */
export const useButton = (): ColorValue => useRoles().button;

/** Text and marks on the button's fill in the scheme showing now. */
export const useOnButton = (): ColorValue => useRoles().onButton;

/** A chosen tab's fill in the scheme showing now. */
export const useSelected = (): ColorValue => useRoles().selected;

/** Text on the accent in the scheme showing now. */
export const useOnAccent = (): ColorValue => useRoles().onAccent;

/** The accent fill while pressed, and its text, in the scheme showing now. */
export const usePressed = () => {
  const roles = useRoles();
  return { fill: roles.pressed, text: roles.onPressed };
};

/**
 * A raised surface's shadow in the scheme showing now, as a plain hex: a
 * layer resolves its shadow's colour once, so a dynamic colour there would
 * not follow a change of scheme, and a worklet takes only a plain string.
 */
export const useShadow = (): string => useRoles().shadow;

/** The web's CSS: a phone writes none. */
export const webColors = '';
