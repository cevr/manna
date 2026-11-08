import { Effect, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { useEffect, useState } from 'react';
import { Appearance, ScrollView, StyleSheet, Text } from 'react-native';

import { APPEARANCE_KEY, appearanceOf, schemeOf } from '../../src/appearance';
import { systemAppearance } from '../../src/appearance/host';
import { themed, useScheme } from '../../src/look';
import { store } from '../../src/store';
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

/** The appearance key's text in the app's store, `none` when missing, or the read's failure. */
const readStored = KeyValueStore.KeyValueStore.pipe(
  Effect.flatMap((kv) => kv.get(APPEARANCE_KEY)),
  Effect.map((text) => Option.fromUndefinedOr(text)),
  Effect.provide(store),
);

/**
 * A development probe for the live check of the look (verify-heartseed,
 * `appearance-system`, `appearance-choice`, `appearance-kept`): the
 * system's own appearance (the last one reported with no interface style
 * set, `systemAppearance`), the appearance key's text in the store, the
 * interface style React Native reports (`Appearance.getColorScheme`), the
 * scheme the screens are drawn in under the stored appearance (`schemeOf`),
 * that scheme's ground and the face, one line each, repainted when the
 * system changes, with no tap. A release build renders nothing.
 */
export default function ThemeProbe() {
  useScheme();
  const [stored, setStored] = useState(Option.none<Option.Option<string>>());
  useEffect(() => {
    void Effect.runPromise(
      readStored.pipe(
        Effect.orElseSucceed(() => Option.some('<read failed>')),
        Effect.asSome,
      ),
    ).then(setStored);
  }, []);
  if (!dev) return;
  const known = Option.flatten(stored);
  const system = Option.getOrElse(Option.fromNullishOr(systemAppearance()), () => 'none');
  const native = Option.getOrElse(Option.fromNullishOr(Appearance.getColorScheme()), () => 'none');
  const scheme = schemeOf(appearanceOf(Option.getOrUndefined(known)), systemAppearance());
  const lines = [
    `system ${system}`,
    `stored ${Option.match(stored, {
      onNone: () => 'reading',
      onSome: (text) => Option.getOrElse(text, () => 'none'),
    })}`,
    `native ${native}`,
    `scheme ${scheme}`,
    `ground ${theme[scheme].ground}`,
    `face ${face}`,
  ];
  return (
    <ScrollView contentContainerStyle={sheets[scheme].content}>
      {lines.map((line) => (
        <Text key={line.split(' ')[0]} style={sheets[scheme].line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}
