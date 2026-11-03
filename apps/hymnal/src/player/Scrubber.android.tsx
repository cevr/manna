import { Duration, Option } from 'effect';
import { One } from 'one';
import { StyleSheet } from 'react-native';

import { useAccent } from '~/color';

import { type ScrubberProps, useCommitAtRest, useScrub } from './scrub';

const rest = Duration.millis(300);

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
  useCommitAtRest(scrub, rest);
  return (
    <One.Android.Slider
      accessibilityLabel="Position"
      accessibilityValue={{ text: scrub.said }}
      value={scrub.value}
      onValueChange={scrub.change}
      minimumValue={0}
      maximumValue={Option.getOrElse(
        Option.liftPredicate(scrub.max, (max) => max > 0),
        () => 1,
      )}
      disabled={scrub.still}
      colors={{ thumbColor: accent, activeTrackColor: accent }}
      style={styles.slider}
    />
  );
}

const styles = StyleSheet.create({ slider: { height: 40 } });
