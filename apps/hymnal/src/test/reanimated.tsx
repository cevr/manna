/* oxlint-disable effect/noNullish, effect/noRuntimeTypeof, effect/noUnknownParameters, effect/noUnsafeDictionaryType -- a stand-in for Reanimated keeps its API: a reaction's first previous value is null, and an animation is told from a value by its shape. */

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
  readonly config?: unknown;
}

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

export const animations: Array<{
  readonly kind: Kind;
  readonly from: unknown;
  readonly to: unknown;
}> = [];

let held = false;
const waiting = new Map<
  SharedValue<unknown>,
  {
    readonly land: () => void;
    readonly stop: () => void;
    readonly step: (ms: number) => boolean;
    readonly replaced: () => void;
  }
>();

const late: Array<() => void> = [];
const tellLate = () => {
  for (const owed of late.splice(0)) owed();
};

export const holdAnimations = () => {
  held = true;
};

export const landAnimations = () => {
  held = false;
  tellLate();
  for (const [, { land }] of [...waiting]) land();
  waiting.clear();
};

export const stepAnimations = (ms = 16): boolean => {
  tellLate();
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
      waiting.get(box as SharedValue<unknown>)?.replaced();
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
        let ran = 0;
        if (held) {
          waiting.set(box as SharedValue<unknown>, {
            land,
            stop: () => {
              if (ran === 0 && typeof now === 'number' && typeof next.to === 'number')
                now = (now + (next.to - now) / 2) as T;
              tell();
              if (ran === 0) next.done?.(false);
              else late.push(() => next.done?.(false));
            },
            replaced: () => {
              if (ran > 0) late.push(() => next.done?.(false));
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
      if (next === now) return;
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

export const withDelay = <T,>(_ms: number, next: T): T => next;

export const withSequence = <T,>(...steps: ReadonlyArray<T>): T => steps.at(-1) as T;

export const useReducedMotion = () => false;

export const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' } as const;

export const cancelAnimation = (value: SharedValue<unknown>) => {
  const under = waiting.get(value);
  if (under === undefined) return;
  waiting.delete(value);
  under.stop();
};

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

const animated = <P extends object>(Plain: ComponentType<P>) =>
  forwardRef<
    unknown,
    P & { readonly entering?: unknown; readonly exiting?: unknown; readonly children?: ReactNode }
  >(function Animated({ entering: _in, exiting: _out, ...props }, ref) {
    return <Plain {...(props as P)} ref={ref} />;
  });

export const useAnimatedRef = <T,>() => useRef<T | null>(null);

export const scrollTo = (_ref: unknown, _x: number, _y: number, _animated: boolean) => {};

export const useAnimatedProps = <P,>(props: () => P): P => props();

export const useScrollViewOffset = (_ref: unknown, _offset: SharedValue<number>) => {};

const Animated = {
  View: animated(View),
  Text: animated(Text),
  ScrollView: animated(ScrollView),
  createAnimatedComponent: animated,
};

export default Animated;

const layout: Record<string, unknown> = {};
for (const step of ['duration', 'delay', 'springify', 'damping', 'withInitialValues'])
  layout[step] = () => layout;
export const FadeIn = layout;
export const FadeOut = layout;
export const FadeInDown = layout;
export const FadeOutDown = layout;

export class Keyframe {
  duration(_ms: number) {
    return this;
  }
}

export const scheduleOnRN = <A extends ReadonlyArray<unknown>>(
  run: (...args: A) => void,
  ...args: A
) => run(...args);
export const runOnJS =
  <A extends ReadonlyArray<unknown>>(run: (...args: A) => void) =>
  (...args: A) =>
    run(...args);
