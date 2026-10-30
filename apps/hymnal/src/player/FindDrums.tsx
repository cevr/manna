/**
 * The find drums: three dials, hundreds, tens and ones, that dial a hymn's
 * number in the book (`drums.ts`). Each is a `DialView`, so a finger turns
 * and flings it and VoiceOver turns it a step at a time (increment and
 * decrement). A drum's detent is felt always and heard only while the
 * player's Sound switch is on (`drumTell`).
 */

import { RegistryContext, useAtomMount } from '@effect/atom-react';
import { type ReactNode, use, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { color } from '~/color';
import { CueProvider, useCue } from '~/feel/cue';
import { settings } from '~/store';

import { PanelRow } from './DialPanel';
import { DialView, MOST_SCALE } from './DialView';
import { digitsOf, type Drum, DRUM_ORDER, DRUMS, drumTell, turn } from './drums';

/** Each drum's name, as VoiceOver says it and as the small word at its left. */
const NAMES: Readonly<Record<Drum, { readonly label: string; readonly title: string }>> = {
  hundreds: { label: 'Hundreds', title: '100s' },
  tens: { label: 'Tens', title: '10s' },
  ones: { label: 'Ones', title: '1s' },
};

/** Each drum's digits, in turn order. */
const STOPS: Readonly<Record<Drum, ReadonlyArray<number>>> = {
  hundreds: Array.from({ length: DRUMS.hundreds.count }, (_, digit) => digit),
  tens: Array.from({ length: DRUMS.tens.count }, (_, digit) => digit),
  ones: Array.from({ length: DRUMS.ones.count }, (_, digit) => digit),
};

/** The drums on `number`; `onDial` hears each number a turn dials, held to the book. */
export function FindDrums({
  number,
  onDial,
}: {
  readonly number: number;
  readonly onDial: (number: number) => void;
}): ReactNode {
  const registry = use(RegistryContext);
  const outer = useCue();
  // The Sound switch stays mounted, so each detent reads it from the registry's cache.
  useAtomMount(settings.sound);
  const [tell] = useState(() => drumTell(outer, () => registry.get(settings.sound)));
  const digits = digitsOf(number);
  return (
    <CueProvider value={tell}>
      {DRUM_ORDER.map((drum, k) => (
        <PanelRow key={drum} fromBottom={DRUM_ORDER.length - 1 - k}>
          <DialView
            dial={drum}
            testID={`drum-${drum}`}
            label={NAMES[drum].label}
            title={NAMES[drum].title}
            stops={STOPS[drum]}
            index={digits[drum]}
            wrap={DRUMS[drum].wrap}
            // The whole number in `said` redraws every drum on each dial, so each `onTurn` holds it fresh.
            said={`${digits[drum]}, number ${number}`}
            drawStop={(digit, current) => <Digit digit={digit} current={current} />}
            onTurn={(n) => onDial(turn(number, drum, n))}
          />
        </PanelRow>
      ))}
    </CueProvider>
  );
}

/** A digit in its detent, the current one in the chord colour. */
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
  digit: { fontSize: 17, fontWeight: '600', color: color.muted },
  current: { color: color.chord },
});
