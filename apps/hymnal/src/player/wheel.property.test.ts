/* oxlint-disable effect/noGlobals -- the run's seed comes from its shell, outside any Effect. */

/**
 * The key button's press rule (`wheel.ts`) over generated presses: seeded
 * sequences of a finger landing, moving, lifting and being cancelled, and of
 * the clock ticking, with the wheel offered or not and the ear there or not,
 * run against the rule and against a reference model written here apart
 * from it, with states idle, pressing(t0, at), wheel(origin, over) and
 * done(action or none). After every event the two do the same, and:
 * - W1 a lift before the hold, having moved under `SLOP`, is one `Tap` and no item;
 * - W2 a still press held `HOLD` ms opens the wheel when offered, else is one `Hold`;
 * - W3 in the wheel the finger is over the nearest item within `REACH`
 *   degrees, beyond `DEAD` points from the origin, else over none;
 * - W4 a lift in the wheel picks the item under the finger once, or none; a cancel none;
 * - W5 each move onto an item is one `Enter`; a move off to none is none;
 * - W6 the Tuner is an item exactly with the ear: 4 or 5 items, 26° apart;
 * - W7 a press that moves `SLOP` or more before its hold does nothing.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import {
  ANGLES,
  DEAD as RULE_DEAD,
  HOLD as RULE_HOLD,
  idle,
  type Item,
  itemsOf,
  originOf,
  Out,
  REACH as RULE_REACH,
  RADIUS as RULE_RADIUS,
  type Setup,
  SLOP as RULE_SLOP,
  step,
  type Wheel,
  WheelEvent,
} from './wheel';

/** A seeded generator of numbers in [0, 1) (mulberry32). */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const SEED = Number(process.env['WHEEL_SEED'] ?? 20261111);
const RUNS = 400;
const EVENTS = 30;

/** The model's numbers, the spec's own: the hold, the drift, the dead centre, the reach and the radius. */
const HOLD = 350;
const SLOP = 10;
const DEAD = 34;
const REACH = 20;
const RADIUS = 140;

/** The model's own angles, read off the owner's page: 0° to the right, 90° up. */
const MODEL_ANGLES: ReadonlyArray<readonly [Item, number]> = [
  ['tuner', 98],
  ['keyDown', 72],
  ['keyUp', 46],
  ['reset', 20],
  ['chords', -6],
];

type Model =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'pressing';
      readonly t0: number;
      readonly x: number;
      readonly y: number;
      readonly setup: Setup;
    }
  | {
      readonly kind: 'wheel';
      readonly ox: number;
      readonly oy: number;
      readonly items: ReadonlyArray<readonly [Item, number]>;
      readonly over: Item | 'none';
    }
  | { readonly kind: 'done'; readonly did: string };

/** The model's item under a finger at `x`, `y`, by a scan of every item. */
const modelOver = (
  ox: number,
  oy: number,
  items: ReadonlyArray<readonly [Item, number]>,
  x: number,
  y: number,
): Item | 'none' => {
  if (Math.sqrt((x - ox) ** 2 + (y - oy) ** 2) <= DEAD) return 'none';
  const degrees = (Math.atan2(oy - y, x - ox) * 180) / Math.PI;
  let best: Item | 'none' = 'none';
  let least = Number.POSITIVE_INFINITY;
  for (const [item, angle] of items) {
    let off = Math.abs(degrees - angle) % 360;
    if (off > 180) off = 360 - off;
    if (off < least) {
      least = off;
      best = item;
    }
  }
  if (least > REACH) return 'none';
  return best;
};

type Ev = WheelEvent;

/** The time an event tells; a cancel tells none, so it reads as before every hold. */
const timeOf = (event: Ev) => ('t' in event && event.t) || Number.NEGATIVE_INFINITY;

/** The model's next state, and what it did as words. */
interface Stepped {
  readonly next: Model;
  readonly did: ReadonlyArray<string>;
}

type Pressing = Extract<Model, { readonly kind: 'pressing' }>;
type Open = Extract<Model, { readonly kind: 'wheel' }>;

