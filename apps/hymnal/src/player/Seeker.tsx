/**
 * The bar's seeker, under its buttons while a hymn sounds: the time gone, a
 * track with a knob to drag, and the time left. The knob springs up under
 * the finger and settles softly as it lets go. The drag is the full
 * player's own (`useScrub`): the place under the finger is the drag, sent
 * once the finger lifts, and the bar holds the place sent until the player
 * reaches it. The drag ticks at each five seconds of track the knob passes
 * (`seek-tick`). VoiceOver adjusts it ten seconds a swipe.
 *
 * The touch is a gesture handler's pan that takes a sideways drag only, and
 * the seeker lies inside the bar's swipe up: a drag that goes sideways
 * first seeks and never opens the player sheet, and a swipe that goes up
 * first opens the sheet and moves no place.
 */

import { Match, Option } from 'effect';
import { useRef, useState } from 'react';
import { type AccessibilityActionEvent, StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';

import { nudged, placeAt, type ScrubberProps, useScrub } from './scrub';
import { clock } from './time';

/** The one touch the seeker follows. */
const TOUCH = 1;

/** How far a drag goes sideways before it seeks, and how far up or down before it is the bar's swipe, in points. */
const SIDEWAYS = 8;
const UPWARDS = 10;

const KNOB = 14;

/** How much the knob grows under the finger. */
const GROWN = 1.4;

/** The track's stretch, in seconds, whose boundary a dragged knob ticks at. */
const TICK = 5;

export function Seeker(props: ScrubberProps) {
  const accent = useAccent();
  const cue = useCue();
  const scrub = useScrub(props);
  const [width, setWidth] = useState(0);
  const share = placeAt(scrub.value, scrub.max, 1);
  const grown = useSharedValue(1);
  const knob = useAnimatedStyle(() => ({ transform: [{ scale: grown.value }] }));
  /** The place under the touch at `x`, along the track (the knob's half inset at each end). */
  const under = (x: number) => placeAt(x - KNOB / 2, width - KNOB, scrub.max);
  const live = useRef({ scrub, under });
  live.current = { scrub, under };
  // The stretch of track (`TICK` seconds each) the knob was last dragged over.
  const stretch = useRef(0);
  /** Drags the knob to `seconds`: one tick for each stretch boundary it passes. */
  const dragTo = (seconds: number) => {
    const now = Math.floor(seconds / TICK);
    for (let k = 0; k < Math.abs(now - stretch.current); k += 1) cue(plain('seek-tick'));
    stretch.current = now;
    live.current.scrub.move(seconds);
  };
  const settle = () => {
    grown.value = withSpring(1, { damping: 18, stiffness: 180 });
    cue(plain('seek-release'));
  };
  const pan = usePanGesture({
    testID: 'seek-pan',
    runOnJS: true,
    enabled: !scrub.still,
    activeOffsetX: [-SIDEWAYS, SIDEWAYS],
    failOffsetY: [-UPWARDS, UPWARDS],
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    // Nothing is pressed until the drag is sideways: a swipe up fails the pan, and sends nothing.
    onActivate: ({ x }) => {
      grown.value = withSpring(GROWN, { damping: 12, stiffness: 260 });
      cue(plain('seek-grab'));
      live.current.scrub.press(TOUCH);
      const grabbed = live.current.under(x);
      stretch.current = Math.floor(grabbed / TICK);
      live.current.scrub.move(grabbed);
    },
    onUpdate: ({ x }) => dragTo(live.current.under(x)),
    onDeactivate: ({ canceled }) => {
      settle();
      Match.value(canceled).pipe(
        Match.when(true, () => live.current.scrub.drop(TOUCH)),
        Match.orElse(() => live.current.scrub.lift(TOUCH)),
      );
    },
  });
  const act = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'increment') scrub.step(nudged(scrub.value, scrub.max, 1));
    if (nativeEvent.actionName === 'decrement') scrub.step(nudged(scrub.value, scrub.max, -1));
  };
  const left = Option.match(props.length, {
    onNone: () => '–:––',
    onSome: (length) => `−${clock(Math.max(length - scrub.value, 0))}`,
  });
  return (
    <View style={styles.seeker}>
      <Text style={styles.time} aria-hidden>
        {clock(scrub.value)}
      </Text>
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={pan}>
          <View
            accessible
            accessibilityRole="adjustable"
            aria-label="Seek"
            aria-valuetext={scrub.said}
            aria-disabled={scrub.still}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={act}
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            testID="seek"
            style={styles.bar}
          >
            <View pointerEvents="none" style={styles.track}>
              <View
                testID="seek-played"
                style={[styles.played, { width: `${share * 100}%`, backgroundColor: accent }]}
              />
            </View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.knob,
                { left: share * Math.max(width - KNOB, 0), backgroundColor: accent },
                knob,
              ]}
            />
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
      <Text style={[styles.time, styles.end]} aria-hidden>
        {left}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seeker: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 32 },
  time: { width: 40, fontSize: 11, color: color.muted, fontVariant: ['tabular-nums'] },
  end: { textAlign: 'right' },
  root: { flex: 1 },
  bar: { height: 32, justifyContent: 'center' },
  track: {
    marginHorizontal: KNOB / 2,
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
    backgroundColor: color.line,
  },
  played: { height: 3 },
  knob: { position: 'absolute', top: 9, width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
});
