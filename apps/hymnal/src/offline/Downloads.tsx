import { useAtomSet, useAtomValue } from '@effect/atom-react';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { empty } from './cache';
import { Action, progress, send } from './live';

/** Progress redraws only this leaf, never Settings or the hymn pager. */
export function Downloads() {
  const state = AsyncResult.getOrElse(useAtomValue(progress), () => empty);
  const result = useAtomValue(send);
  const ask = useAtomSet(send);
  const accent = useAccent();
  const cue = useCue();
  const busy = state.active + state.queued > 0;
  let allLabel = 'Download all recordings';
  if (state.paused || state.failed > 0) allLabel = 'Resume download';
  const action = (event: Action) => {
    cue(plain('choose'));
    ask(event);
  };
  return (
    <View style={styles.section}>
      <Text role="heading" aria-level={2} style={styles.heading}>
        Downloads
      </Text>
      <View style={styles.group}>
        <View style={styles.summary}>
          <View
            testID="downloads-progress"
            accessible
            role="progressbar"
            aria-label="Downloaded printed-key recordings"
            aria-valuemin={0}
            aria-valuemax={695}
            aria-valuenow={state.printed}
            aria-valuetext={`${state.printed} of 695 recordings`}
          >
            <Text aria-hidden style={styles.label}>{`${state.printed} of 695 recordings`}</Text>
          </View>
          <Text
            testID="downloads-size"
            style={styles.detail}
          >{`${state.saved} saved · ${state.bytes.toLocaleString()} bytes`}</Text>
          {busy && (
            <Text
              testID="downloads-active"
              style={styles.detail}
            >{`${state.active} downloading · ${state.queued} queued · ${state.partialBytes.toLocaleString()} partial bytes`}</Text>
          )}
          {state.paused && (
            <Text style={styles.detail}>
              Download cancelled. Resume to keep completed recordings.
            </Text>
          )}
          {(state.failed > 0 || AsyncResult.isFailure(result)) && (
            <Text role="alert" style={styles.detail}>
              Some recordings could not be saved. Check storage and connection, then retry.
            </Text>
          )}
        </View>
        <Pressable
          role="button"
          aria-label="Download all recordings"
          disabled={busy}
          onPress={() => action(Action.All())}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={[styles.label, { color: accent }]}>{allLabel}</Text>
        </Pressable>
        {busy && (
          <Pressable
            role="button"
            aria-label="Cancel download"
            onPress={() => action(Action.Cancel())}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={[styles.label, { color: accent }]}>Cancel download</Text>
          </Pressable>
        )}
        <Pressable
          role="button"
          aria-label="Delete downloads"
          onPress={() => action(Action.Delete())}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={[styles.label, { color: accent }]}>Delete downloads</Text>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { marginTop: 16, gap: 8 },
  heading: { marginLeft: 16, fontSize: 13, color: color.muted, textTransform: 'uppercase' },
  group: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  summary: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  row: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  label: { fontSize: 17, color: color.ink },
  detail: { fontSize: 13, color: color.muted },
  pressed: { backgroundColor: color.soft },
});
