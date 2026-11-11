/**
 * The key button's press, as a rule, pure: a tap, a hold, and the wheel a
 * hold opens. A press that lifts within `HOLD` ms, having moved less than
 * `SLOP` points, is a tap. One that moves `SLOP` or more first does nothing,
 * since the bar's swipe or the page took it. One held `HOLD` ms opens the
 * wheel around where it landed when the press offers it (`Setup.wheel`:
 * chords on, on a hymn with a printed key); otherwise the hold is `Hold`,
 * chords on, and no wheel opens.
 *
 * The wheel's items fan up and to the right of its origin (`ANGLES`, 0° to
 * the right, 90° up), `RADIUS` points out, 26° apart: the Tuner (only with
 * the ear), Key ♭, Key ♯, Reset and Chords off. Its origin is the press
 * point held at least `Setup.left` from the screen's left edge, so the
 * Tuner is never clipped, and no lower than `Setup.bottom`, so Chords off
 * stays above the home indicator. Still holding, the finger slides: the item
 * under it is the one whose angle is nearest the finger's, if within
 * `REACH` degrees and the finger is more than `DEAD` points from the
 * origin. Entering an item is `Enter` (a tick), and letting go over one is
 * `Pick`, once; letting go in the middle, or a cancelled touch, does nothing.
 *
 * Time comes with each event (`t`, in milliseconds): a `Tick` tells the
 * clock alone, and an event that comes `HOLD` ms or more after the press
 * landed comes after the hold, as the platform's own hold has fired by then.
 */

import { Data, Option } from 'effect';

/** How long a press is held, still, before it opens the wheel or turns chords on. */
export const HOLD = 350;

/** How far a press may drift before its hold, in points, and stay a press. */
export const SLOP = 10;

/** How far the items stand from the wheel's origin, in points. */
export const RADIUS = 140;

/** How far from the origin the finger goes, in points, before it is over an item. */
export const DEAD = 34;

/** How far the finger's angle may lie from an item's, in degrees, for it to be over that item. */
export const REACH = 20;

export type Item = 'tuner' | 'keyDown' | 'keyUp' | 'reset' | 'chords';

/** Each item's angle from the origin, in degrees: 0° to the right, 90° up. */
export const ANGLES: Readonly<Record<Item, number>> = {
  tuner: 98,
  keyDown: 72,
  keyUp: 46,
  reset: 20,
  chords: -6,
};

/** The wheel's items, the Tuner first: the Tuner only with the ear. */
export const itemsOf = (ear: boolean): ReadonlyArray<Item> => {
  const rest: ReadonlyArray<Item> = ['keyDown', 'keyUp', 'reset', 'chords'];
  if (ear) return ['tuner', ...rest];
  return rest;
};

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** What a press is offered as it lands. */
export interface Setup {
  /** Whether a hold opens the wheel (chords on, on a hymn with a printed key); else a hold is `Hold`. */
  readonly wheel: boolean;
  /** Whether the device has the tuner's ear: the Tuner is an item only then. */
  readonly ear: boolean;
  /** The least x the wheel's origin takes, in the press's own coordinates. */
  readonly left: number;
  /** The greatest y the wheel's origin takes, in the press's own coordinates. */
  readonly bottom: number;
}

export type WheelEvent = Data.TaggedEnum<{
  /** A finger lands at `x`, `y`. */
  Down: { readonly x: number; readonly y: number; readonly t: number; readonly setup: Setup };
  /** The finger is at `x`, `y`. */
  Move: { readonly x: number; readonly y: number; readonly t: number };
  /** The finger lifts. */
  Up: { readonly t: number };
  /** The platform cancels the touch. */
  Cancel: {};
  /** The clock reads `t`. */
  Tick: { readonly t: number };
}>;
export const WheelEvent = Data.taggedEnum<WheelEvent>();

export type Wheel = Data.TaggedEnum<{
  /** No press, or a press that has ended. */
  Idle: {};
  /** A finger down since `t0` at `at`, its hold not yet come. */
  Pressing: { readonly t0: number; readonly at: Point; readonly setup: Setup };
  /** The wheel open around `origin`, with the item the finger is over. */
  Open: {
    readonly origin: Point;
    readonly items: ReadonlyArray<Item>;
    readonly over: Option.Option<Item>;
  };
}>;
export const Wheel = Data.taggedEnum<Wheel>();

/** What a step does. */
export type Out = Data.TaggedEnum<{
  /** A tap of the key button. */
  Tap: {};
  /** A hold with no wheel offered: chords on or off. */
  Hold: {};
  /** The finger entered `item`: a tick. */
  Enter: { readonly item: Item };
  /** The finger let go over `item`: do it. */
  Pick: { readonly item: Item };
}>;
export const Out = Data.taggedEnum<Out>();

export interface Step {
  readonly wheel: Wheel;
  readonly outs: ReadonlyArray<Out>;
}

/** No press. */
export const idle: Wheel = Wheel.Idle();

/** The wheel's origin for a press at `at`: held right of `left` and above `bottom`. */
export const originOf = (at: Point, setup: Setup): Point => ({
  x: Math.max(at.x, setup.left),
  y: Math.min(at.y, setup.bottom),
});

