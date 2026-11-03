import { Match } from 'effect';
import { StyleSheet, Text } from 'react-native';

import { useAccent } from '~/color';

export function StarMark({ on }: { readonly on: boolean }) {
  const accent = useAccent();
  return (
    <Text aria-hidden style={[styles.mark, { color: accent }]}>
      {starOf(on)}
    </Text>
  );
}

const starOf = Match.type<boolean>().pipe(
  Match.when(true, () => '★'),
  Match.orElse(() => '☆'),
);

const styles = StyleSheet.create({ mark: { fontSize: 24, lineHeight: 28 } });
