import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, type PanGesture, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';

import {
  crossings,
  GUTTER,
  LABEL_LINE,
  LABEL_SCALE,
  LABEL_SIZE,
  labelAt,
  labelHeight,
  labelsOf,
  type Mark,
  markAt,
  railShift,
} from './rail-marks';

const LABELS = 6;

const BUBBLE = 56;

export interface RailHold {
  readonly gesture: PanGesture;
  readonly at: SharedValue<number>;
  readonly y: SharedValue<number>;
  readonly height: SharedValue<number>;
  readonly shift: SharedValue<number>;
}

export function useRail({
  marks,
  scroll,
  rest,
  quiet,
  felt,
  onMark,
}: {
  readonly marks: ReadonlyArray<Mark>;
  readonly scroll: SharedValue<number>;
  readonly rest: number;
  readonly quiet: SharedValue<boolean>;
  readonly felt: SharedValue<number>;
  readonly onMark: (mark: Mark) => void;
}): RailHold {
  const cue = useCue();
  const at = useSharedValue(-1);
  const y = useSharedValue(0);
  const height = useSharedValue(0);
  const shift = useDerivedValue(() => railShift(rest, scroll.value));
  const held = useSharedValue<ReadonlyArray<Mark>>(marks);
  useEffect(() => {
    held.value = marks;
  }, [held, marks]);
  const tick = (count: number) => {
    for (let k = 0; k < count; k += 1) cue(plain('rail-tick'));
  };
  const to = (touch: number) => {
    'worklet';
    const all = held.value;
    const length = Math.max(0, height.value - shift.value);
    const now = markAt(touch, length, all.length);
    y.value = Math.min(length, Math.max(0, touch));
    const mark = all[now];
    // oxlint-disable-next-line effect/noNullish -- a worklet reads an array's place as it is.
    if (now === at.value || mark === undefined) return;
    const before = all[at.value];
    let ticks = 0;
    // oxlint-disable-next-line effect/noNullish -- the first hymn of a touch has none before it.
    if (before !== undefined) ticks = crossings(before.section, mark.section);
    at.value = now;
    felt.value = mark.section;
    onMark(mark);
    if (ticks > 0) scheduleOnRN(tick, ticks);
  };
  const gesture = usePanGesture({
    testID: 'rail',
    enabled: marks.length > 0,
    minDistance: 0,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    onBegin: ({ y: touch }) => {
      'worklet';
      quiet.value = true;
      to(touch);
    },
    onUpdate: ({ y: touch }) => {
      'worklet';
      if (at.value >= 0) to(touch);
    },
    onFinalize: () => {
      'worklet';
      at.value = -1;
      quiet.value = false;
    },
  });
  return { gesture, at, y, height, shift };
}

export function Rail({
  hold,
  marks,
  sections,
  top,
  bottom,
}: {
  readonly hold: RailHold;
  readonly marks: ReadonlyArray<Mark>;
  readonly sections: ReadonlyArray<string>;
  readonly top: number;
  readonly bottom: number;
}) {
  const accent = useAccent();
  const { fontScale } = useWindowDimensions();
  const box = labelHeight(fontScale);
  const shifted = useAnimatedStyle(() => ({ top: hold.shift.value }));
  const thumb = useAnimatedStyle(() => ({
    opacity: Math.min(1, hold.at.value + 1),
    transform: [{ translateY: hold.y.value - THUMB / 2 }],
  }));
  return (
    <>
      <View
        pointerEvents="box-none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(event) => {
          hold.height.value = event.nativeEvent.layout.height;
        }}
        style={[styles.gutter, { top, bottom }]}
      >
        <GestureDetector gesture={hold.gesture}>
          <Animated.View testID="rail" style={[styles.rail, shifted]}>
            {labelsOf(marks.length, LABELS).map((index) => (
              <Text
                key={index}
                numberOfLines={1}
                maxFontSizeMultiplier={LABEL_SCALE}
                style={[
                  styles.label,
                  { top: `${labelAt(index, marks.length)}%`, height: box, marginTop: -box / 2 },
                ]}
              >
                {marks[index]?.number}
              </Text>
            ))}
            <Animated.View style={[styles.thumb, { backgroundColor: accent }, thumb]} />
          </Animated.View>
        </GestureDetector>
      </View>
      <Bubble hold={hold} marks={marks} sections={sections} top={top} />
    </>
  );
}

function Bubble({
  hold,
  marks,
  sections,
  top,
}: {
  readonly hold: RailHold;
  readonly marks: ReadonlyArray<Mark>;
  readonly sections: ReadonlyArray<string>;
  readonly top: number;
}) {
  const accent = useAccent();
  const [shown, setShown] = useState(-1);
  useAnimatedReaction(
    () => hold.at.value,
    (now, before) => {
      if (now !== before) scheduleOnRN(setShown, now);
    },
  );
  const place = useAnimatedStyle(() => ({
    opacity: Math.min(1, hold.at.value + 1),
    transform: [{ translateY: hold.shift.value + hold.y.value - BUBBLE / 2 }],
  }));
  const mark = marks[shown];
  return (
    <Animated.View
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.bubble, { top }, place]}
    >
      <Text style={[styles.number, { color: accent }]}>{mark?.number}</Text>
      <Text style={styles.section} numberOfLines={1}>
        {sections[mark?.section ?? 0]}
      </Text>
    </Animated.View>
  );
}

const THUMB = 10;

const styles = StyleSheet.create({
  gutter: { position: 'absolute', right: 0, width: GUTTER },
  rail: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: LABEL_SIZE,
    lineHeight: LABEL_LINE,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    color: color.muted,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    left: (GUTTER - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
  bubble: {
    position: 'absolute',
    right: GUTTER + 12,
    maxWidth: 220,
    minHeight: BUBBLE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
    backgroundColor: color.panel,
    justifyContent: 'center',
  },
  number: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  section: { fontSize: 13, color: color.muted },
});
