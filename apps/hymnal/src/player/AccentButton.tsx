import { Match } from 'effect';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAccent, useOnAccent, usePressed } from '~/color';

export interface AccentButtonProps {
  readonly title: string;
  readonly label: string;
  readonly onPress: () => void;
}

export function AccentButton({ title, label, onPress }: AccentButtonProps) {
  const rest = { fill: useAccent(), text: useOnAccent() };
  const held = usePressed();
  const look = (pressed: boolean) =>
    Match.value(pressed).pipe(
      Match.when(true, () => held),
      Match.orElse(() => rest),
    );
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: look(pressed).fill }]}
    >
      {({ pressed }) => <Text style={[styles.title, { color: look(pressed).text }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '600' },
});
