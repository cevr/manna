/**
 * A phone's colours. On iOS each role is the theme's pair as one dynamic
 * colour (`DynamicColorIOS`), which follows the app's interface style as the
 * appearance setting sets it. Android has no dynamic colour in React Native,
 * so it keeps the system's own colours until the theme ships as night-mode
 * colour resources.
 */

import { Match } from 'effect';
import {
  type ColorValue,
  DynamicColorIOS,
  Platform,
  PlatformColor,
  useColorScheme,
} from 'react-native';

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
    glass: PlatformColor('?android:attr/colorControlHighlight'),
    onGlass: PlatformColor('?android:attr/colorForeground'),
    onGlassMuted: PlatformColor('?android:attr/colorForeground'),
    glassChosen: PlatformColor('?android:attr/colorForeground'),
    onGlassChosen: PlatformColor('?android:attr/colorBackground'),
  }),
})() satisfies Record<Exclude<keyof Roles, Fill>, ColorValue>;

/** The roles a screen reads through a hook: the accent, the button and their fills' text, pressed or not, and the selected fill. */
type Fill = 'accent' | 'onAccent' | 'pressed' | 'onPressed' | 'button' | 'onButton' | 'selected';

/** The theme's roles in the scheme showing now. */
const useRoles = (): Roles =>
  Match.value(useColorScheme()).pipe(
    Match.when('dark', () => theme.dark),
    Match.orElse(() => theme.light),
  );

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

/** The web's CSS: a phone writes none. */
export const webColors = '';