/** The model's step while pressing: past the hold it opens (or holds), before it a lift is a tap and a drift ends it. */
const pressingStep = (model: Pressing, event: Ev): Stepped => {
  if (timeOf(event) >= model.t0 + HOLD) {
    if (!model.setup.wheel) return { next: { kind: 'done', did: 'hold' }, did: ['hold'] };
    const items = MODEL_ANGLES.filter(([item]) => item !== 'tuner' || model.setup.ear);
    return openStep(
      {
        kind: 'wheel',
        ox: Math.max(model.x, model.setup.left),
        oy: Math.min(model.y, model.setup.bottom),
        items,
        over: 'none',
      },
      event,
    );
  }
  if (event._tag === 'Up') return { next: { kind: 'done', did: 'tap' }, did: ['tap'] };
  if (event._tag === 'Cancel') return { next: { kind: 'done', did: 'none' }, did: [] };
  if (
    event._tag === 'Move' &&
    Math.sqrt((event.x - model.x) ** 2 + (event.y - model.y) ** 2) >= SLOP
  )
    return { next: { kind: 'done', did: 'none' }, did: [] };
  return { next: model, did: [] };
};

/** The model's step: its next state and what it did, as words. */
const modelStep = (model: Model, event: Ev): Stepped => {
  if (event._tag === 'Down')
    return {
      next: { kind: 'pressing', t0: event.t, x: event.x, y: event.y, setup: event.setup },
      did: [],
    };
  if (model.kind === 'idle' || model.kind === 'done') return { next: model, did: [] };
  if (model.kind === 'pressing') return pressingStep(model, event);
  return openStep(model, event);
};

/** The model's step with the wheel open: a slide enters an item, a lift over one picks it. */
const openStep = (model: Open, event: Ev): Stepped => {
  if (event._tag === 'Move') {
    const over = modelOver(model.ox, model.oy, model.items, event.x, event.y);
    const did = (over !== 'none' && over !== model.over && [`enter ${over}`]) || [];
    return { next: { ...model, over }, did };
  }
  if (event._tag === 'Up') {
    if (model.over === 'none') return { next: { kind: 'done', did: 'none' }, did: [] };
    return { next: { kind: 'done', did: model.over }, did: [`pick ${model.over}`] };
  }
  if (event._tag === 'Cancel') return { next: { kind: 'done', did: 'none' }, did: [] };
  return { next: model, did: [] };
};

const wordOf = (out: Out): string =>
  Out.$match(out, {
    Tap: () => 'tap',
    Hold: () => 'hold',
    Enter: ({ item }) => `enter ${item}`,
    Pick: ({ item }) => `pick ${item}`,
  });

/** A finger `reach` points from `at` at `degrees`, aimed at an item half the time. */
const fingerAt = (random: () => number, at: { x: number; y: number }, reach: number) => {
  const aimed = MODEL_ANGLES[Math.floor(random() * MODEL_ANGLES.length)]?.[1] ?? 0;
  const degrees = (random() < 0.5 && aimed + random() * 50 - 25) || random() * 200 - 50;
  const angle = (degrees * Math.PI) / 180;
  return { x: at.x + reach * Math.cos(angle), y: at.y - reach * Math.sin(angle) };
};

/** One event of any kind at time `t`, a press's or a stray one. */
const strayAt = (random: () => number, t: number, at: { x: number; y: number }): Ev => {
  const roll = random();
  if (roll < 0.4) return WheelEvent.Move({ ...fingerAt(random, at, random() * (RADIUS + 40)), t });
  if (roll < 0.7) return WheelEvent.Up({ t });
  if (roll < 0.8) return WheelEvent.Cancel();
  return WheelEvent.Tick({ t });
};

/** A generated run's clock: `later(most)` moves it on by up to `most` ms and tells it. */
interface Clock {
  t: number;
}

/**
 * A press past its hold: a tick at the hold's very end, or a later one, or
 * none; slides over the wheel; then a lift or a cancel.
 */
const heldOf = (
  random: () => number,
  clock: Clock,
  start: number,
  at: { x: number; y: number },
): ReadonlyArray<Ev> => {
  const events: Array<Ev> = [];
  const later = (most: number) => (clock.t += random() * most);
  const exactly = random() < 0.3;
  clock.t = Math.max(clock.t, start + HOLD - 20) + Math.floor(random() * 60);
  if (exactly) clock.t = Math.max(clock.t, start + HOLD);
  if (exactly) events.push(WheelEvent.Tick({ t: start + HOLD }));
  else if (random() < 0.5) events.push(WheelEvent.Tick({ t: clock.t }));
  for (let k = Math.floor(random() * 5); k > 0; k -= 1)
    events.push(
      WheelEvent.Move({ ...fingerAt(random, at, random() * (RADIUS + 40)), t: later(80) }),
    );
  events.push((random() < 0.85 && WheelEvent.Up({ t: later(80) })) || WheelEvent.Cancel());
  return events;
};

