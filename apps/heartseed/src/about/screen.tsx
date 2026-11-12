/**
 * About as the reader meets it, opened from the Settings sheet's `About`
 * on home: a small page with the app's name, its version (`package.json`'s,
 * as the bundle reads it) and one row, `Licences`, which shows the
 * licences on a page of their own. No other way reaches the licences.
 *
 * Each page holds its one way back in a bar fixed above its content, on
 * screen without a scroll: About's `‹ Your field`, the licences' `‹ About`.
 * The licences' scroll view holds the natural voice's credits (`CREDITS`)
 * and the Apache License 2.0 its vendored code carries, whole, as the
 * bundle reads it (`virtual:heartseed-licence`, never a copy here). Every
 * text is the scheme's ink, so each reads at WCAG AA contrast on the
 * ground. Neither page writes anything.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import licence from 'virtual:heartseed-licence';

import { version } from '../../package.json';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';

/** The natural voice's credits, word for word: its model, its voices, its conversion and packaging, and its pronunciations, each with its licence. */
export const CREDITS =
  'Natural voice: Kokoro-82M by hexgrad (Apache-2.0), with its voices af_heart and bm_george. Core ML conversion by laishere (kokoro-coreml, Apache-2.0), packaged by FluidInference (FluidAudio, Apache-2.0). Pronunciations from Misaki by hexgrad (Apache-2.0).';

/** A page's bar: its one way back, named `label`, shown `‹ <label>`. */
function Back({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 16 }]}>
      <Pressable
        role="button"
        aria-label={label}
        hitSlop={10}
        onPress={onPress}
        style={({ pressed }) => [styles.back, pressed && look.pressed]}
      >
        <Text style={styles.backText}>‹ {label}</Text>
      </Pressable>
    </View>
  );
}

/** The About page, with the way back to the field (`onField`) and the row to the licences (`onLicences`). */
export function AboutScreen({
  onField,
  onLicences,
}: {
  readonly onField: () => void;
  readonly onLicences: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <View style={look.screen}>
      <Back label="Your field" onPress={onField} />
      <View style={[look.content, styles.content]}>
        <Text role="heading" aria-level={1} style={look.title}>
          About
        </Text>
        <Text testID="about-name" style={styles.name}>
          Heartseed
        </Text>
        <Text testID="about-version" style={styles.credits}>
          Version {version}
        </Text>
        <Pressable
          role="button"
          aria-label="Licences"
          onPress={onLicences}
          style={({ pressed }) => [styles.row, pressed && look.pressed]}
        >
          <Text style={styles.rowText}>Licences</Text>
          <Text style={styles.rowText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The licences' page, with the way back to About (`onAbout`). */
export function LicencesScreen({ onAbout }: { readonly onAbout: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  return (
    <View style={look.screen}>
      <Back label="About" onPress={onAbout} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          look.content,
          styles.content,
          { paddingTop: 8, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Text role="heading" aria-level={1} style={look.title}>
          Licences
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
    content: { gap: 16, paddingTop: 8 },
    back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    backText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    name: { fontFamily: face, fontSize: 20, fontWeight: '700', color: color.ink },
    credits: { fontFamily: face, fontSize: 15, lineHeight: 22, color: color.ink },
    licence: { fontFamily: face, fontSize: 13, lineHeight: 19, color: color.ink },
    row: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: color.ink,
    },
    rowText: { fontFamily: face, fontSize: 17, color: color.ink },
  }),
);
