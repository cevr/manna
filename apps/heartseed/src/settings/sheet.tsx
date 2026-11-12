/**
 * Home's Settings sheet: React Native's own `Modal` as a page sheet that
 * slides up over home, which VoiceOver reads as a modal. Home mounts it only
 * while it is open, so a closed sheet leaves nothing behind. On iOS a swipe
 * down closes it (`allowSwipeDismissal`), as `Done` and the web's Escape do
 * (`onRequestClose`); its container is filled with the scheme's ground, so
 * no white shows in dark. Its root (`settings`) holds a header fixed above
 * the scroll view, the one heading `Settings` and `Done`, wrapping under
 * large text; then, in the scroll view, each choice under its line: the
 * session's minutes (`MinutesChoice`), the voice (`VoiceChoice`, with the
 * natural voice's status line and its `Try again` under the pill) and the
 * appearance (`AppearanceChoice`), each with its line once its stored
 * choice is read, and last `Show the welcome again`, then `About`. A tap
 * of a choice goes through the app's own atoms, so it shows at once, here
 * and under the sheet, and is stored; opening or closing the sheet writes
 * nothing.
 */

import { useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import { appearanceView } from '../app';
import { AppearanceChoice } from '../appearance/choice';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';
import { MinutesChoice, VoiceChoice } from './choices';

/** A button of the sheet: at least 44 pt tall, outlined in ink. */
function SheetButton({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      role="button"
      aria-label={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && look.pressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/** The Settings sheet, open while mounted: `onDone` closes it (`Done`, the swipe down, Escape), `onWelcome` replays the welcome (`Show the welcome again`), `onAbout` shows About. */
export function SettingsSheet({
  onDone,
  onWelcome,
  onAbout,
}: {
  readonly onDone: () => void;
  readonly onWelcome: () => void;
  readonly onAbout: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  const appearanceRead = Option.isSome(AsyncResult.value(useAtomValue(appearanceView)));
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onDone}
      backdropColor={styles.root.backgroundColor}
    >
      <View testID="settings" style={styles.root}>
        <View style={styles.header}>
          <Text role="heading" aria-level={1} style={styles.title}>
            Settings
          </Text>
          <SheetButton label="Done" onPress={onDone} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            look.content,
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          <MinutesChoice line="A day's tending" />
          <VoiceChoice line="Reads new verses aloud" />
          {appearanceRead && (
            <View style={styles.section}>
              <Text style={styles.line}>Appearance</Text>
              <AppearanceChoice />
            </View>
          )}
          <View style={styles.about}>
            <SheetButton label="Show the welcome again" onPress={onWelcome} />
            <SheetButton label="About" onPress={onAbout} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.ground },
    header: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 44,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 8,
    },
    title: { fontFamily: face, fontSize: 28, fontWeight: '700', color: color.ink },
    scroll: { flex: 1 },
    content: { paddingTop: 8 },
    section: { gap: 10 },
    line: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    about: { alignItems: 'flex-start', gap: 12 },
    button: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: color.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
  }),
);