/** Where `item` stands from `origin`, in screen coordinates (y down). */
export const placeOf = (origin: Point, item: Item): Point => {
  const radians = (ANGLES[item] * Math.PI) / 180;
  return {
    x: origin.x + RADIUS * Math.cos(radians),
    y: origin.y - RADIUS * Math.sin(radians),
  };
};

/** The difference of two angles in degrees, -180 to 180. */
const turn = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/** The item among `items` the finger at `at` is over, from `origin`. */
export const overOf = (
  origin: Point,
  items: ReadonlyArray<Item>,
  at: Point,
): Option.Option<Item> => {
  const dx = at.x - origin.x;
  const dy = origin.y - at.y;
  if (Math.hypot(dx, dy) <= DEAD) return Option.none();
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const nearest = items.reduce<Option.Option<Item>>((best, item) => {
    const off = Math.abs(turn(angle, ANGLES[item]));
    const kept = Option.filter(best, (other) => Math.abs(turn(angle, ANGLES[other])) <= off);
    if (Option.isSome(kept)) return kept;
    return Option.some(item);
  }, Option.none());
  return Option.filter(nearest, (item) => Math.abs(turn(angle, ANGLES[item])) <= REACH);
};

/** A press landing. */
const pressed = (down: Extract<WheelEvent, { readonly _tag: 'Down' }>): Step => ({
  wheel: Wheel.Pressing({ t0: down.t, at: { x: down.x, y: down.y }, setup: down.setup }),
  outs: [],
});

/** The hold of a press: the wheel when the press offers it, else `Hold`. */
const held = (at: Point, setup: Setup): Step => {
  if (!setup.wheel) return { wheel: idle, outs: [Out.Hold()] };
  return {
    wheel: Wheel.Open({
      origin: originOf(at, setup),
      items: itemsOf(setup.ear),
      over: Option.none(),
    }),
    outs: [],
  };
};

/** The open wheel's step for `event`. */
const inWheel = (open: Extract<Wheel, { readonly _tag: 'Open' }>, event: WheelEvent): Step =>
  WheelEvent.$match(event, {
    Down: (down) => pressed(down),
    Move: ({ x, y }) => {
      const over = overOf(open.origin, open.items, { x, y });
      const entered = Option.filter(over, (item) => !Option.contains(open.over, item));
      return {
        wheel: Wheel.Open({ ...open, over }),
        outs: Option.toArray(Option.map(entered, (item) => Out.Enter({ item }))),
      };
    },
    Up: () => ({
      wheel: idle,
      outs: Option.toArray(Option.map(open.over, (item) => Out.Pick({ item }))),
    }),
    Cancel: () => ({ wheel: idle, outs: [] }),
    Tick: () => ({ wheel: open, outs: [] }),
  });

/** The time an event tells, if it tells one. */
const timeOf = (event: WheelEvent): Option.Option<number> =>
  WheelEvent.$match(event, {
    Down: ({ t }) => Option.some(t),
    Move: ({ t }) => Option.some(t),
    Up: ({ t }) => Option.some(t),
    Cancel: () => Option.none(),
    Tick: ({ t }) => Option.some(t),
  });

/** A pressing step for `event`, which comes before the hold. */
const beforeHold = (
  press: Extract<Wheel, { readonly _tag: 'Pressing' }>,
  event: WheelEvent,
): Step =>
  WheelEvent.$match(event, {
    Down: (down) => pressed(down),
    Move: ({ x, y }) => {
      if (Math.hypot(x - press.at.x, y - press.at.y) >= SLOP) return { wheel: idle, outs: [] };
      return { wheel: press, outs: [] };
    },
    Up: () => ({ wheel: idle, outs: [Out.Tap()] }),
    Cancel: () => ({ wheel: idle, outs: [] }),
    Tick: () => ({ wheel: press, outs: [] }),
  });

/** The step of a press for `event`: when it comes at or after the hold, the hold comes first. */
const inPress = (press: Extract<Wheel, { readonly _tag: 'Pressing' }>, event: WheelEvent): Step => {
  const late =
    !WheelEvent.$is('Down')(event) && Option.exists(timeOf(event), (t) => t >= press.t0 + HOLD);
  if (!late) return beforeHold(press, event);
  const hold = held(press.at, press.setup);
  const after = Wheel.$match(hold.wheel, {
    Idle: () => ({ wheel: idle, outs: [] }),
    Pressing: () => ({ wheel: hold.wheel, outs: [] }),
    Open: (open) => inWheel(open, event),
  });
  return { wheel: after.wheel, outs: [...hold.outs, ...after.outs] };
};

/** The press's next state after `event`, and what it does. */
export const step = (wheel: Wheel, event: WheelEvent): Step =>
  Wheel.$match(wheel, {
    Idle: () => {
      if (WheelEvent.$is('Down')(event)) return pressed(event);
      return { wheel, outs: [] };
    },
    Pressing: (press) => inPress(press, event),
    Open: (open) => inWheel(open, event),
  });
