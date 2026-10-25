/* oxlint-disable effect/noNullish, effect/noRuntimeTypeof, effect/noUnknownParameters, effect/noUnsafeDictionaryType -- a stand-in for Reanimated keeps its API: a reaction's first previous value is null, and an animation is told from a value by its shape. */

/**
 * `react-native-reanimated` and `react-native-worklets` as the app's tests
 * see them: the parts the bar and its dials use, run on the JavaScript
 * thread. A shared value is a box; an animation set on it (`withSpring`,
 * `withTiming`) lands on its target at once and calls its callback, as an
 * animation that has settled would; an animated style and a reaction run
 * again whenever any shared value is set. A worklet scheduled on React
 * Native's thread runs at once. A test reads each frame as it is once its
 * animations have settled.
 *
 * Each animation is kept in `animations`, with where its value began, so a
 * test reads where a spring started. Between `holdAnimations` and
 * `landAnimations` an animation waits, as one under way on a device, and
 * `cancelAnimation` stops it half way.
 *
 * A test that reads every frame steps the waiting timings instead
 * (`stepAnimations`): each moves along its own duration and curve (the
 * curves of `Easing` are Reanimated's own), a frame at a time, and lands at
 * its end; `cancelAnimation` stops a stepped one where it stands.
 */

import {
  type ComponentType,
  forwardRef,
  type ReactNode,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import { ScrollView, Text, View } from 'react-native';

type Listener = () => void;
const listeners = new Set<Listener>();
const tell = () => {
  for (const listener of [...listeners]) listener();
};

type Kind = 'spring' | 'timing';

interface Animation<T> {
  readonly animation: Kind;
  readonly to: T;
  readonly done?: (finished: boolean) => void;
  /** The config it was set with: a timing's duration and easing. */
  readonly config?: unknown;
}

/** Reanimated's timing defaults: 300 ms, on a quadratic ease in and out. */
const TIMING = 300;
const curveOf = (config: unknown): ((t: number) => number) => {
  if (typeof config === 'object' && config !== null && 'easing' in config)
    if (typeof config.easing === 'function') return config.easing as (t: number) => number;
  return Easing.inOut(Easing.quad);
};
const durationOf = (config: unknown): number => {
  if (typeof config === 'object' && config !== null && 'duration' in config)
    if (typeof config.duration === 'number') return config.duration;
  return TIMING;
};

const isAnimation = <T,>(next: T | Animation<T>): next is Animation<T> =>
  typeof next === 'object' && next !== null && 'animation' in next;

/** Each animation set on a shared value: its kind, where the value was as it began, and its target. */
export const animations: Array<{
  readonly kind: Kind;
  readonly from: unknown;
  readonly to: unknown;
}> = [];

/** While held, an animation set waits, unlanded, until `landAnimations`, or a `cancelAnimation` stops it. */
let held = false;
const waiting = new Map<
  SharedValue<unknown>,
  {
    readonly land: () => void;
    readonly stop: () => void;
    /** Moves it on by `ms`; whether it still runs after (a spring waits until landed). */
    readonly step: (ms: number) => boolean;
  }
>();

/** Animations set from now wait, as ones under way on a device. */
export const holdAnimations = () => {
  held = true;
};

/** Every waiting animation lands, and animations land at once again. */
export const landAnimations = () => {
  held = false;
  for (const [, { land }] of [...waiting]) land();
  waiting.clear();
};

/**
 * Every waiting timing moves on by `ms` (a frame, 16 ms, at most), as a
 * device draws its next frame, and lands once its duration has passed. It
 * gives whether a timing still runs after it; a spring waits until landed.
 */
export const stepAnimations = (ms = 16): boolean => {
  let running = false;
  for (const [, { step }] of [...waiting]) running = step(ms) || running;
  return running;
};

export interface SharedValue<T> {
  value: T;
  get: () => T;
  set: (next: T | Animation<T>) => void;
}

const shared = <T,>(initial: T): SharedValue<T> => {
  let now = initial;
  const box: SharedValue<T> = {
    get value() {
      return now;
    },
    set value(next: T) {
      box.set(next);
    },
    get: () => now,
    set: (next: T | Animation<T>) => {
      waiting.delete(box as SharedValue<unknown>);
      if (isAnimation(next)) {
        const from = now;
        animations.push({ kind: next.animation, from, to: next.to });
        const land = () => {
          waiting.delete(box as SharedValue<unknown>);
          now = next.to;
          tell();
          next.done?.(true);
        };
        // How long a stepped timing has run; 0 until a test steps it.
        let ran = 0;
        if (held) {
          waiting.set(box as SharedValue<unknown>, {
            land,
            // A stopped animation stops half way, or where a step left it, and says it did not finish.
            stop: () => {
              if (ran === 0 && typeof now === 'number' && typeof next.to === 'number')
                now = (now + (next.to - now) / 2) as T;
              tell();
              next.done?.(false);
            },
            step: (ms) => {
              if (next.animation !== 'timing') return false;
              const duration = durationOf(next.config);
              ran += ms;
              if (ran >= duration || typeof from !== 'number' || typeof next.to !== 'number') {
                land();
                return false;
              }
              now = (from + (next.to - from) * curveOf(next.config)(ran / duration)) as T;
              tell();
              return true;
            },
          });
          return;
        }
        land();
        return;
      }
      now = next;
      tell();
    },
  };
  return box;
};

export const makeMutable = shared;

export const useSharedValue = <T,>(initial: T): SharedValue<T> => {
  const box = useRef<SharedValue<T> | null>(null);
  box.current ??= shared(initial);
  return box.current;
};

const animate =
  (kind: Kind) =>
  <T,>(to: T, config?: unknown, done?: (finished: boolean) => void): T =>
    ({ animation: kind, to, done, config }) as unknown as T;

export const withSpring = animate('spring');
export const withTiming = animate('timing');

/** A delayed animation is the animation: it lands at once with the rest. */
export const withDelay = <T,>(_ms: number, next: T): T => next;

/** A sequence lands where its last step goes, and calls that step's callback. */
export const withSequence = <T,>(...steps: ReadonlyArray<T>): T => steps.at(-1) as T;

/** Whether the device asks for reduced motion: a test's device does not. */
export const useReducedMotion = () => false;

/** How an animation answers the device's reduced-motion setting. */
export const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' } as const;

/** A waiting animation stops half way along, as a touch stops one under way. */
export const cancelAnimation = (value: SharedValue<unknown>) => {
  const under = waiting.get(value);
  if (under === undefined) return;
  waiting.delete(value);
  under.stop();
};

/** Draws again whenever a shared value is set. */
const useTold = () => {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => void listeners.delete(force);
  }, []);
};

