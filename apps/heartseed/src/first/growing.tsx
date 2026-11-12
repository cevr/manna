/**
 * The welcome's growing seed: the four stage drawings of the home's set in
 * the scheme now, each 112 pt, stacked in one 120 pt place hidden from the
 * screen reader. Each sits in an animated wrapper of its own whose opacity
 * alone changes, derived from one Reanimated shared value, the cycle's
 * clock, through the plan's own points (`GROWTH_STEPS`), so the drawing at
 * clock `ms` is `growthAt(ms)`. The clock runs on the UI thread from
 * `GROWTH_START`, a cycle a repeat, for as long as the welcome shows, and
 * Reanimated cancels it when the welcome leaves; it never re-renders React.
 * Under Reduce Motion the repeat ends at once one cycle on, the still frame,
 * full corn alone. Given `at`, it draws `growthAt(at)` still and starts no
 * loop: the tests' clock.
 */

import { Option } from 'effect';
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { STAGES } from '../garden';
import { ICON_IMAGES } from '../home/icons';
import { useScheme } from '../look';
import { DRAWN } from '../field/plot';
import { GROWTH, GROWTH_START, GROWTH_STEPS, growthAt } from './growth';

/** One stage's drawing in its own animated wrapper, its opacity the clock's through the plan's points, or `still`'s. */
function Layer({
  stage,
  clock,
  still,
}: {
  readonly stage: number;
  readonly clock: SharedValue<number>;
  readonly still: Option.Option<number>;
}) {
  const scheme = useScheme();
  const row = GROWTH_STEPS.opacity[stage] ?? [];
  const at = GROWTH_STEPS.at;
  const cycle = GROWTH.cycle;
  const moving = useAnimatedStyle(() => ({
    opacity: interpolate(clock.value % cycle, at, row, Extrapolation.CLAMP),
  }));
  const name = DRAWN[STAGES[stage] ?? 'seed'];
  const source = ICON_IMAGES[name][scheme];
  return (
    <Animated.View
      style={[
        styles.layer,
        Option.match(still, { onNone: () => moving, onSome: (opacity) => ({ opacity }) }),
      ]}
    >
      <Image
        testID="growing-image"
        aria-hidden
        source={source}
        defaultSource={source}
        resizeMode="contain"
        style={styles.image}
      />
    </Animated.View>
  );
}

/** The growing seed; `at`, given, draws that instant still. */
export function GrowingSeed({ at }: { readonly at?: number }) {
  const still = Option.fromUndefinedOr(at);
  const clock = useSharedValue(GROWTH_START);
  const looping = Option.isNone(still);
  useEffect(() => {
    if (!looping) return;
    clock.value = withRepeat(
      withTiming(GROWTH_START + GROWTH.cycle, {
        duration: GROWTH.cycle,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      false,
      // oxlint-disable-next-line effect/noNullish -- Reanimated's positional no-callback argument keeps ReduceMotion.System explicit in slot five
      undefined,
      ReduceMotion.System,
    );
  }, [clock, looping]);
  const frame = Option.map(still, growthAt);
  return (
    <View testID="growing" aria-hidden style={styles.place}>
      {STAGES.map((stage, index) => (
        <Layer
          key={stage}
          stage={index}
          clock={clock}
          still={Option.flatMap(frame, (each) => Option.fromUndefinedOr(each[index]))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  place: { width: 120, height: 120 },
  layer: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 112,
    height: 112,
  },
  image: { width: 112, height: 112 },
});
