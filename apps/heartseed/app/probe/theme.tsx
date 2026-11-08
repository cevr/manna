import { Option } from 'effect';
import { Appearance, ScrollView, StyleSheet, Text } from 'react-native';

import { themed, useScheme, useThemed } from '../../src/look';
import { face, theme } from '../../src/theme';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

const sheets = themed((roles, each) =>
  StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingTop: 80,
      paddingHorizontal: 24,
      gap: 8,
      backgroundColor: roles.ground,
    },
    line: { fontSize: 17, fontFamily: each, color: roles.ink },
  }),
);

/**
 * A development probe for the live check of the look (verify-heartseed,
 * `appearance-system`): the system's appearance as React Native reports
 * it, the scheme the screens are drawn in (`useScheme`), that scheme's
 * ground and the face, one line each, repainted when the system changes,
 * with no tap. A release build renders nothing.
 */
export default function ThemeProbe() {
  const scheme = useScheme();
  const styles = useThemed(sheets);
  if (!dev) return;
  const system = Option.getOrElse(Option.fromNullishOr(Appearance.getColorScheme()), () => 'none');
  const lines = [
    `system ${system}`,
    `scheme ${scheme}`,
    `ground ${theme[scheme].ground}`,
    `face ${face}`,
  ];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {lines.map((line) => (
        <Text key={line.split(' ')[0]} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}
