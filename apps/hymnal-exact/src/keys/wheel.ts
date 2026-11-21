/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module reads no effect here (docs/exact.md): the item under the finger is a plain `undefined` when none, and the rule branches plainly. */

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

/** An item's pill, in points. */
export const ITEM = { width: 112, height: 44 } as const;

/** How much the item under the finger grows. */
export const LIFT = 1.08;

export type Item = 'tuner' | 'keyDown' | 'keyUp' | 'reset' | 'chords';

/** Every item, highest first. */
const ORDER: ReadonlyArray<Item> = ['tuner', 'keyDown', 'keyUp', 'reset', 'chords'];

/** The wheel's items, the Tuner first: the Tuner only with the ear (the port has none: par-hy-tuner). */
export const itemsOf = (ear: boolean): ReadonlyArray<Item> => (ear ? ORDER : ORDER.slice(1));

/** Each item's word on the wheel. */
export const WORDS: Readonly<Record<Item, string>> = {
  tuner: 'Tuner',
  keyDown: 'Key ♭',
  keyUp: 'Key ♯',
  reset: 'Reset',
  chords: 'Chords off',
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

/** Where `item` rests from the origin, in points (y down). */
export const slotOf = (item: Item): Point => {
  const row = ORDER.length - 1 - ORDER.indexOf(item);
  const fromBarTop = LOWEST - ROW * row;
  const t = (ARC.from - fromBarTop) / ARC.up;
  return { x: ARC.x + ARC.across * Math.sqrt(1 - t * t), y: fromBarTop + BAR_TOP };
};

/** The direction of `at` from the origin, in degrees: 0° to the right, 90° up. */
const angleOf = (at: Point) => (Math.atan2(-at.y, at.x) * 180) / Math.PI;

/** The item among `items` a finger at `at` (from the origin) is over, or none. */
export const overOf = (items: ReadonlyArray<Item>, at: Point): Item | undefined => {
  if (Math.hypot(at.x, at.y) <= DEAD || at.y > BAR_TOP) return undefined;
  const angle = angleOf(at);
  const off = (item: Item) => Math.abs(angle - angleOf(slotOf(item)));
  return items.reduce<Item | undefined>(
    (best, item) => (best === undefined || off(item) < off(best) ? item : best),
    undefined,
  );
};

/** What a press is offered as it lands. */
export interface Setup {
  readonly wheel: boolean;
  readonly ear: boolean;
  readonly origin: Point;
}

export type WheelEvent =
  | {
      readonly kind: 'down';
      readonly x: number;
      readonly y: number;
      readonly t: number;
      readonly setup: Setup;
    }
  | { readonly kind: 'move'; readonly x: number; readonly y: number; readonly t: number }
  | { readonly kind: 'up'; readonly t: number }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'tick'; readonly t: number };

export type Wheel =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pressing'; readonly t0: number; readonly at: Point; readonly setup: Setup }
  | {
      readonly kind: 'open';
      readonly origin: Point;
      readonly items: ReadonlyArray<Item>;
      readonly over: Item | undefined;
    };

export type Out =
  | { readonly kind: 'tap' }
  | { readonly kind: 'hold' }
  | { readonly kind: 'enter'; readonly item: Item }
  | { readonly kind: 'pick'; readonly item: Item };

export interface Step {
  readonly wheel: Wheel;
  readonly outs: ReadonlyArray<Out>;
}

export const idle: Wheel = { kind: 'idle' };

const pressed = (down: Extract<WheelEvent, { readonly kind: 'down' }>): Step => ({
  wheel: { kind: 'pressing', t0: down.t, at: { x: down.x, y: down.y }, setup: down.setup },
  outs: [],
});

const held = (setup: Setup): Step =>
  setup.wheel
    ? {
        wheel: { kind: 'open', origin: setup.origin, items: itemsOf(setup.ear), over: undefined },
        outs: [],
      }
    : { wheel: idle, outs: [{ kind: 'hold' }] };

const inWheel = (open: Extract<Wheel, { readonly kind: 'open' }>, event: WheelEvent): Step => {
  switch (event.kind) {
    case 'down':
      return pressed(event);
    case 'move': {
      const over = overOf(open.items, { x: event.x - open.origin.x, y: event.y - open.origin.y });
      const entered = over !== undefined && over !== open.over;
      return {
        wheel: { ...open, over },
        outs: entered ? [{ kind: 'enter', item: over }] : [],
      };
    }
    case 'up':
      return {
        wheel: idle,
        outs: open.over === undefined ? [] : [{ kind: 'pick', item: open.over }],
      };
    case 'cancel':
      return { wheel: idle, outs: [] };
    case 'tick':
      return { wheel: open, outs: [] };
  }
};

const beforeHold = (
  press: Extract<Wheel, { readonly kind: 'pressing' }>,
  event: WheelEvent,
): Step => {
  switch (event.kind) {
    case 'down':
      return pressed(event);
    case 'move':
      if (Math.hypot(event.x - press.at.x, event.y - press.at.y) >= SLOP)
        return { wheel: idle, outs: [] };
      return { wheel: press, outs: [] };
    case 'up':
      return { wheel: idle, outs: [{ kind: 'tap' }] };
    case 'cancel':
      return { wheel: idle, outs: [] };
    case 'tick':
      return { wheel: press, outs: [] };
  }
};

const inPress = (press: Extract<Wheel, { readonly kind: 'pressing' }>, event: WheelEvent): Step => {
  const late = event.kind !== 'down' && event.kind !== 'cancel' && event.t >= press.t0 + HOLD;
  if (!late) return beforeHold(press, event);
  const hold = held(press.setup);
  const after =
    hold.wheel.kind === 'open' ? inWheel(hold.wheel, event) : { wheel: hold.wheel, outs: [] };
  return { wheel: after.wheel, outs: [...hold.outs, ...after.outs] };
};

/** The press's next state after `event`, and what it does. */
export const step = (wheel: Wheel, event: WheelEvent): Step => {
  if (wheel.kind === 'idle') return event.kind === 'down' ? pressed(event) : { wheel, outs: [] };
  if (wheel.kind === 'pressing') return inPress(wheel, event);
  return inWheel(wheel, event);
};
