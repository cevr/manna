import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color } from '~/color';

import { DETENT } from './dial';
import { useReduceMotion } from './motion';

export const PANEL_PAD = 8;
export const ROW_GAP = 10;

export function DialPanel({
  testID,
  children,
}: {
  readonly testID?: string;
  readonly children: ReactNode;
}) {
  return (
    <View testID={testID} style={styles.panel}>
      {children}
    </View>
  );
}

const OPEN = { stiffness: 247, damping: 22, mass: 1 };
const CLOSE = { stiffness: 322, damping: 35.9, mass: 1 };

const FROM_SCALE = 0.55;
const FROM_LOW = 10;

const FADE_UNDER = 0.4;

const REDUCED_FADE = 150;

export const ROW_STAGGER = 40;

const Staggered = createContext(false);

export function DialPopover({
  open,
  keyAt,
  below,
  children,
}: {
  readonly open: boolean;
  readonly keyAt: SharedValue<number>;
  readonly below: number;
  readonly children: ReactNode;
}) {
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const last = useRef(children);
  useEffect(() => {
    if (open) last.current = children;
  });
  const reduced = useReduceMotion();
  const { width } = useWindowDimensions();
  const progress = useSharedValue(0);
  const size = useSharedValue({
    width: width - 24,
    height: 2 * DETENT + ROW_GAP + 2 * PANEL_PAD + 2,
  });
  const hide = () => setShown(false);

  useEffect(() => {
    const ended = (finished?: boolean) => {
      'worklet';
      if (finished && !open) scheduleOnRN(hide);
    };
    const to = (open && 1) || 0;
    if (reduced) {
      progress.value = withTiming(
        to,
        {
          duration: REDUCED_FADE,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.Never,
        },
        ended,
      );
      return;
    }
    progress.value = withSpring(
      to,
      { ...((open && OPEN) || CLOSE), reduceMotion: ReduceMotion.Never },
      ended,
    );
  }, [open, reduced]);

  const drawn = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduced) return { opacity: Math.min(Math.max(p, 0), 1) };
    const ox = keyAt.value - size.value.width / 2;
    const oy = size.value.height / 2 + below;
    return {
      opacity: Math.min(Math.max(p / ((open && FADE_UNDER) || 1), 0), 1),
      transform: [
        { translateY: FROM_LOW * (1 - p) },
        { translateX: ox },
        { translateY: oy },
        { scale: FROM_SCALE + (1 - FROM_SCALE) * p },
        { translateX: -ox },
        { translateY: -oy },
      ],
    };
  });

  const measured = (event: LayoutChangeEvent) => {
    size.value = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  };

  if (!shown) return <></>;
  return (
    <Animated.View
      testID="dials-panel"
      pointerEvents={(open && 'auto') || 'none'}
      onLayout={measured}
      style={[styles.panel, drawn]}
    >
      <Staggered value={!reduced}>{(open && children) || last.current}</Staggered>
    </Animated.View>
  );
}

const ROW_FADE = 200;

export function PanelRow({
  fromBottom,
  children,
}: {
  readonly fromBottom: number;
  readonly children: ReactNode;
}) {
  const staggered = use(Staggered);
  const shown = useSharedValue(Number(!staggered));
  useEffect(() => {
    if (!staggered) return;
    shown.value = withDelay(
      fromBottom * ROW_STAGGER,
      withTiming(1, {
        duration: ROW_FADE,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, []);
  const drawn = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <Animated.View style={drawn}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  panel: {
    padding: PANEL_PAD,
    gap: ROW_GAP,
    borderRadius: DETENT / 2 + PANEL_PAD,
    borderWidth: 1,
    borderColor: color.edge,
    backgroundColor: color.panel,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
