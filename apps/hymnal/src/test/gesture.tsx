/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError -- a stand-in for the gesture handler: a gesture a test asks for and no detector drew is a broken test. */

/**
 * `react-native-gesture-handler` as the app's tests see it: a detector
 * draws its child, and keeps the gesture it was handed in `gestures`, the
 * latest last (each gesture of a composed one on its own), so a test plays
 * the touch a platform's recognizer would report through the gesture's own
 * callbacks, and finds a gesture by its `testID` (`gestureOf`). A root view
 * is a plain view.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

/** The touch a gesture reports: where the finger is along the view, and how far and fast it moved, in points. */
interface Touch {
  readonly x: number;
  readonly y?: number;
  readonly translationX?: number;
  readonly translationY?: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
}

/** A gesture's config, as a screen hands it to `usePanGesture` or `useTapGesture`. */
export interface PanConfig {
  readonly testID?: string;
  readonly enabled?: boolean;
  readonly numberOfTaps?: number;
  readonly onBegin?: (touch: Touch) => void;
  readonly onActivate?: (touch: Touch) => void;
  readonly onUpdate?: (touch: Touch) => void;
  readonly onDeactivate?: (end: Touch & { readonly canceled: boolean }) => void;
  readonly onFinalize?: (end: Touch & { readonly canceled: boolean }) => void;
}

interface Composed {
  readonly composed: ReadonlyArray<PanConfig | Composed>;
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
export const useTapGesture = (config: PanConfig) => config;
export const useLongPressGesture = (config: PanConfig) => config;

const compose = (...composed: ReadonlyArray<PanConfig | Composed>): Composed => ({ composed });
export const useCompetingGestures = compose;
export const useExclusiveGestures = compose;
export const useSimultaneousGestures = compose;

const flat = (gesture: PanConfig | Composed): ReadonlyArray<PanConfig> =>
  ('composed' in gesture && gesture.composed.flatMap(flat)) || [gesture as PanConfig];

export function GestureDetector({
  gesture,
  children,
}: {
  readonly gesture: PanConfig | Composed;
  readonly children: ReactNode;
}) {
  gestures.push(...flat(gesture));
  return <>{children}</>;
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
