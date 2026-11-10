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
 *
 * `touchDown` and `touchUp` play a still tap on a tap gesture's detector:
 * the finger lands, and every pan beside the tap and around it begins; it
 * lifts, and each pan fails while the tap activates, in an order the test
 * picks. A test that wraps each in its own `act` lets the bar draw between
 * the finger landing and lifting, as it does on a phone.
 */

import { Option } from 'effect';
import { createContext, isValidElement, type ReactNode, use } from 'react';
import { View } from 'react-native';

/** The touch a gesture reports: where the finger is along the view, and how far and fast it moved, in points. */
interface Touch {
  readonly x: number;
  readonly y?: number;
  readonly translationX?: number;
  readonly translationY?: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
  /** A pinch's scale (1 where the fingers landed) and its velocity, in scale per second. */
  readonly scale?: number;
  readonly velocity?: number;
}

/** A pan's offset: one way past a number, or out of a range either way. */
type Offset = number | readonly [number, number];

/** A gesture's config, as a screen hands it to `usePanGesture`, `useTapGesture` or `usePinchGesture`. */
export interface PanConfig {
  readonly testID?: string;
  readonly enabled?: boolean;
  readonly runOnJS?: boolean;
  readonly numberOfTaps?: number;
  readonly minDistance?: number;
  readonly activeOffsetX?: Offset;
  readonly activeOffsetY?: Offset;
  readonly failOffsetX?: Offset;
  readonly failOffsetY?: Offset;
  /** A pan that takes only after the finger stays still this long, in milliseconds: no movement activates it. */
  readonly activateAfterLongPress?: number;
  readonly maxPointers?: number;
  readonly shouldCancelWhenOutside?: boolean;
  /** A native gesture's own (a scroll view's): it cancels the others once it takes. */
  readonly disallowInterruption?: boolean;
  /** The gestures that wait for this one to fail before they may begin. */
  readonly block?: ReadonlyArray<PanConfig>;
  /** The gestures this one waits on to fail before it may begin. */
  readonly requireToFail?: ReadonlyArray<PanConfig>;
  /** The gestures that may act with this one at once. */
  readonly simultaneousWith?: ReadonlyArray<PanConfig>;
  readonly onBegin?: (touch: Touch) => void;
  readonly onActivate?: (touch: Touch) => void;
  readonly onUpdate?: (touch: Touch) => void;
  readonly onDeactivate?: (end: Touch & { readonly canceled: boolean }) => void;
  readonly onFinalize?: (end: Touch & { readonly canceled: boolean }) => void;
}

/** A gesture as a detector drew it: a pan or another kind, the gestures its own detector holds, and those of the detectors around it, innermost first. */
export interface Drawn extends PanConfig {
  readonly pan: boolean;
  readonly beside: ReadonlyArray<PanConfig>;
  readonly within: ReadonlyArray<PanConfig>;
  /** The view the detector holds, by its test id and whether it scrolls sideways. */
  readonly child: { readonly testID?: string; readonly horizontal?: boolean };
}

/** The props a detector's one child was given that say which view it is. */
const childOf = (children: ReactNode): Drawn['child'] => {
  if (!isValidElement<{ testID?: string; horizontal?: boolean }>(children)) return {};
  const { testID, horizontal } = children.props;
  return { testID, horizontal };
};

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
export const usePinchGesture = (config: PanConfig) => config;
/** A native view's own gesture (a scroll view's), as a detector around it holds it: never a pan here. */
export const useNativeGesture = (config: PanConfig) => config;

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
  gestures.push(
    ...own.map((config) => ({
      ...config,
      pan: pans.has(config),
      beside: own,
      within: around,
      child: childOf(children),
    })),
  );
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
  if (pan.activateAfterLongPress !== undefined) return false;
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
  const around = start.within.map(
    (gesture) =>
      (gesture.testID !== undefined && gestureOf(gesture.testID)) || {
        ...gesture,
        pan: pans.has(gesture),
      },
  );
  const touched = [start, ...around].filter((gesture) => gesture.pan && gesture.enabled !== false);
  for (const pan of touched) pan.onBegin?.({ x, y });
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

/** Each enabled pan a touch on `start`'s detector reaches, as its detector last drew it: those beside it, then those around it. */
const pansAt = (start: Drawn) =>
  [...start.beside, ...start.within]
    .map(
      (gesture) =>
        (gesture.testID !== undefined && gestureOf(gesture.testID)) || {
          ...gesture,
          pan: pans.has(gesture),
        },
    )
    .filter((gesture) => gesture.pan && gesture.enabled !== false);

const keyOf = (pan: PanConfig) => pan.testID ?? pan;

