/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError -- a stand-in for the gesture handler: a gesture a test asks for and no detector drew is a broken test. */

/**
 * `react-native-gesture-handler` as Heartseed's tests see it, cut from the
 * hymnal's stand-in (`apps/hymnal/src/test/gesture.tsx`) to what Heartseed
 * draws: a pan (`usePanGesture`). A detector draws its child and keeps the
 * gesture it was handed in `gestures`, the latest last, so a test plays the
 * touch a platform's recognizer would report through the gesture's own
 * callbacks, and finds a gesture by its `testID` (`gestureOf`). A root view
 * is a plain view.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

/** The touch a gesture reports: where the finger is in the detector's view, and how far it moved, in points. */
interface Touch {
  readonly x: number;
  readonly y: number;
  readonly absoluteX?: number;
  readonly absoluteY?: number;
  readonly translationX?: number;
  readonly translationY?: number;
}

/** A pan's config, as a screen hands it to `usePanGesture`. */
export interface PanConfig {
  readonly testID?: string;
  readonly enabled?: boolean;
  readonly runOnJS?: boolean;
  readonly disableReanimated?: boolean;
  readonly activateAfterLongPress?: number;
  readonly onBegin?: (touch: Touch) => void;
  readonly onActivate?: (touch: Touch) => void;
  readonly onUpdate?: (touch: Touch) => void;
  readonly onDeactivate?: (end: Touch & { readonly canceled: boolean }) => void;
  readonly onFinalize?: (end: Touch & { readonly canceled: boolean }) => void;
}

/** Each gesture a detector was drawn with, the latest last. */
export const gestures: Array<PanConfig> = [];

/** The gesture last drawn with `testID`. */
export const gestureOf = (testID: string): PanConfig => {
  const found = gestures.findLast((gesture) => gesture.testID === testID);
  if (found === undefined) throw new Error(`no gesture ${testID} was drawn`);
  return found;
};

export const usePanGesture = (config: PanConfig) => config;

export function GestureDetector({
  gesture,
  children,
}: {
  readonly gesture: PanConfig;
  readonly children: ReactNode;
}) {
  gestures.push(gesture);
  return children;
}

export function GestureHandlerRootView({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: object;
}) {
  return <View style={style}>{children}</View>;
}
