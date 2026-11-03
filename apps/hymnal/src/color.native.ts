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

type Fill = 'accent' | 'onAccent' | 'pressed' | 'onPressed';

const useRoles = (): Roles =>
  Match.value(useColorScheme()).pipe(
    Match.when('dark', () => theme.dark),
    Match.orElse(() => theme.light),
  );

export const useAccent = (): ColorValue => useRoles().accent;

export const useOnAccent = (): ColorValue => useRoles().onAccent;

export const usePressed = () => {
  const roles = useRoles();
  return { fill: roles.pressed, text: roles.onPressed };
};

export const webColors = '';
