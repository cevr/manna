import { Option } from 'effect';
import type { EaseName } from './schema.ts';

type Ease = (t: number) => number;

interface TimecodeParts {
  readonly negative: boolean;
  readonly hh: string;
  readonly mm: string;
  readonly ss: string;
  readonly ff: string;
}

const countedWhole = (fps: number): boolean => onGrid(fps) || onGrid((fps * 1001) / 1000);

const onGrid = (rate: number): boolean => Math.abs(rate - Math.round(rate)) < GRID_NUDGE;

const two = (n: number): string => (n < 10 ? `0${n}` : String(n));

export const frameRead = (seconds: number, fps: number): number => Math.round(seconds * fps);

const timecodeParts = (seconds: number, fps: number): TimecodeParts => {
  const frames = frameRead(Math.abs(seconds), fps);
  const perSecond = Math.max(1, Math.round(fps));
  const counted = countedWhole(fps);
  const firstFrameOf = (second: number) =>
    counted ? second * perSecond : frameAtOrAfter(second, fps);
  const near = Math.floor(frames / (counted ? perSecond : fps));
  let whole = near + 1;
  while (whole >= near - 1 && firstFrameOf(whole) > frames) whole--;
  if (whole < near - 1) whole = 0;
  const within = frames - firstFrameOf(whole);
  return {
    negative: seconds < 0 && frames > 0,
    hh: two(Math.floor(whole / 3600)),
    mm: two(Math.floor((whole % 3600) / 60)),
    ss: two(whole % 60),
    ff: two(within),
  };
};

export const timecode = (seconds: number, fps: number): string => {
  const p = timecodeParts(seconds, fps);
  return `${p.negative ? '−' : ''}${p.hh}:${p.mm}:${p.ss}:${p.ff}`;
};

export const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const ss = String(whole % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
};

export interface Interval {
  readonly from: number;
  readonly to: number;
}

export const toMs = (v: number): number => Math.round(v * 1000) / 1000 + 0;

const GRID_NUDGE = 1e-6;

export const frameAtOrAfter = (t: number, fps: number): number => Math.ceil(t * fps - GRID_NUDGE);

export const frameAtOrBefore = (t: number, fps: number): number => Math.floor(t * fps + GRID_NUDGE);

export const secondsAt = (frame: number, fps: number): number => frame / fps;

const frameOn = (t: number, fps: number): Option.Option<number> => {
  const frame = frameRead(t, fps);
  return Option.liftPredicate(frame, () => secondsAt(frame, fps) === t);
};

export const movedFrames = (t: number, frames: number, fps: number): number =>
  Option.match(frameOn(t, fps), {
    onSome: (frame) => secondsAt(frame + frames, fps),
    onNone: () => t + secondsAt(frames, fps),
  });

export const TICKS_PER_FRAME = 1_000_000;

export const ticksAt = (t: number, fps: number): number => Math.round(t * fps * TICKS_PER_FRAME);

export const secondsOfTicks = (n: number, fps: number): number => n / (fps * TICKS_PER_FRAME);

export const framesOf = (span: Interval, fps: number) => ({
  first: frameAtOrAfter(span.from, fps),
  last: frameAtOrAfter(span.to, fps) - 1,
});

export const onTheMs = (T: number): number => frameAtOrAfter(T, 1000) / 1000;

export const CLOCK_EPSILON = 1e-9;

const MILLISECOND = 1e-3;

export const heardAtOrAfter = (word: { readonly start: number }, mark: number): boolean =>
  word.start >= mark - MILLISECOND;

export const justBefore = (T: number): number => T - MILLISECOND;

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (a === b ? 0 : (v - a) / (b - a));

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - t) ** 4,
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  inSine: (t) => (t >= 1 ? 1 : 1 - Math.cos((Math.PI * t) / 2)),
  inOutSine: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  outBack: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outSoft: (t) => 1 - (1 - t) ** 3 * Math.cos(t * Math.PI * 1.1),
} satisfies Record<string, Ease>;

export const DEFAULT_EASE = 'inOutCubic' satisfies keyof typeof ease;

export const progress = (t: number, start: number, dur: number, e: Ease = ease[DEFAULT_EASE]) =>
  dur <= 0 ? (t >= start ? 1 : 0) : e(clamp((t - start) / dur));

export const gait = (t: number, walk: { readonly start: number; readonly end: number }): number =>
  t > walk.start && t < walk.end ? Math.abs(Math.sin((t - walk.start) * 7)) * 5 : 0;

export const staggered = (p: number, at: number, share: number): number =>
  share >= 1 ? (p >= at ? 1 : 0) : clamp((p - share * at) / (1 - share));

export type Key = readonly [time: number, value: number, ease?: EaseName];

export const keys = (
  t: number,
  frames: ReadonlyArray<Key>,
  fallback: EaseName = DEFAULT_EASE,
): number => {
  const first = frames[0];
  if (first === undefined) return 0;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (prev === undefined || next === undefined) break;
    if (t <= next[0]) {
      const e = ease[next[2] ?? fallback];
      return lerp(prev[1], next[1], e(invLerp(prev[0], next[0], t)));
    }
  }
  return frames[frames.length - 1]?.[1] ?? 0;
};
