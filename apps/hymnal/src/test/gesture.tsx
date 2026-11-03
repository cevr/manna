/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noRuntimeTypeof -- a stand-in for the gesture handler: a gesture a test asks for and no detector drew is a broken test, and an offset is a number or a range, as the handler takes it. */

import { Option } from 'effect';
import { createContext, type ReactNode, use } from 'react';
import { View } from 'react-native';

interface Touch {
  readonly x: number;
  readonly y?: number;
  readonly translationX?: number;
  readonly translationY?: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
  readonly scale?: number;
  readonly velocity?: number;
}

type Offset = number | readonly [number, number];

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
  readonly onBegin?: (touch: Touch) => void;
  readonly onActivate?: (touch: Touch) => void;
  readonly onUpdate?: (touch: Touch) => void;
  readonly onDeactivate?: (end: Touch & { readonly canceled: boolean }) => void;
  readonly onFinalize?: (end: Touch & { readonly canceled: boolean }) => void;
}

export interface Drawn extends PanConfig {
  readonly pan: boolean;
  readonly beside: ReadonlyArray<PanConfig>;
  readonly within: ReadonlyArray<PanConfig>;
}

interface Composed {
  readonly composed: ReadonlyArray<PanConfig | Composed>;
}

export const gestures: Array<Drawn> = [];

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

const compose = (...composed: ReadonlyArray<PanConfig | Composed>): Composed => ({ composed });
export const useCompetingGestures = compose;
export const useExclusiveGestures = compose;
export const useSimultaneousGestures = compose;

const flat = (gesture: PanConfig | Composed): ReadonlyArray<PanConfig> =>
  ('composed' in gesture && gesture.composed.flatMap(flat)) || [gesture as PanConfig];

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
    ...own.map((config) => ({ ...config, pan: pans.has(config), beside: own, within: around })),
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

const past = (offset: Offset, t: number) =>
  (typeof offset === 'number' && ((offset < 0 && t < offset) || (offset >= 0 && t > offset))) ||
  (typeof offset !== 'number' && (t < offset[0] || t > offset[1]));

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

export type TapOrder = 'tap-first' | 'pans-first';

export const touchDown = (testID: string, { x = 0, y = 0 }: { x?: number; y?: number }) => {
  const start = gestureOf(testID);
  for (const pan of pansAt(start)) pan.onBegin?.({ x, y });
  if (start.enabled !== false) start.onBegin?.({ x, y });
};

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
