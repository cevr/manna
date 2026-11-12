/**
 * The key button's press, as a rule, pure: a tap, a hold, and the wheel a
 * hold opens. A press that lifts within `HOLD` ms, having moved less than
 * `SLOP` points, is a tap. One that moves `SLOP` or more first does nothing,
 * since the bar's swipe or the page took it. One held `HOLD` ms opens the
 * wheel when the press offers it (`Setup.wheel`: chords on, on a hymn with a
 * printed key); otherwise the hold is `Hold`, chords on, and no wheel opens.
 *
 * The wheel's origin is fixed by the bar, not by the press: `ORIGIN_X`
 * points from the screen's left edge, on the bar row's centre line, which is
 * the key button's own centre for its usual face. The key button itself is
 * the wheel's hub. Its items stand on the Arc (`slotOf`): rows 58 points
 * apart over the bar, their centres on a quarter ellipse up and to the right
 * of the origin, Chords off lowest and the Tuner (only with the ear)
 * highest, so each item lies in its own direction from the key button and
 * no item touches another, the bar or the find bar. Still holding, the
 * finger slides: the item under it is the one whose direction from the
 * origin is nearest the finger's (`overOf`), once the finger is more than
 * `DEAD` points out and above the bar. Entering an item is `Enter` (a
 * tick), and letting go over one is `Pick`, once; letting go in the middle
 * or over the bar, or a cancelled touch, does nothing.
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

/** How far from the origin the finger goes, in points, before it is over an item. */
export const DEAD = 34;

/** The wheel's origin from the screen's left edge, in points: the bar's padding and half a 70-point key face. */
export const ORIGIN_X = 47;

/** The bar row's top over the origin, in points: the finger over the bar is over no item. */
const BAR_TOP = -28;

/** An item's pill, in points: wide enough for the longest word, a finger tall. */
export const ITEM = { width: 112, height: 44 } as const;

/** How much the item under the finger grows. */
export const LIFT = 1.08;

export type Item = 'tuner' | 'keyDown' | 'keyUp' | 'reset' | 'chords';

/** Every item, highest first. */
const ORDER: ReadonlyArray<Item> = ['tuner', 'keyDown', 'keyUp', 'reset', 'chords'];

/** The wheel's items, the Tuner first: the Tuner only with the ear. */
export const itemsOf = (ear: boolean): ReadonlyArray<Item> => {
  if (ear) return ORDER;
  return ORDER.slice(1);
};

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** How far apart the Arc's rows stand, in points. */
const ROW = 58;

/** The lowest row's centre from the bar's top, in points (y down). */
const LOWEST = -36;

/** The Arc's quarter ellipse: its centre `x` across from the origin and `from` under the bar's top, its half-axes `across` and `up`. */
const ARC = { x: 25, across: 124, up: 320, from: 20 } as const;

/**
 * Where `item` rests from the origin, in points (y down): its row `ROW`
 * points over the one below, its centre on the quarter ellipse. The slots do
 * not move with the ear: without it the Tuner's is empty.
 */
export const slotOf = (item: Item): Point => {
  'worklet';
  const row = ORDER.length - 1 - ORDER.indexOf(item);
  const fromBarTop = LOWEST - ROW * row;
  const t = (ARC.from - fromBarTop) / ARC.up;
  return { x: ARC.x + ARC.across * Math.sqrt(1 - t * t), y: fromBarTop + BAR_TOP };
};

/** The direction of `at` from the origin, in degrees: 0° to the right, 90° up. */
const angleOf = (at: Point) => (Math.atan2(-at.y, at.x) * 180) / Math.PI;

/**
 * The item among `items` a finger at `at` (from the origin) is over: none
 * within `DEAD` points of the origin or over the bar, else the item whose
 * direction is nearest the finger's, however far out.
 */
export const overOf = (items: ReadonlyArray<Item>, at: Point): Option.Option<Item> => {
  if (Math.hypot(at.x, at.y) <= DEAD || at.y > BAR_TOP) return Option.none();
  const angle = angleOf(at);
  const off = (item: Item) => Math.abs(angle - angleOf(slotOf(item)));
  return items.reduce<Option.Option<Item>>(
    (best, item) =>
      Option.match(best, {
        onNone: () => Option.some(item),
        onSome: (other) => Option.some((off(other) <= off(item) && other) || item),
      }),
    Option.none(),
  );
};

/** What a press is offered as it lands. */
export interface Setup {
  /** Whether a hold opens the wheel (chords on, on a hymn with a printed key); else a hold is `Hold`. */
  readonly wheel: boolean;
  /** Whether the device has the tuner's ear: the Tuner is an item only then. */
  readonly ear: boolean;
  /** The wheel's origin, in the press's own coordinates. */
  readonly origin: Point;
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

/** A press landing. */
const pressed = (down: Extract<WheelEvent, { readonly _tag: 'Down' }>): Step => ({
  wheel: Wheel.Pressing({ t0: down.t, at: { x: down.x, y: down.y }, setup: down.setup }),
  outs: [],
});

/** The hold of a press: the wheel when the press offers it, else `Hold`. */
const held = (setup: Setup): Step => {
  if (!setup.wheel) return { wheel: idle, outs: [Out.Hold()] };
  return {
    wheel: Wheel.Open({ origin: setup.origin, items: itemsOf(setup.ear), over: Option.none() }),
    outs: [],
  };
};

/** The open wheel's step for `event`. */
const inWheel = (open: Extract<Wheel, { readonly _tag: 'Open' }>, event: WheelEvent): Step =>
  WheelEvent.$match(event, {
    Down: (down) => pressed(down),
    Move: ({ x, y }) => {
      const over = overOf(open.items, { x: x - open.origin.x, y: y - open.origin.y });
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
  const hold = held(press.setup);
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
