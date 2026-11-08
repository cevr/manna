/**
 * About as the reader meets it: the root's fourth screen, opened from the
 * field's `About`. A bar fixed above the scroll view holds the one way back,
 * `‹ Your field`, so it is on screen without a scroll; the scroll view
 * holds the one heading, the natural voice's credits (`CREDITS`) and the
 * Apache License 2.0 its vendored code carries, whole, as the bundle reads
 * it (`virtual:heartseed-licence`, never a copy here). Every text is the
 * scheme's ink, so each reads at WCAG AA contrast on the ground. It reads
 * and writes nothing in the store.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import licence from 'virtual:heartseed-licence';

import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';

/** The natural voice's credits, word for word: its model, its voices, its conversion and packaging, and its pronunciations, each with its licence. */
export const CREDITS =
  'Natural voice: Kokoro-82M by hexgrad (Apache-2.0), with its voices af_heart and am_michael. Core ML conversion by laishere (kokoro-coreml, Apache-2.0), packaged by FluidInference (FluidAudio, Apache-2.0). Pronunciations from Misaki by hexgrad (Apache-2.0).';

/** The About screen, with the way back to the field (`onField`). */
export function AboutScreen({ onField }: { readonly onField: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  return (
    <View style={look.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 16 }]}>
        <Pressable
          role="button"
          aria-label="Your field"
          hitSlop={10}
          onPress={onField}
          style={({ pressed }) => [styles.back, pressed && look.pressed]}
        >
          <Text style={styles.backText}>‹ Your field</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          look.content,
          styles.content,
          { paddingTop: 8, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Text role="heading" aria-level={1} style={look.title}>
          About
        </Text>
        <Text testID="about-credits" style={styles.credits}>
          {CREDITS}
        </Text>
        <Text testID="about-licence" style={styles.licence}>
          {licence}
        </Text>
      </ScrollView>
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    bar: { paddingHorizontal: 24, paddingBottom: 8 },
    scroll: { flex: 1 },
    content: { gap: 16 },
    back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    backText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    credits: { fontFamily: face, fontSize: 15, lineHeight: 22, color: color.ink },
    licence: { fontFamily: face, fontSize: 13, lineHeight: 19, color: color.ink },
  }),
);
