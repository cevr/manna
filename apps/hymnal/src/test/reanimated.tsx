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

interface Animation<T> {
  readonly animation: true;
  readonly to: T;
  readonly done?: (finished: boolean) => void;
}

const isAnimation = <T,>(next: T | Animation<T>): next is Animation<T> =>
  typeof next === 'object' && next !== null && 'animation' in next;

export interface SharedValue<T> {
  value: T;
  get: () => T;
  set: (next: T | Animation<T>) => void;
}

const shared = <T,>(initial: T): SharedValue<T> => {
  let now = initial;
  const box = {
    get value() {
      return now;
    },
    set value(next: T) {
      box.set(next);
    },
    get: () => now,
    set: (next: T | Animation<T>) => {
      if (isAnimation(next)) {
        now = next.to;
        tell();
        next.done?.(true);
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

const animate = <T,>(to: T, _config?: unknown, done?: (finished: boolean) => void): T =>
  ({ animation: true, to, done }) as unknown as T;

export const withSpring = animate;
export const withTiming = animate;
export const cancelAnimation = (_value: SharedValue<unknown>) => {};

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

const curve = (t: number) => t;
export const Easing = {
  linear: curve,
  cubic: curve,
  exp: curve,
  quad: curve,
  out: (_easing: unknown) => curve,
  in: (_easing: unknown) => curve,
  inOut: (_easing: unknown) => curve,
  bezier: (..._points: ReadonlyArray<number>) => curve,
};

/** A view that takes Reanimated's layout props and draws as a plain one. */
const animated = <P extends object>(Plain: ComponentType<P>) =>
  forwardRef<
    unknown,
    P & { readonly entering?: unknown; readonly exiting?: unknown; readonly children?: ReactNode }
  >(function Animated({ entering: _in, exiting: _out, ...props }, ref) {
    return <Plain {...(props as P)} ref={ref} />;
  });

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