/**
 * A generated run: presses of every kind (a tap, a drift, a hold with
 * slides over the wheel, a lift or a cancel), with stray events between
 * them, and the clock moving on between events.
 */
const runOf = (random: () => number): ReadonlyArray<Ev> => {
  const events: Array<Ev> = [];
  const clock: Clock = { t: 0 };
  const later = (most: number) => (clock.t += random() * most);
  while (events.length < EVENTS) {
    const at = { x: random() * 90, y: random() * 44 };
    const setup: Setup = {
      wheel: random() < 0.7,
      ear: random() < 0.5,
      left: random() * 90,
      bottom: 10 + random() * 34,
    };
    const start = later(400);
    events.push(WheelEvent.Down({ ...at, t: start, setup }));
    for (let k = Math.floor(random() * 3); k > 0; k -= 1)
      events.push(WheelEvent.Move({ ...fingerAt(random, at, random() * 12), t: later(120) }));
    if (random() < 0.3) events.push(WheelEvent.Up({ t: later(200) }));
    else events.push(...heldOf(random, clock, start, at));
    if (random() < 0.3) events.push(strayAt(random, later(300), at));
  }
  return events;
};

interface Press {
  readonly start: number;
  readonly setup: Setup;
  readonly x: number;
  readonly y: number;
  drift: number;
  readonly outs: Array<string>;
}

/** A press as its Down begins it. */
const pressOf = (down: Extract<Ev, { readonly _tag: 'Down' }>): Press => ({
  start: down.t,
  setup: down.setup,
  x: down.x,
  y: down.y,
  drift: 0,
  outs: [],
});

/** The rule and the model agree at `where`: what is open, what is under the finger, and the Tuner with the ear. */
const agrees = (where: string, ruled: Wheel, modelled: Stepped, press: Option.Option<Press>) => {
  expect({ where, open: ruled._tag === 'Open' }).toEqual({
    where,
    open: modelled.next.kind === 'wheel',
  });
  if (ruled._tag !== 'Open' || modelled.next.kind !== 'wheel') return;
  expect({ where, over: Option.getOrElse(ruled.over, () => 'none') }).toEqual({
    where,
    over: modelled.next.over,
  });
  expect(ruled.items.includes('tuner')).toBe(Option.exists(press, (p) => p.setup.ear));
};

/** `p` takes what `event` said and how far it drifted before its hold; true when the event ended it. */
const track = (
  p: Press,
  event: Ev,
  before: Wheel,
  after: Wheel,
  said: ReadonlyArray<string>,
): boolean => {
  if (event._tag !== 'Down') p.outs.push(...said);
  if (event._tag === 'Move' && before._tag === 'Pressing' && event.t < p.start + HOLD)
    p.drift = Math.max(p.drift, Math.hypot(event.x - p.x, event.y - p.y));
  return after._tag === 'Idle' && before._tag !== 'Idle';
};

/** W1, W2, W4, W7 and once-only over an ended press of run `run`. */
const keepsPromises = (run: number, p: Press & { readonly how: string; readonly t: number }) => {
  const taps = p.outs.filter((out) => out === 'tap').length;
  const picks = p.outs.filter((out) => out.startsWith('pick')).length;
  const holds = p.outs.filter((out) => out === 'hold').length;
  const early = p.how !== 'Cancel' && p.t < p.start + HOLD;
  if (p.how === 'Up' && early && p.drift < SLOP)
    expect({ run, w1: [taps, picks] }).toEqual({ run, w1: [1, 0] });
  if (p.drift >= SLOP) expect({ run, w7: p.outs }).toEqual({ run, w7: [] });
  if (!p.setup.wheel) expect({ run, w2: picks }).toEqual({ run, w2: 0 });
  if (p.how === 'Cancel') expect({ run, w4: picks }).toEqual({ run, w4: 0 });
  expect({ run, once: picks <= 1 && holds <= 1 && taps <= 1 }).toEqual({ run, once: true });
};

