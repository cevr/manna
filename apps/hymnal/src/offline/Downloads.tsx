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
import {
  activeLabel,
  activeText,
  busyOf,
  CANCEL,
  CONFIRM,
  CONFIRM_QUESTION,
  DELETE,
  DOWNLOAD_ALL,
  estimateText,
  failureOf,
  INDEXING,
  IOS_NOTE,
  KEEP,
  PAUSED,
  PROGRESS_LABEL,
  progressText,
  RECORDINGS,
  sizeLabel,
  sizeText,
  WEB_NOTE,
} from './words';

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
  const busy = busyOf(state);
  const [confirming, confirm] = useState(false);
  const estimate = estimateTotal();
  const failure = failureOf(state);
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
            aria-label={PROGRESS_LABEL}
            aria-valuemin={0}
            aria-valuemax={RECORDINGS}
            aria-valuenow={state.printed}
            aria-valuetext={progressText(state)}
          >
            <Text aria-hidden style={styles.label}>
              {progressText(state)}
            </Text>
          </View>
          <Text testID="downloads-size" aria-label={sizeLabel(state)} style={styles.detail}>
            {sizeText(state)}
          </Text>
          {busy && (
            <Text testID="downloads-active" aria-label={activeLabel(state)} style={styles.detail}>
              {activeText(state)}
            </Text>
          )}
          {state.indexing && (
            <Text testID="downloads-indexing" style={styles.detail}>
              {INDEXING}
            </Text>
          )}
          {state.paused && <Text style={styles.detail}>{PAUSED}</Text>}
          {(state.failed > 0 || state.storage || AsyncResult.isFailure(result)) && (
            <Text role="alert" style={styles.detail}>
              {failure}
            </Text>
          )}
          <Text style={styles.detail}>{estimateText(estimate)}</Text>
          {Platform.OS === 'web' && <Text style={styles.detail}>{WEB_NOTE}</Text>}
          {Platform.OS === 'ios' && <Text style={styles.detail}>{IOS_NOTE}</Text>}
        </View>
        <Pressable
          role="button"
          aria-label={DOWNLOAD_ALL}
          onPress={() => action(Action.All())}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={[styles.label, { color: accent }]}>{DOWNLOAD_ALL}</Text>
        </Pressable>
        {busy && (
          <Pressable
            role="button"
            aria-label={CANCEL}
            onPress={() => action(Action.Cancel())}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={[styles.label, { color: accent }]}>{CANCEL}</Text>
          </Pressable>
        )}
        <Pressable
          role="button"
          aria-label={DELETE}
          onPress={() => confirm(true)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text testID="downloads-delete" style={[styles.label, styles.alert]}>
            {DELETE}
          </Text>
        </Pressable>
        {confirming && (
          <View style={styles.summary}>
            <Text style={styles.detail}>{CONFIRM_QUESTION}</Text>
            <Pressable
              role="button"
              aria-label={CONFIRM}
              onPress={() => {
                confirm(false);
                action(Action.Delete());
              }}
              style={styles.row}
            >
              <Text style={[styles.label, styles.alert]}>{CONFIRM}</Text>
            </Pressable>
            <Pressable
              role="button"
              aria-label={KEEP}
              onPress={() => confirm(false)}
              style={styles.row}
            >
              <Text style={[styles.label, { color: accent }]}>{KEEP}</Text>
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
  alert: { color: color.alert },
  detail: { fontSize: 13, color: color.muted },
  pressed: { backgroundColor: color.soft },
});
