import { useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { StyleSheet, Text } from 'react-native';

import { color } from '~/color';

import { usePlayer } from './context';
import type { HymnPlayer } from './player';

/** Fallback belongs to the held recording, independently of the page's dial. */
export function RecordingNotice({ number }: { readonly number: number }) {
  return Option.match(usePlayer(), {
    onNone: () => <></>,
    onSome: (player) => <Notice player={player} number={number} />,
  });
}

function Notice({ player, number }: { readonly player: HymnPlayer; readonly number: number }) {
  const recording = useAtomValue(player.recording);
  if (!Option.exists(recording, (it) => it.number === number && it.requested !== it.effective))
    return <></>;
  return (
    <Text role="status" aria-live="polite" testID="recording-key-fallback" style={styles.notice}>
      Recording in printed key. Chosen key unavailable. Play retries it.
    </Text>
  );
}

const styles = StyleSheet.create({
  notice: {
    color: color.muted,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
});
