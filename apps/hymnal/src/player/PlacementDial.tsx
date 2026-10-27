import { useAtom, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { memo, use, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { color } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { hasChords } from '~/hymns/chords';
import { placements } from '~/settings';
import { ChordReaderContext } from './Dials';
import { DialPanel } from './DialPanel';
import { DialView, MOST_SCALE } from './DialView';

const marks = placements.map((choice) => choice.mark);

/** One hymn's anchors; an explicit clear resumes the global choice. No player subscription. */
export const PlacementDial = memo(function PlacementDial({ number }: { readonly number: number }) {
  const reader = use(ChordReaderContext);
  const global = useAtomValue(reader.placement);
  const [own, setOwn] = useAtom(reader.placementFor(number));
  const effective = useAtomValue(reader.effectivePlacement(number));
  const index = placements.findIndex((choice) => choice.value === effective);
  const selected = placements[index] ?? placements[0];
  const globalLabel = placements.find((choice) => choice.value === global)?.label;
  const cue = useCue();
  const generation = useRef(0);
  const [resets, reset] = useState(0);
  const epoch = generation.current;
  const inherit = () => {
    // Retire the gesture owner before writing. A queued detent from the old
    // dial cannot replace the clear, even before React mounts the new dial.
    generation.current += 1;
    reset(generation.current);
    setOwn('inherit');
    cue(plain('reset'));
  };
  if (!Option.exists(reader.book.of(number), hasChords)) return <></>;
  return (
    <View style={styles.section}>
      <Text role="heading" aria-level={2} style={styles.heading}>
        Chord placement
      </Text>
      <DialPanel>
        <DialView
          key={`${number}:${resets}`}
          dial="placement"
          testID="dial-placement"
          label="Chord placement"
          title="PLACE"
          stops={marks}
          index={index}
          wrap={false}
          said={selected?.label ?? ''}
          drawStop={(label, current) => (
            <Text
              aria-hidden
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={MOST_SCALE}
              style={[styles.mark, current && styles.current]}
            >
              {label}
            </Text>
          )}
          onTurn={(to) => {
            if (epoch !== generation.current) return;
            const choice = placements[Math.min(2, Math.max(0, to))];
            if (choice) setOwn(choice.value);
          }}
          onReset={inherit}
        />
      </DialPanel>
      <Pressable
        role="button"
        aria-label="Use global chord placement"
        aria-pressed={own === 'inherit'}
        accessibilityState={Platform.select({ web: {}, default: { selected: own === 'inherit' } })}
        onPress={inherit}
        style={({ pressed }) => [styles.inherit, pressed && styles.pressed]}
      >
        <Text style={styles.label}>Use global</Text>
        <Text style={styles.value}>
          {(own === 'inherit' && '✓ ') || ''}
          {globalLabel}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: 8 },
  heading: { fontSize: 13, color: color.muted },
  mark: { fontSize: 12, color: color.muted },
  current: { color: color.chord },
  inherit: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: { fontSize: 15, color: color.ink },
  value: { fontSize: 13, color: color.muted, flexShrink: 1 },
  pressed: { opacity: 0.6 },
});
