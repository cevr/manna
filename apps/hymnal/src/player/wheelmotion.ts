/**
 * The key button's wheel in motion, pure: where each item stands, how large
 * and how seen, at a clock's milliseconds, so the view drives one clock and
 * a test reads any frame. A `Pose` is relative to the wheel's origin, the
 * key button's centre (`wheel.ts`).
 *
 * Enter: each item springs out of the key button along its ray to its slot
 * (`ENTER`: a response of 0.30 s and a damping ratio of 0.72, about 4 %
 * over), the nearest first, each `ENTER.stagger` ms after the one before,
 * growing from `ENTER.smallest` and seen by a third of its way. Exit (a
 * release or a cancel): each goes back along its ray from where it stood
 * at the release into the key button on an ease-in (`EXIT`), the farthest
 * first; a picked item goes last, so it stays lit longest. The backdrop dims
 * in on an ease-out and out on a line (`BACKDROP`). With Reduce Motion the
 * items stand at their slots at their size and fade (`REDUCED`).
 *
 * Every function a frame calls is a worklet, so the view's animated styles
 * read these poses on the UI thread.
 */

import { type Item, slotOf } from './wheel';

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
}

/** The enter's spring (its response in seconds and damping ratio), each item's delay after the one nearer, and the size it starts at. */
export const ENTER = { response: 0.3, damping: 0.72, stagger: 22, smallest: 0.35 } as const;

/** The exit's run for one item, and each item's delay after the one farther out, in ms. */
export const EXIT = { duration: 170, stagger: 14 } as const;

/** Reduce Motion's fades in and out, in ms. */
export const REDUCED = { enter: 120, exit: 100 } as const;

/** The backdrop's opacity while the wheel is up, and its fades in and out, in ms. */
export const BACKDROP = { opacity: 0.7, enter: 180, exit: 160 } as const;

/** How much the bar's other controls and the find bar fade for each step of the backdrop: at its full 0.7 they stand at 0.23. */
export const FADE = 1.1;

/** How near its slot, in points, an item counts as settled. */
const SETTLED = 0.5;

const clamp = (value: number, low: number, high: number) => {
  'worklet';
  return Math.min(high, Math.max(low, value));
};

/** The enter's spring at `ms`: 0 at its start, toward 1. */
const spring = (ms: number) => {
  'worklet';
  if (ms <= 0) return 0;
  const t = ms / 1000;
  const natural = (2 * Math.PI) / ENTER.response;
  const decay = ENTER.damping * natural;
  const damped = natural * Math.sqrt(1 - ENTER.damping * ENTER.damping);
  return (
    1 - Math.exp(-decay * t) * (Math.cos(damped * t) + (decay / damped) * Math.sin(damped * t))
  );
};

/** The exit's ease-in, the cubic Bézier (0.4, 0, 0.84, 0.44), at `x` from 0 to 1. */
const easeIn = (x: number) => {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const along = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
  let low = 0;
  let high = 1;
  for (let k = 0; k < 24; k += 1) {
    const mid = (low + high) / 2;
    if (along(0.4, 0.84, mid) < x) low = mid;
    else high = mid;
  }
  return along(0, 0.44, (low + high) / 2);
};

/** How far `item`'s slot lies from the origin, in points. */
const reachOf = (item: Item) => {
  'worklet';
  const slot = slotOf(item);
  return Math.hypot(slot.x, slot.y);
};

/** How many of `items` lie nearer the origin than `item`. */
const nearerOf = (item: Item, items: ReadonlyArray<Item>) => {
  'worklet';
  const reach = reachOf(item);
  return items.filter((other) => reachOf(other) < reach).length;
};

/** `item` `travel` of its way out along its ray, its opacity a further `seen` of its own. */
const poseAt = (item: Item, travel: number, seen = 1): Pose => {
  'worklet';
  const slot = slotOf(item);
  return {
    x: slot.x * travel,
    y: slot.y * travel,
    scale: ENTER.smallest + (1 - ENTER.smallest) * travel,
    opacity: clamp(3 * travel, 0, 1) * clamp(seen, 0, 1),
  };
};

/** `item` at its slot at its size, `seen` of the way in. */
const still = (item: Item, seen: number): Pose => {
  'worklet';
  const slot = slotOf(item);
  return { x: slot.x, y: slot.y, scale: 1, opacity: clamp(seen, 0, 1) };
};

/** How far along its ray `item` stands `ms` into the enter: 0 at the origin, 1 at its slot. */
export const travelAt = (item: Item, items: ReadonlyArray<Item>, ms: number) => {
  'worklet';
  return spring(ms - nearerOf(item, items) * ENTER.stagger);
};

/** `item`'s pose `ms` into the enter, with Reduce Motion on or off. */
export const enterPose = (
  item: Item,
  items: ReadonlyArray<Item>,
  ms: number,
  reduced: boolean,
): Pose => {
  'worklet';
  if (reduced) return still(item, ms / REDUCED.enter);
  return poseAt(item, travelAt(item, items, ms));
};

/**
 * `item`'s pose `ms` into the exit, from `from` of its way out (its travel
 * at the release), with Reduce Motion on or off; `picked` goes in last.
 */
export const exitPose = (
  item: Item,
  items: ReadonlyArray<Item>,
  from: number,
  ms: number,
  reduced: boolean,
  // oxlint-disable-next-line effect/noNullish -- a worklet reads the picked item as a plain value: an Option does not cross to the UI thread.
  picked: Item | null,
): Pose => {
  'worklet';
  if (reduced) return still(item, 1 - ms / REDUCED.exit);
  const turn = (picked === item && items.length) || items.length - 1 - nearerOf(item, items);
  const run = clamp((ms - turn * EXIT.stagger) / EXIT.duration, 0, 1);
  return poseAt(item, from * (1 - easeIn(run)));
};

/** The first ms of the enter at which every item stands within `SETTLED` points of its slot. */
export const enterEnd = (items: ReadonlyArray<Item>, reduced: boolean) => {
  if (reduced) return REDUCED.enter;
  const settled = (ms: number) =>
    items.every((item) => Math.abs(1 - travelAt(item, items, ms)) * reachOf(item) <= SETTLED);
  let ms = 0;
  while (!settled(ms)) ms += 1;
  return ms;
};

/** The ms by which every item is back in the key button and unseen. */
export const exitEnd = (items: ReadonlyArray<Item>, reduced: boolean) => {
  if (reduced) return REDUCED.exit;
  return items.length * EXIT.stagger + EXIT.duration;
};

/** The backdrop's opacity `ms` into the enter or the exit, with Reduce Motion on or off. */
export const backdropAt = (phase: 'enter' | 'exit', ms: number, reduced: boolean) => {
  'worklet';
  if (phase === 'enter') {
    const k = clamp(ms / ((reduced && REDUCED.enter) || BACKDROP.enter), 0, 1);
    return BACKDROP.opacity * (1 - (1 - k) ** 3);
  }
  const k = clamp(ms / ((reduced && REDUCED.exit) || BACKDROP.exit), 0, 1);
  return BACKDROP.opacity * (1 - k);
};
