/**
 * The key button's wheel's look and motion, mounted whole over a player and
 * a reader's store (`src/test/bar.tsx`).
 *
 * - R10 while the wheel is up the page dims, no dot marks its origin, `Key`
 *   is ringed, the bar's other controls fade and the find bar is told
 *   (`wheelOpen`), and all of it ends as the wheel shuts;
 * - R11 the items come out of `Key`: at the hold at its centre, small and
 *   unseen, and at their slots once the enter lands;
 * - R12 a release keeps the wheel drawn through its exit, then it is gone,
 *   and a pick acts at the release, not after the exit;
 * - R13 with Reduce Motion each item stands at its slot from the first frame and only fades;
 * - R14 without the ear the four items keep the slots they hold with it.
 *
 * The moves go to each item's slot from the wheel's origin, `ORIGIN_X`
 * from the screen's left edge on the key button's middle (`wheel.ts`).
 * Hymn numbers only: no hymn's words are read.
 */

import { describe, expect, it, spyOn } from 'bun:test';
import { Effect, Option } from 'effect';
import { act } from 'react';
import { AccessibilityInfo } from 'react-native';

import { chordsOn, hold, type Mounted, onPage, toSlot } from '../test/bar';
import { routed } from '../test/one';
import { holdAnimations, landAnimations, stepAnimations } from '../test/reanimated';
import { wheelOpen } from './bar';
import { type Item, itemsOf, slotOf } from './wheel';

/** A view's drawn translate, scale and opacity, as its style writes them. */
const drawnAt = (view: HTMLElement) => {
  const style = getComputedStyle(view);
  const number = (pattern: RegExp, otherwise: number) =>
    Number.parseFloat(pattern.exec(style.transform)?.[1] ?? `${otherwise}`);
  return {
    x: number(/translateX\((-?[\d.e+-]+)px\)/, 0),
    y: number(/translateY\((-?[\d.e+-]+)px\)/, 0),
    scale: number(/scale\((-?[\d.e+-]+)\)/, 1),
    opacity: Number.parseFloat(style.opacity || '1'),
  };
};

/** Each item's place on the wheel as drawn. */
const places = (page: Mounted, items: ReadonlyArray<Item>) =>
  items.map((item) => ({ item, ...drawnAt(page.get(`[data-testid="key-wheel-place-${item}"]`)) }));

/** Animations held until the `using` ends, then landed. */
const animationsHeld = () => {
  holdAnimations();
  return { [Symbol.dispose]: () => act(() => landAnimations()) };
};

/** Each item's place over the first five frames, 40 ms apart, of a hold of `Key` with the animations held. */
const reducedFrames = (page: Mounted) => {
  const items = itemsOf(true);
  using _held = animationsHeld();
  const finger = hold();
  const frames = [places(page, items)];
  for (let k = 0; k < 4; k += 1) {
    act(() => void stepAnimations(40));
    frames.push(places(page, items));
  }
  finger.lift();
  return frames;
};

