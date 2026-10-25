/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noRuntimeTypeof -- a stand-in for the gesture handler: a gesture a test asks for and no detector drew is a broken test, and an offset is a number or a range, as the handler takes it. */

/**
 * `react-native-gesture-handler` as the app's tests see it: a detector
 * draws its child, and keeps the gesture it was handed in `gestures`, the
 * latest last (each gesture of a composed one on its own), with the
 * gestures of the detectors around it (`within`), so a test plays the touch
 * a platform's recognizer would report through the gesture's own
 * callbacks, and finds a gesture by its `testID` (`gestureOf`). A root view
 * is a plain view.
 *
 * `drag` plays one straight drag that starts on a detector, against every
 * pan around it, as the handler decides between them: each pan begins at
 * the touch; the first whose activation offsets the drag leaves before its
 * fail offsets wins it (the innermost first, at the same point), and the
 * others fail.
 */

import { Option } from 'effect';
import { createContext, type ReactNode, use } from 'react';
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

/** A pan's offset: one way past a number, or out of a range either way. */
type Offset = number | readonly [number, number];

/** A gesture's config, as a screen hands it to `usePanGesture` or `useTapGesture`. */
export interface PanConfig {
  readonly testID?: string;
  readonly enabled?: boolean;
  readonly numberOfTaps?: number;
  readonly minDistance?: number;
  readonly activeOffsetX?: Offset;
  readonly activeOffsetY?: Offset;
  readonly failOffsetX?: Offset;
  readonly failOffsetY?: Offset;
  readonly onBegin?: (touch: Touch) => void;
  readonly onActivate?: (touch: Touch) => void;
  readonly onUpdate?: (touch: Touch) => void;
  readonly onDeactivate?: (end: Touch & { readonly canceled: boolean }) => void;
  readonly onFinalize?: (end: Touch & { readonly canceled: boolean }) => void;
}

/** A gesture as a detector drew it: a pan or another kind, and the gestures of the detectors around it, innermost first. */
export interface Drawn extends PanConfig {
  readonly pan: boolean;
  readonly within: ReadonlyArray<PanConfig>;
}

interface Composed {
  readonly composed: ReadonlyArray<PanConfig | Composed>;
}

/** Each gesture a detector was drawn with, the latest last. */
export const gestures: Array<Drawn> = [];

/** The gesture last drawn with `testID`. */
export const gestureOf = (testID: string): Drawn => {
  const found = gestures.findLast((gesture) => gesture.testID === testID);
  if (found === undefined) throw new Error(`no gesture ${testID} was drawn`);
  return found;
};

const pans = new WeakSet<PanConfig>();

export const usePanGesture = (config: PanConfig) => {
  pans.add(config);
  return config;
};
export const useTapGesture = (config: PanConfig) => config;
export const useLongPressGesture = (config: PanConfig) => config;

const compose = (...composed: ReadonlyArray<PanConfig | Composed>): Composed => ({ composed });
export const useCompetingGestures = compose;
export const useExclusiveGestures = compose;
export const useSimultaneousGestures = compose;

const flat = (gesture: PanConfig | Composed): ReadonlyArray<PanConfig> =>
  ('composed' in gesture && gesture.composed.flatMap(flat)) || [gesture as PanConfig];

/** The gestures of the detectors around the one drawing, innermost first. */
const Around = createContext<ReadonlyArray<PanConfig>>([]);

export function GestureDetector({
  gesture,
  children,
}: {
  readonly gesture: PanConfig | Composed;
  readonly children: ReactNode;
}) {
  const around = use(Around);
  const own = flat(gesture);
  gestures.push(...own.map((config) => ({ ...config, pan: pans.has(config), within: around })));
  return <Around value={[...own, ...around]}>{children}</Around>;
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

/** Whether translation `t` lies past `offset`. */
const past = (offset: Offset, t: number) =>
  (typeof offset === 'number' && ((offset < 0 && t < offset) || (offset >= 0 && t > offset))) ||
  (typeof offset !== 'number' && (t < offset[0] || t > offset[1]));

/** A pan with no offset and no distance set activates once it has moved this far, as the handler's does. */
const DEFAULT_DISTANCE = 10;

const activates = (pan: PanConfig, tx: number, ty: number) => {
  const offsets = pan.activeOffsetX !== undefined || pan.activeOffsetY !== undefined;
  const distance = pan.minDistance ?? ((!offsets && DEFAULT_DISTANCE) || undefined);
  return (
    (pan.activeOffsetX !== undefined && past(pan.activeOffsetX, tx)) ||
    (pan.activeOffsetY !== undefined && past(pan.activeOffsetY, ty)) ||
    (distance !== undefined && Math.hypot(tx, ty) > 0 && Math.hypot(tx, ty) >= distance)
  );
};

const fails = (pan: PanConfig, tx: number, ty: number) =>
  (pan.failOffsetX !== undefined && past(pan.failOffsetX, tx)) ||
  (pan.failOffsetY !== undefined && past(pan.failOffsetY, ty));

/**
 * One straight drag of `dx`, `dy` points from `x`, `y` on the detector of
 * the gesture `testID`, against each pan around it. It gives the test id
 * of the pan that took the drag, if one did.
 */
export const drag = (
  testID: string,
  { x = 0, y = 0, dx, dy }: { x?: number; y?: number; dx: number; dy: number },
): Option.Option<string> => {
  const start = gestureOf(testID);
  // Each gesture around it as its detector last drew it, so its callbacks are the latest.
  const around = start.within.map(
    (gesture) =>
      (gesture.testID !== undefined && gestureOf(gesture.testID)) || {
        ...gesture,
        pan: pans.has(gesture),
      },
  );
  const touched = [start, ...around].filter((gesture) => gesture.pan && gesture.enabled !== false);
  for (const pan of touched) pan.onBegin?.({ x, y });
  // The drag is played a point at a time along its longer side.
  const steps = Math.max(Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))), 1);
  const failed = new Set<PanConfig>();
  let winner: PanConfig | undefined;
  for (let k = 1; k <= steps && winner === undefined; k += 1) {
    const tx = (dx * k) / steps;
    const ty = (dy * k) / steps;
    for (const pan of touched) {
      if (failed.has(pan) || winner !== undefined) continue;
      if (fails(pan, tx, ty)) failed.add(pan);
      else if (activates(pan, tx, ty)) {
        winner = pan;
        pan.onActivate?.({ x: x + tx, y: y + ty, translationX: tx, translationY: ty });
      }
    }
  }
  const end = { x: x + dx, y: y + dy, translationX: dx, translationY: dy };
  winner?.onUpdate?.(end);
  winner?.onDeactivate?.({ ...end, canceled: false });
  for (const pan of touched) pan.onFinalize?.({ ...end, canceled: pan !== winner });
  return Option.fromNullishOr(winner?.testID);
};
