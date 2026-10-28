import { useAtomSet, useAtomValue } from '@effect/atom-react';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';
import bundled from 'virtual:hymnal-timing';
import { Option } from 'effect';
import { empty } from './cache';
import { estimateMegabytes } from './estimate';
import { Action, progress, send } from './live';

// Decoded once, on the first Settings open, not at app start.
let estimated = Option.none<number>();
const estimateTotal = () =>
  Option.getOrElse(estimated, () => {
    const value = estimateMegabytes(bundled);
    estimated = Option.some(value);
    return value;
  });

/** Progress redraws only this leaf, never Settings or the hymn pager. */
export function Downloads() {
  const state = AsyncResult.getOrElse(useAtomValue(progress), () => empty);
  const result = useAtomValue(send);
  const ask = useAtomSet(send);
  const accent = useAccent();
  const cue = useCue();
  const busy = state.active + state.queued > 0;
  const [confirming, confirm] = useState(false);
  const estimate = estimateTotal();
  const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(2);
  let failure =
    'Some recordings could not be saved. Check the connection, then choose Download all recordings to retry.';
  if (state.storage)
    failure =
      'Downloads stopped because storage is unavailable. Free space, then choose Download all recordings to retry.';
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
            aria-label={`${state.saved} saved · ${state.bytes.toLocaleString()} bytes · ${megabytes(state.bytes)} MB`}
            style={styles.detail}
          >{`${state.saved} saved · ${megabytes(state.bytes)} MB`}</Text>
          {busy && (
            <Text
              testID="downloads-active"
              aria-label={`${state.active} downloading · ${state.queued} queued · ${state.partialBytes.toLocaleString()} partial bytes · ${megabytes(state.partialBytes)} MB`}
              style={styles.detail}
            >{`${state.active} downloading · ${state.queued} queued · ${megabytes(state.partialBytes)} MB partial`}</Text>
          )}
          {state.indexing && (
            <Text testID="downloads-indexing" style={styles.detail}>
              Checking saved recordings. Download all recordings starts when the check ends.
            </Text>
          )}
          {state.paused && (
            <Text style={styles.detail}>
              Download paused. Download all recordings resumes unfinished saves and keeps completed
              recordings.
            </Text>
          )}
          {(state.failed > 0 || state.storage || AsyncResult.isFailure(result)) && (
            <Text role="alert" style={styles.detail}>
              {failure}
            </Text>
          )}
          <Text
            style={styles.detail}
          >{`Estimated total: ${estimate.toLocaleString()} MB for 695 recordings. Actual size varies. Downloads use mobile data on mobile networks.`}</Text>
          {Platform.OS === 'web' && (
            <Text style={styles.detail}>
              Your browser may remove downloaded recordings. Storage protection is requested when
              you choose Download all recordings. You can download them again if needed.
            </Text>
          )}
          {Platform.OS === 'ios' && (
            <Text style={styles.detail}>
              Downloaded recordings stay on this device and are excluded from iCloud backup.
            </Text>
          )}
        </View>
        <Pressable
          role="button"
          aria-label="Download all recordings"
          onPress={() => action(Action.All())}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={[styles.label, { color: accent }]}>Download all recordings</Text>
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
          onPress={() => confirm(true)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={[styles.label, { color: accent }]}>Delete downloads</Text>
        </Pressable>
        {confirming && (
          <View style={styles.summary}>
            <Text style={styles.detail}>
              Delete all downloaded recordings and partial saves from this app?
            </Text>
            <Pressable
              role="button"
              aria-label="Confirm delete downloads"
              onPress={() => {
                confirm(false);
                action(Action.Delete());
              }}
              style={styles.row}
            >
              <Text style={[styles.label, { color: accent }]}>Confirm delete downloads</Text>
            </Pressable>
            <Pressable
              role="button"
              aria-label="Keep downloads"
              onPress={() => confirm(false)}
              style={styles.row}
            >
              <Text style={[styles.label, { color: accent }]}>Keep downloads</Text>
            </Pressable>
          </View>
        )}
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