describe('the key button’s press', () => {
  it('holds 350 ms, drifts under 10 points, opens 140 points out, and reaches 20° beyond 34 points', () => {
    expect([RULE_HOLD, RULE_SLOP, RULE_RADIUS, RULE_REACH, RULE_DEAD]).toEqual([
      HOLD,
      SLOP,
      RADIUS,
      REACH,
      DEAD,
    ]);
  });

  it('W6: the Tuner is an item exactly with the ear, the items 26° apart', () => {
    for (const ear of [true, false]) {
      const items = itemsOf(ear);
      const angles = items.map((item) => ANGLES[item]);
      expect({
        tuner: items.includes('tuner'),
        count: items.length,
        distinct: new Set(angles).size,
        gaps: angles.slice(1).map((angle, k) => (angles[k] ?? 0) - angle),
      }).toEqual({
        tuner: ear,
        count: (ear && 5) || 4,
        distinct: items.length,
        gaps: angles.slice(1).map(() => 26),
      });
    }
  });

  it('does as the model does over generated presses, and keeps W1 to W7', () => {
    const random = seeded(SEED);
    const seen = new Map<string, number>();
    for (let run = 0; run < RUNS; run += 1) {
      const events = runOf(random);
      let wheel: Wheel = idle;
      let model: Model = { kind: 'idle' };
      let press: Option.Option<Press> = Option.none();
      const ended: Array<Press & { readonly how: string; readonly t: number }> = [];
      for (const [k, event] of events.entries()) {
        const before = wheel;
        const ruled = step(wheel, event);
        const modelled = modelStep(model, event);
        const said = ruled.outs.map(wordOf);
        for (const word of said)
          seen.set(word.split(' ')[0] ?? word, (seen.get(word.split(' ')[0] ?? word) ?? 0) + 1);
        expect({ run, k, did: said }).toEqual({ run, k, did: [...modelled.did] });
        agrees(`${run}/${k}`, ruled.wheel, modelled, press);
        if (event._tag === 'Down') press = Option.some(pressOf(event));
        for (const p of Option.toArray(press)) {
          if (track(p, event, before, ruled.wheel, said)) {
            ended.push({ ...p, how: event._tag, t: timeOf(event) });
            press = Option.none();
          }
        }
        wheel = ruled.wheel;
        model = modelled.next;
      }
      for (const p of ended) keepsPromises(run, p);
    }
    const each = ['tap', 'hold', 'enter', 'pick'].map((word) => [word, seen.get(word) ?? 0]);
    expect(each.filter(([, count]) => Number(count) < 50)).toEqual([]);
  });

  it('W2: a still press held 350 ms opens the wheel when offered, and is one Hold when not', () => {
    const setup: Setup = { wheel: true, ear: true, left: 84, bottom: 22 };
    const t0 = 675.147208;
    const down = step(idle, WheelEvent.Down({ x: 20, y: 30, t: t0, setup }));
    const early = step(down.wheel, WheelEvent.Tick({ t: t0 + HOLD - 1 }));
    const opened = step(early.wheel, WheelEvent.Tick({ t: t0 + HOLD }));
    expect({ early: early.wheel._tag, opened: opened.wheel._tag, outs: opened.outs }).toEqual({
      early: 'Pressing',
      opened: 'Open',
      outs: [],
    });
    expect(Option.map(Option.some(opened.wheel), (w) => w._tag === 'Open' && w.origin)).toEqual(
      Option.some(originOf({ x: 20, y: 30 }, setup)),
    );
    const off = step(
      step(idle, WheelEvent.Down({ x: 20, y: 30, t: 0, setup: { ...setup, wheel: false } })).wheel,
      WheelEvent.Tick({ t: HOLD }),
    );
    expect({ wheel: off.wheel._tag, outs: off.outs.map(wordOf) }).toEqual({
      wheel: 'Idle',
      outs: ['hold'],
    });
  });

  it('W3: a finger 100 points straight up from the origin is over the Tuner, and 20 points out over none', () => {
    const setup: Setup = { wheel: true, ear: true, left: 0, bottom: 100 };
    const open = step(
      step(idle, WheelEvent.Down({ x: 100, y: 50, t: 0, setup })).wheel,
      WheelEvent.Tick({ t: HOLD }),
    ).wheel;
    const up = step(open, WheelEvent.Move({ x: 100, y: -50, t: HOLD }));
    const near = step(up.wheel, WheelEvent.Move({ x: 100, y: 30, t: HOLD }));
    expect({ up: up.outs.map(wordOf), near: near.outs.map(wordOf) }).toEqual({
      up: ['enter tuner'],
      near: [],
    });
    const lifted = step(near.wheel, WheelEvent.Up({ t: HOLD }));
    expect(lifted.outs).toEqual([]);
  });
});
