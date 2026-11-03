import { RegistryContext, useAtomMount } from '@effect/atom-react';
import { type ReactNode, use, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color } from '~/color';
import { CueProvider, useCue } from '~/feel/cue';
import { settings } from '~/store';

import { PanelRow, ROW_GAP } from './DialPanel';
import { DialView, MOST_SCALE } from './DialView';
import { digitsOf, type Drum, DRUM_ORDER, DRUMS, drumTell, turn } from './drums';

const LABELS: Readonly<Record<Drum, string>> = {
  hundreds: 'Hundreds',
  tens: 'Tens',
  ones: 'Ones',
};

const STOPS: Readonly<Record<Drum, ReadonlyArray<number>>> = {
  hundreds: Array.from({ length: DRUMS.hundreds.count }, (_, digit) => digit),
  tens: Array.from({ length: DRUMS.tens.count }, (_, digit) => digit),
  ones: Array.from({ length: DRUMS.ones.count }, (_, digit) => digit),
};

export function FindDrums({
  number,
  onDial,
}: {
  readonly number: number;
  readonly onDial: (number: number) => void;
}): ReactNode {
  const registry = use(RegistryContext);
  const outer = useCue();
  useAtomMount(settings.sound);
  const [tell] = useState(() => drumTell(outer, () => registry.get(settings.sound)));
  const digits = digitsOf(number);
  return (
    <CueProvider value={tell}>
      <PanelRow fromBottom={0}>
        <View style={styles.drums}>
          {DRUM_ORDER.map((drum) => (
            <View key={drum} style={styles.drum}>
              <DialView
                dial={drum}
                axis="column"
                testID={`drum-${drum}`}
                label={LABELS[drum]}
                stops={STOPS[drum]}
                index={digits[drum]}
                wrap={DRUMS[drum].wrap}
                said={`${digits[drum]}, number ${number}`}
                drawStop={(digit, current) => <Digit digit={digit} current={current} />}
                onTurn={(n) => onDial(turn(number, drum, n))}
              />
            </View>
          ))}
        </View>
      </PanelRow>
    </CueProvider>
  );
}

function Digit({ digit, current }: { readonly digit: number; readonly current: boolean }) {
  return (
    <Text
      style={[styles.digit, current && styles.current]}
      numberOfLines={1}
      maxFontSizeMultiplier={MOST_SCALE}
    >
      {digit}
    </Text>
  );
}

const styles = StyleSheet.create({
  drums: { flexDirection: 'row', gap: ROW_GAP },
  drum: { flex: 1, minWidth: 0 },
  digit: { fontSize: 17, fontWeight: '600', color: color.muted },
  current: { color: color.chord },
});