export const useAnimatedStyle = <S,>(style: () => S): S => {
  useTold();
  return style();
};

export const useDerivedValue = <T,>(derive: () => T) => {
  useTold();
  return { value: derive(), get: derive };
};

export const useAnimatedReaction = <T,>(
  prepare: () => T,
  react: (now: T, before: T | null) => void,
) => {
  const live = useRef({ prepare, react });
  live.current = { prepare, react };
  useEffect(() => {
    let before: T | null = null;
    const check = () => {
      const now = live.current.prepare();
      if (now === before) return;
      const was = before;
      before = now;
      live.current.react(now, was);
    };
    check();
    listeners.add(check);
    return () => void listeners.delete(check);
  }, []);
};

type Curve = (t: number) => number;

/** A cubic Bézier from (0, 0) to (1, 1) through (x1, y1) and (x2, y2), as CSS draws one: y at x, x found by halving. */
const bezier = (x1: number, y1: number, x2: number, y2: number): Curve => {
  const at = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  return (t) => {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 40; k += 1) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
};

/** Reanimated's curves, each from 0 at 0 to 1 at 1 (`exp`'s ends a thousandth off, as Reanimated's are). */
export const Easing = {
  linear: (t: number) => t,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  exp: (t: number) => 2 ** (10 * (t - 1)),
  in: (easing: Curve): Curve => easing,
  out:
    (easing: Curve): Curve =>
    (t) =>
      1 - easing(1 - t),
  inOut:
    (easing: Curve): Curve =>
    (t) => {
      if (t < 0.5) return easing(t * 2) / 2;
      return 1 - easing((1 - t) * 2) / 2;
    },
  bezier,
};

/** A view that takes Reanimated's layout props and draws as a plain one. */
const animated = <P extends object>(Plain: ComponentType<P>) =>
  forwardRef<
    unknown,
    P & { readonly entering?: unknown; readonly exiting?: unknown; readonly children?: ReactNode }
  >(function Animated({ entering: _in, exiting: _out, ...props }, ref) {
    return <Plain {...(props as P)} ref={ref} />;
  });

/** An animated view's ref: a plain one. */
export const useAnimatedRef = <T,>() => useRef<T | null>(null);

/** A scroll view's offset written to a shared value: a test writes the value itself. */
export const useScrollViewOffset = (_ref: unknown, _offset: SharedValue<number>) => {};

const Animated = {
  View: animated(View),
  Text: animated(Text),
  ScrollView: animated(ScrollView),
  createAnimatedComponent: animated,
};

export default Animated;

/** A layout animation's builder: every step gives the builder again. */
const layout: Record<string, unknown> = {};
for (const step of ['duration', 'delay', 'springify', 'damping', 'withInitialValues'])
  layout[step] = () => layout;
export const FadeIn = layout;
export const FadeOut = layout;
export const FadeInDown = layout;
export const FadeOutDown = layout;

/** `react-native-worklets`: a function scheduled on React Native's thread runs at once. */
export const scheduleOnRN = <A extends ReadonlyArray<unknown>>(
  run: (...args: A) => void,
  ...args: A
) => run(...args);
export const runOnJS =
  <A extends ReadonlyArray<unknown>>(run: (...args: A) => void) =>
  (...args: A) =>
    run(...args);