/** A finger's drift before a long press's time: the pans it fails (each told), and the pan it activates, if any. */
const drift = (
  touched: ReadonlyArray<PanConfig>,
  { x, y, dx, dy }: { x: number; y: number; dx: number; dy: number },
) => {
  const failed = new Set<string | PanConfig>();
  let moved: PanConfig | undefined;
  const steps = Math.max(Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))), 1);
  for (let k = 1; k <= steps && moved === undefined; k += 1) {
    const tx = (dx * k) / steps;
    const ty = (dy * k) / steps;
    for (const pan of touched.filter((one) => !failed.has(keyOf(one)))) {
      if (moved !== undefined) break;
      if (fails(pan, tx, ty)) {
        failed.add(keyOf(pan));
        pan.onFinalize?.({ x: x + tx, y: y + ty, canceled: true });
      } else if (activates(pan, tx, ty)) moved = pan;
    }
  }
  return { failed, moved };
};

/** The long-press pan, if it still stands enabled when its time passes. */
const stillWinner = (own: Drawn, failed: ReadonlySet<string | PanConfig>) =>
  (own.enabled !== false && !failed.has(keyOf(own)) && own) || undefined;

/** A finger on a long-press pan: whether the pan took it, and what the finger does next. */
export interface Held {
  /** The test id of the pan that took the touch, if one did. */
  readonly taken: Option.Option<string>;
  /** The finger is `dx`, `dy` points from where it landed. */
  readonly move: (dx: number, dy: number) => void;
  readonly lift: () => void;
  /** The platform cancels the touch (a call, a system gesture). */
  readonly cancel: () => void;
}

/**
 * A finger lands at `x`, `y` on the detector of the long-press pan
 * `testID`, drifts `dx`, `dy` points before the pan's time, and stays until
 * its time passes. Every pan it reaches begins; the drift fails a pan whose
 * fail offsets it leaves and may activate another pan (which then takes the
 * touch); a long-press pan still standing at its time activates, and every
 * other pan fails. Each gesture is read as its detector last drew it.
 */
export const longPress = (
  testID: string,
  { x = 0, y = 0, dx = 0, dy = 0 }: { x?: number; y?: number; dx?: number; dy?: number },
): Held => {
  const touched = pansAt(gestureOf(testID));
  for (const pan of touched) pan.onBegin?.({ x, y });
  const { failed, moved } = drift(touched, { x, y, dx, dy });
  const at = { x: x + dx, y: y + dy, translationX: dx, translationY: dy };
  let winner = moved ?? stillWinner(gestureOf(testID), failed);
  winner?.onActivate?.(at);
  for (const pan of touched)
    if (!failed.has(keyOf(pan)) && keyOf(pan) !== keyOf(winner ?? {}))
      pan.onFinalize?.({ ...at, canceled: true });
  const taken = Option.fromNullishOr(winner?.testID);
  const current = () =>
    Option.filter(
      Option.map(taken, (id) => gestureOf(id)),
      () => winner !== undefined,
    );
  const end = (canceled: boolean, touch: Touch) =>
    Option.map(current(), (pan) => {
      pan.onDeactivate?.({ ...touch, canceled });
      pan.onFinalize?.({ ...touch, canceled });
      winner = undefined;
    });
  let last: Touch = at;
  return {
    taken,
    move: (mx, my) =>
      Option.map(current(), (pan) => {
        last = { x: x + mx, y: y + my, translationX: mx, translationY: my };
        pan.onUpdate?.(last);
      }),
    lift: () => end(false, last),
    cancel: () => end(true, last),
  };
};

/** Which ends first as a still finger lifts: the tap's activation, or the pans' failure. UIKit gives no order. */
export type TapOrder = 'tap-first' | 'pans-first';

/** A still finger lands at `x`, `y` on the detector of the tap `testID`: each pan it reaches begins, then the tap. */
export const touchDown = (testID: string, { x = 0, y = 0 }: { x?: number; y?: number }) => {
  const start = gestureOf(testID);
  for (const pan of pansAt(start)) pan.onBegin?.({ x, y });
  if (start.enabled !== false) start.onBegin?.({ x, y });
};

/**
 * The still finger lifts where it landed: each pan it reached fails (its
 * `onFinalize` canceled, never activated), and an enabled tap activates and
 * ends, in `order`. Each gesture is read as its detector last drew it.
 */
export const touchUp = (
  testID: string,
  { x = 0, y = 0 }: { x?: number; y?: number },
  order: TapOrder,
) => {
  const start = gestureOf(testID);
  const touch = { x, y };
  const fail = () => {
    for (const pan of pansAt(start)) pan.onFinalize?.({ ...touch, canceled: true });
  };
  const end = () => {
    if (start.enabled === false) return;
    start.onActivate?.(touch);
    start.onDeactivate?.({ ...touch, canceled: false });
    start.onFinalize?.({ ...touch, canceled: false });
  };
  if (order === 'tap-first') {
    end();
    fail();
  } else {
    fail();
    end();
  }
};
