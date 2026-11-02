/**
 * The player sheet's `Start` group: how Play begins a hymn from its start,
 * the same for every hymn (`settings.intro`, `settings.click`).
 *
 * - `Intro`, on by default: with Sound on the recording plays from 0, its
 *   introduction first; with Sound off the score clock counts one bar of the
 *   hymn's meter in (`countin.ts`) before the first sung line. Off, both
 *   start at the first sung line.
 * - `Click`, off by default: each beat of the count-in is told as a `beat`
 *   cue, heard while `Sounds and haptics` is on. It does nothing with
 *   `Intro` off, so it is disabled then, its value kept.
 *
 * A change while a hymn plays waits for the next Play.
 */

import { useAtom } from '@effect/atom-react';
import { memo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { color } from '~/color';
import { settings } from '~/store';

export const StartSwitches = memo(function StartSwitches() {
  const [intro, setIntro] = useAtom(settings.intro);
  const [click, setClick] = useAtom(settings.click);
  return (
    <View role="group" aria-label="Start" style={styles.section}>
      <View style={styles.row}>
        <View style={styles.text} aria-hidden>
          <Text style={styles.label} dynamicTypeRamp="body">
            Intro
          </Text>
          <Text style={styles.caption} dynamicTypeRamp="footnote">
            The recording’s introduction, or a count-in with Sound off.
          </Text>
        </View>
        {/* React Native's Switch reads `accessibilityLabel` on every platform. */}
        <Switch accessibilityLabel="Intro" value={intro} onValueChange={setIntro} />
      </View>
      <View style={styles.row}>
        <View style={styles.text} aria-hidden>
          <Text style={[styles.label, !intro && styles.off]} dynamicTypeRamp="body">
            Click
          </Text>
          <Text style={styles.caption} dynamicTypeRamp="footnote">
            A click on each beat of the count-in.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Click"
          value={click}
          disabled={!intro}
          onValueChange={setClick}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { paddingTop: 8, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: 16,
  },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 17, color: color.ink },
  off: { color: color.muted },
  caption: { fontSize: 13, color: color.muted },
});
