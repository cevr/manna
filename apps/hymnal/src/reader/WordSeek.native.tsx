/**
 * The held seek's touch on a phone: the page's sung words sit in one pan
 * that takes only after a finger has stayed still `HOLD_MS` (the gesture
 * handler's `activateAfterLongPress`), and fails as soon as the finger
 * leaves a `SLOP` box first, so the page's scroll, the pager and the back
 * edge keep every quick touch. As it takes, the hold is checked again: the
 * finger within `SLOP` of where it landed (the handler's box is square), on
 * no chord, and the page's hold still offered; only then does the page's
 * seek begin (`word-seek.ts`). Its translation from that moment chooses; a
 * lift releases, the handler's cancel cancels, each once.
 *
 * The page's vertical scroll and the pager's horizontal one are each the
 * handler's native gesture (`SeekScroll` here, the pager's own), and the
 * hold's recognizer blocks both (`block`): neither begins until the hold
 * fails, so a finger that moves within its time scrolls or turns the page,
 * and one held still keeps the touch. The page also turns both off while it
 * holds (`scrollEnabled`). How UIKit plays that graph is checked on a
 * device, not here.
 */

import { type ReactNode, useRef } from 'react';
import { GestureDetector, useNativeGesture, usePanGesture } from 'react-native-gesture-handler';
import { View } from 'react-native';
import { Option } from 'effect';

import {
  HOLD_MS,
  type SeekAreaProps,
  SeekScrollsProvider,
  SLOP,
  useChordTouch,
  useSeekAvailable,
  useSeekScrolls,
} from './word-seek';

/**
 * The page's vertical scroll as the handler's native gesture: the hold
 * inside it blocks it, with any scroll outside it (the pager).
 */
export function SeekScroll({ children }: { readonly children: ReactNode }) {
  const outer = useSeekScrolls();
  const scroll = useNativeGesture({
    testID: 'hymn-scroll-native',
    disallowInterruption: true,
    shouldCancelWhenOutside: false,
  });
  return (
    <SeekScrollsProvider value={[scroll, ...outer]}>
      <GestureDetector gesture={scroll}>{children}</GestureDetector>
    </SeekScrollsProvider>
  );
}

export function SeekArea({ seek, style, children }: SeekAreaProps) {
  const chord = useChordTouch();
  const available = useSeekAvailable(seek);
  const scrolls = useSeekScrolls();
  const origin = useRef(Option.none<{ readonly x: number; readonly y: number }>());
  const now = useRef(seek);
  now.current = seek;
  const end = (canceled: boolean) =>
    Option.map(origin.current, () => {
      origin.current = Option.none();
      if (canceled) now.current.cancel();
      else now.current.release();
    });
  const gesture = usePanGesture({
    testID: 'reader-word-seek-hold',
    enabled: available || Option.contains(seek.via, 'pointer'),
    runOnJS: true,
    maxPointers: 1,
    activateAfterLongPress: HOLD_MS,
    failOffsetX: [-SLOP, SLOP],
    failOffsetY: [-SLOP, SLOP],
    shouldCancelWhenOutside: false,
    block: [...scrolls],
    onActivate: ({ translationX, translationY }) => {
      if (Math.hypot(translationX, translationY) > SLOP || chord.recent()) return;
      if (!now.current.begin('pointer')) return;
      origin.current = Option.some({ x: translationX, y: translationY });
    },
    onUpdate: ({ translationX, translationY }) =>
      Option.map(origin.current, (from) =>
        now.current.drag(translationX - from.x, translationY - from.y),
      ),
    onDeactivate: ({ canceled }) => end(canceled),
    onFinalize: ({ canceled }) => {
      if (canceled) end(true);
    },
  });
  return (
    <GestureDetector gesture={gesture}>
      <View testID="reader-word-seek-area" collapsable={false} style={style}>
        {children}
      </View>
    </GestureDetector>
  );
}
