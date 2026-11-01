/**
 * iOS's position bar, drawn here: a track, the part played in the accent,
 * and a thumb. SwiftUI's `Slider` (One's `One.iOS.Slider`) is not used: One
 * builds it with a step, always (it refuses a step of 0), and iOS 26 draws a
 * stepped slider's ticks under its track, which at a second a step read as
 * a stray line. This bar knows the touch that drags it, as the web's does:
 * the place under the finger is the drag, and the drag is sent once the
 * finger lifts. A tap is a drag that begins and lifts at one point: the
 * place under it is sent at once. VoiceOver adjusts it ten seconds a swipe,
 * and its double tap does nothing.
 * While the length is not known the bar is still, in the muted role.
 *
 * The touch is a gesture handler's pan (`usePanGesture`), a UIKit gesture of
 * its own that begins at the touch: while it holds the finger, the sheet's
 * pan and its scroll view's cannot begin, so a drag on the bar in any
 * direction never moves the sheet. React Native's touch responder cannot
 * hold a touch from a native gesture: the sheet took the drag from it. The
 * pan presses at the touch and activates on any move; a touch that never
 * moves fails it, and a tap gesture competing with it takes that touch. The
 * two end in no set order, and both press the bar's one pointer, so the tap
 * sends one seek either way.
 */

import { Match } from 'effect';
import { useRef, useState } from 'react';
import { type AccessibilityActionEvent, StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';

import { color, useAccent } from '~/color';

import { nudged, placeAt, type ScrubberProps, useScrub } from './scrub';

/** The one touch a bar on iOS follows: its pan holds one at a time. */
const TOUCH = 1;

const THUMB = 20;

/** VoiceOver's double tap on the bar: it is adjusted, never activated. */
const ignore = () => {};

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
  const [width, setWidth] = useState(0);
  const share = placeAt(scrub.value, scrub.max, 1);
  const tint = Match.value(scrub.still).pipe(
    Match.when(true, () => color.muted),
    Match.orElse(() => accent),
  );
  /** The place under the touch at `x`, along the track (the thumb's half inset at each end). */
  const under = (x: number) => placeAt(x - THUMB / 2, width - THUMB, scrub.max);
  // The pan's callbacks read the bar as it is now, not as it was when the pan was made.
  const live = useRef({ scrub, under });
  live.current = { scrub, under };
  // A still touch: the pan fails and the tap lands where the finger lifts, in either order.
  const tap = useTapGesture({
    testID: 'position-tap',
    runOnJS: true,
    enabled: !scrub.still,
    onActivate: ({ x }) => {
      live.current.scrub.press(TOUCH);
      live.current.scrub.move(live.current.under(x));
      live.current.scrub.lift(TOUCH);
    },
  });
  const pan = usePanGesture({
    testID: 'position-pan',
    runOnJS: true,
    disableReanimated: true,
    enabled: !scrub.still,
    minDistance: 0,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    onBegin: ({ x }) => {
      live.current.scrub.press(TOUCH);
      live.current.scrub.move(live.current.under(x));
    },
    onUpdate: ({ x }) => live.current.scrub.move(live.current.under(x)),
    onFinalize: ({ canceled }) =>
      Match.value(canceled).pipe(
        Match.when(true, () => live.current.scrub.drop(TOUCH)),
        Match.orElse(() => live.current.scrub.lift(TOUCH)),
      ),
  });
  const touch = useCompetingGestures(pan, tap);
  const act = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'increment') scrub.step(nudged(scrub.value, scrub.max, 1));
    if (nativeEvent.actionName === 'decrement') scrub.step(nudged(scrub.value, scrub.max, -1));
  };
  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={touch}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Position"
          accessibilityValue={{ text: scrub.said }}
          accessibilityState={{ disabled: scrub.still }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={act}
          // VoiceOver's double tap is handled here and does nothing: a view that handles none gets it as a touch at its centre, which the tap would seek to.
          onAccessibilityTap={ignore}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={styles.bar}
        >
          <View pointerEvents="none" style={styles.track}>
            <View style={[styles.played, { width: `${share * 100}%`, backgroundColor: tint }]} />
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { left: share * Math.max(width - THUMB, 0), backgroundColor: tint },
            ]}
          />
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 0 },
  bar: { height: 32, justifyContent: 'center' },
  track: {
    marginHorizontal: THUMB / 2,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: color.line,
  },
  played: { height: 4 },
  thumb: { position: 'absolute', top: 6, width: THUMB, height: THUMB, borderRadius: THUMB / 2 },
});
