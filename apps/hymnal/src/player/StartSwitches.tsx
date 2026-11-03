import { useAtom } from '@effect/atom-react';
import { memo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { color } from '~/color';
import { settings } from '~/store';

export const StartSwitches = memo(function StartSwitches() {
  const [intro, setIntro] = useAtom(settings.intro);
  const [click, setClick] = useAtom(settings.click);
  return (
    <View testID="start" role="group" aria-label="Start" style={styles.section}>
      <View style={styles.row}>
        <View style={styles.text} aria-hidden>
          <Text style={styles.label} dynamicTypeRamp="body">
            Intro
          </Text>
          <Text style={styles.caption} dynamicTypeRamp="footnote">
            The recording’s introduction, or a count-in with Sound off.
          </Text>
        </View>
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
          accessibilityState={{ disabled: !intro }}
          aria-disabled={!intro}
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
