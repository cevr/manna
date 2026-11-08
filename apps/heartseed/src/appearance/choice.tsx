/**
 * The reader's appearance as About offers it: a radio group named
 * `Appearance` holding System, Light and Dark in that order, each at least
 * 44 pt tall, the chosen one checked and filled in ink, its word in
 * `onInk`, the others on `card` in ink. A tap shows its scheme at once and
 * stores the word (`chooseAppearance`). It shows once the stored
 * appearance is read, so its first frame checks the one read.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APPEARANCES, type Choice } from '../appearance';
import { appearanceView, chooseAppearance } from '../app';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';

/** Each appearance as its radio says it; an appearance with no word here fails the typecheck. */
const WORDS = { system: 'System', light: 'Light', dark: 'Dark' } as const satisfies Record<
  Choice,
  string
>;

/** The appearance radios, over the stored appearance and its own tap. */
export function AppearanceChoice() {
  const look = useLook();
  const styles = useThemed(sheets);
  const shown = AsyncResult.value(useAtomValue(appearanceView));
  const onChoose = useAtomSet(chooseAppearance);
  return Option.match(shown, {
    onNone: () => false,
    onSome: (chosen) => (
      <View role="radiogroup" aria-label="Appearance" style={styles.group}>
        {APPEARANCES.map((choice) => {
          const on = chosen === choice;
          return (
            <Pressable
              key={choice}
              role="radio"
              aria-label={WORDS[choice]}
              aria-checked={on}
              onPress={() => onChoose(choice)}
              style={({ pressed }) => [styles.radio, on && styles.on, pressed && look.pressed]}
            >
              <Text style={[styles.word, on && styles.onWord]}>{WORDS[choice]}</Text>
            </Pressable>
          );
        })}
      </View>
    ),
  });
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    group: { flexDirection: 'row', gap: 8 },
    radio: {
      flex: 1,
      minHeight: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color.card,
    },
    on: { backgroundColor: color.ink },
    word: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    onWord: { color: color.onInk },
  }),
);