describe('the wheel’s look and motion', () => {
  it('R10: the page dims, no dot marks the origin, Key is ringed, the marks fade and the find bar is told, until the wheel shuts', () => {
    using page = onPage(chordsOn(), true);
    const shown = () => ({
      backdrop: Option.isSome(page.find('[data-testid="key-wheel-backdrop"]')),
      hub: Option.isSome(page.find('[data-testid="key-wheel-hub"]')),
      ring: Option.isSome(page.find('[data-testid="key-ring"]')),
      faded:
        Number.parseFloat(getComputedStyle(page.get('[data-testid="bar-marks"]')).opacity || '1') <=
        0.35,
      told: page.registry.get(wheelOpen),
    });
    const finger = hold();
    const open = shown();
    finger.lift();
    expect({ open, shut: shown() }).toEqual({
      open: { backdrop: true, hub: false, ring: true, faded: true, told: true },
      shut: { backdrop: false, hub: false, ring: false, faded: false, told: false },
    });
  });

  it('R11: held at the hold, the items stand at the origin, small and unseen; landed, at their slots', () => {
    using page = onPage(chordsOn(), true);
    const items = itemsOf(true);
    using _held = animationsHeld();
    const finger = hold();
    for (const place of places(page, items))
      expect({ ...place, small: place.scale <= 0.4 }).toEqual({
        ...place,
        x: 0,
        y: 0,
        small: true,
        opacity: 0,
      });
    act(() => landAnimations());
    for (const place of places(page, items)) {
      const slot = slotOf(place.item);
      expect({
        item: place.item,
        off: Math.hypot(place.x - slot.x, place.y - slot.y) <= 0.5,
        whole: Math.abs(place.scale - 1) <= 0.01,
        opacity: place.opacity,
      }).toEqual({ item: place.item, off: true, whole: true, opacity: 1 });
    }
    finger.lift();
  });

  it('R12: a release keeps the wheel drawn through its exit, gone once it lands; a pick acts at the release', () => {
    using page = onPage(chordsOn(), true);
    using _held = animationsHeld();
    const opened = () => {
      const finger = hold();
      act(() => landAnimations());
      holdAnimations();
      return finger;
    };
    const middle = opened();
    middle.move(6, -8);
    middle.lift();
    const closing = {
      wheel: Option.isSome(page.find('[data-testid="key-wheel"]')),
      told: page.registry.get(wheelOpen),
    };
    act(() => void stepAnimations(16));
    const tuner = drawnAt(page.get('[data-testid="key-wheel-place-tuner"]'));
    act(() => landAnimations());
    const shut = {
      gone: Option.isNone(page.find('[data-testid="key-wheel"]')),
      told: page.registry.get(wheelOpen),
      routed: [...routed],
    };
    holdAnimations();
    const pick = opened();
    pick.move(...toSlot('tuner'));
    pick.lift();
    expect({
      closing,
      moving: Math.hypot(tuner.x, tuner.y) < Math.hypot(slotOf('tuner').x, slotOf('tuner').y),
      shut,
      picked: {
        routed: [...routed],
        closing: Option.isSome(page.find('[data-testid="key-wheel"]')),
        lit: page.get('[data-testid="key-wheel-tuner"]').getAttribute('aria-selected'),
      },
    }).toEqual({
      closing: { wheel: true, told: false },
      moving: true,
      shut: { gone: true, told: false, routed: [] },
      picked: { routed: ['push /tuner'], closing: true, lit: 'true' },
    });
  });

  it('R13: with Reduce Motion each item stands at its slot from the first frame, and only fades', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        // oxlint-disable-next-line effect/noModuleMocks -- the system's setting is React Native's own boundary, read by `useReduceMotion`; the spy stands in for the system and is put back as the test ends.
        using _reduced = spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
        using page = onPage(chordsOn(), true);
        yield* Effect.promise(() => act(() => Effect.runPromise(Effect.void)));
        const frames = reducedFrames(page);
        for (const frame of frames)
          for (const place of frame) {
            const slot = slotOf(place.item);
            expect({
              item: place.item,
              off: Math.hypot(place.x - slot.x, place.y - slot.y) <= 0.01,
              scale: place.scale,
            }).toEqual({ item: place.item, off: true, scale: 1 });
          }
        expect(frames.map((frame) => Math.round((frame[0]?.opacity ?? 0) * 100))).toEqual([
          0, 33, 67, 100, 100,
        ]);
      }),
    ));

  it('R14: without the ear four items stand at the slots they hold with it', () => {
    const at = (ear: boolean) => {
      using page = onPage(chordsOn(), ear);
      const finger = hold();
      const drawn = places(page, itemsOf(ear));
      finger.lift();
      return drawn;
    };
    const five = at(true);
    const four = at(false);
    expect(four.map((place) => place.item)).toEqual(['keyDown', 'keyUp', 'reset', 'chords']);
    const atSlot = (drawn: typeof four) =>
      drawn.map((place) => ({
        item: place.item,
        near: Math.hypot(place.x - slotOf(place.item).x, place.y - slotOf(place.item).y) <= 0.5,
      }));
    expect(atSlot(four)).toEqual(atSlot(five).filter(({ item }) => item !== 'tuner'));
    expect(atSlot(five).every(({ near }) => near)).toBe(true);
  });
});
