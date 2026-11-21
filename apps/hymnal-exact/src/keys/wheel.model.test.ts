/* oxlint-disable effect/noTernary, effect/noNullish, effect/preferPredicateIsTagged -- a Bun test drawing generated presses with the app's seeded generator; the port's rule names no item under the finger `undefined`, and the current app's tags are read plainly to turn them into the port's. */

/**
 * The key button's press, model-based: generated press histories (a finger
 * landing, moving a little or far, the clock ticking, a lift, a cancel,
 * each at a time on from the last, over and under the hold) run side by
 * side on the port's `step` (`src/keys/wheel.ts`) and the current app's
 * (`apps/hymnal/src/player/wheel.ts`), with the wheel offered or not: the
 * same taps, holds, enters and picks, and the same wheel after every event.
 * The Arc, the dead zone and the constants are the current app's too, and
 * the press's source (`keysPress`) answers what the rule does.
 */

import { describe, expect, test } from 'bun:test';

import * as one from '@manna/hymnal-app/player/wheel';
import { Option } from 'effect';

import { sourcesAt } from '../sources.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';
import {
  DEAD,
  HOLD,
  idle,
  ITEM,
  itemsOf,
  LIFT,
  ORIGIN_X,
  overOf,
  SLOP,
  slotOf,
  step,
  type Out,
  type Wheel,
  type WheelEvent,
  WORDS,
} from './wheel.ts';

const ITEMS = ['tuner', 'keyDown', 'keyUp', 'reset', 'chords'] as const;

/** The current app's wheel, in the port's terms. */
const portOf = (wheel: one.Wheel): Wheel => {
  if (wheel._tag === 'Idle') return idle;
  if (wheel._tag === 'Pressing')
    return { kind: 'pressing', t0: wheel.t0, at: wheel.at, setup: wheel.setup };
  return {
    kind: 'open',
    origin: wheel.origin,
    items: wheel.items,
    over: wheel.over._tag === 'Some' ? wheel.over.value : undefined,
  };
};

/** The current app's outputs, in the port's terms. */
const outsOf = (outs: ReadonlyArray<one.Out>): ReadonlyArray<Out> =>
  outs.map((out): Out => {
    if (out._tag === 'Enter') return { kind: 'enter', item: out.item };
    if (out._tag === 'Pick') return { kind: 'pick', item: out.item };
    if (out._tag === 'Tap') return { kind: 'tap' };
    return { kind: 'hold' };
  });

/** A generated event at `t`, in both apps' terms, with the finger near `origin`. */
const eventOf = (
  random: Random,
  t: number,
  setup: one.Setup,
): readonly [WheelEvent, one.WheelEvent] => {
  const roll = below(random, 10);
  const near = () => setup.origin.x + below(random, 2 * SLOP) - SLOP;
  const far = () => setup.origin.x + below(random, 400) - 100;
  const up = () => setup.origin.y - below(random, 400) + 40;
  if (roll === 0) {
    const [x, y] = [near(), setup.origin.y + below(random, 6) - 3];
    return [{ kind: 'down', x, y, t, setup }, one.WheelEvent.Down({ x, y, t, setup })];
  }
  if (roll <= 4) {
    const small = random() < 0.4;
    const [x, y] = small
      ? [near(), setup.origin.y + below(random, 2 * SLOP) - SLOP]
      : [far(), up()];
    return [{ kind: 'move', x, y, t }, one.WheelEvent.Move({ x, y, t })];
  }
  if (roll <= 6) return [{ kind: 'tick', t }, one.WheelEvent.Tick({ t })];
  if (roll === 7) return [{ kind: 'cancel' }, one.WheelEvent.Cancel()];
  return [{ kind: 'up', t }, one.WheelEvent.Up({ t })];
};

describe('the key button’s press, against the current app’s', () => {
  test('the constants, the items and their words, and the Arc are the current app’s', () => {
    expect([HOLD, SLOP, DEAD, ORIGIN_X, LIFT]).toEqual([
      one.HOLD,
      one.SLOP,
      one.DEAD,
      one.ORIGIN_X,
      one.LIFT,
    ]);
    expect(ITEM).toEqual(one.ITEM);
    expect(WORDS).toEqual(one.WORDS);
    expect(itemsOf(false)).toEqual(one.itemsOf(false));
    expect(itemsOf(true)).toEqual(one.itemsOf(true));
    for (const item of ITEMS) expect(slotOf(item)).toEqual(one.slotOf(item));
    const random = seeded(31);
    for (let k = 0; k < 4000; k++) {
      const at = { x: below(random, 500) - 150, y: -below(random, 500) + 60 };
      const items = pick(random, [itemsOf(false), itemsOf(true)]);
      expect(overOf(items, at)).toBe(Option.getOrUndefined(one.overOf(items, at)));
    }
  });

  test('generated press histories make the same taps, holds, enters and picks', () => {
    const random = seeded(41);
    let seen = { tap: 0, hold: 0, enter: 0, pick: 0 };
    for (let run = 0; run < 400; run++) {
      const setup = {
        wheel: random() < 0.7,
        ear: false,
        origin: { x: ORIGIN_X - 12, y: 22 },
      };
      let ours: Wheel = idle;
      let theirs: one.Wheel = one.idle;
      let t = below(random, 1000);
      for (let k = 0; k < 30; k++) {
        t += pick(random, [0, 16, 50, 120, 200, 360, 600]);
        const [a, b] = eventOf(random, t, setup);
        const next = step(ours, a);
        const want = one.step(theirs, b);
        expect(next.wheel).toEqual(portOf(want.wheel));
        expect(next.outs).toEqual(outsOf(want.outs));
        for (const out of next.outs) seen = { ...seen, [out.kind]: seen[out.kind] + 1 };
        ours = next.wheel;
        theirs = want.wheel;
      }
    }
    expect(Math.min(seen.tap, seen.hold, seen.enter, seen.pick)).toBeGreaterThan(10);
  });

  test('the press’s source answers the rule: a hold opens the wheel, a slide picks, a slide before the hold is a swipe', () => {
    const { keysPress } = sourcesAt('https://hymns.cvr.im', [], []);
    keysPress(['down', 35, 22, 0, true]);
    const open = keysPress(['tick', 0, 0, HOLD, true]);
    expect(open.open).toBe(true);
    expect(open.items.map((each) => each.word)).toEqual(['Key ♭', 'Key ♯', 'Reset', 'Chords off']);
    const slot = slotOf('keyUp');
    const entered = keysPress(['pan', slot.x, slot.y, HOLD + 50, true]);
    expect(entered.enter).toBe('keyUp');
    expect(keysPress(['pan', 0, 1, HOLD + 60, true]).enter).toBe('');
    const picked = keysPress(['up', 0, 0, HOLD + 80, true]);
    expect([picked.pick, picked.open, picked.swipe]).toEqual(['keyUp', false, false]);
    keysPress(['down', 35, 22, 1000, true]);
    const tapped = keysPress(['up', 0, 0, 1100, true]);
    expect([tapped.tap, tapped.swipe]).toEqual([true, false]);
    keysPress(['down', 35, 22, 2000, true]);
    keysPress(['pan', 0, -40, 2050, true]);
    keysPress(['pan', 0, -30, 2080, true]);
    const swiped = keysPress(['up', 0, -900, 2100, true]);
    expect([swiped.tap, swiped.swipe, swiped.pull, swiped.speed]).toEqual([false, true, -70, -900]);
    keysPress(['down', 35, 22, 3000, false]);
    expect(keysPress(['tick', 0, 0, 3000 + HOLD, false]).hold).toBe(true);
  });
});
