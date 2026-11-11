import { Pressable, StyleSheet, Text } from 'react-native';

import { useButton } from '~/color';
import { plain, useCue } from '~/feel/cue';

import { Command, type Track } from './player';

/** Start the page's hymn in place of the hymn the player holds: a word in the button's role. */
export function PlayPage({
  track,
  send,
}: {
  readonly track: Track;
  readonly send: (command: Command) => void;
}) {
  const tint = useButton();
  const cue = useCue();
  return (
    <Pressable
      role="button"
      aria-label={`Play hymn ${track.number}`}
      onPress={() => {
        cue(plain('play'));
        send(Command.Start({ track }));
      }}
      style={styles.compact}
    >
      <Text style={[styles.text, { color: tint }]}>{`Play ${track.number}`}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compact: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 4 },
  text: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
