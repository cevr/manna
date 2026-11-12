/* oxlint-disable effect/noNullish -- `exitPose` takes no picked item as null, as a worklet reads it. */

/**
 * The key button's wheel in motion (`wheelmotion.ts`), read frame by frame
 * off its clock, with the ear and without it (owner, 2026-11-12: "an enter
 * and exit, that show you that these are radially coming from this
 * button"):
 * - E1 at the hold every item is at the key button, small and unseen;
 * - E2 by `enterEnd`, under 500 ms, every item rests at its slot, whole and seen;
 * - E3 every enter frame lies on the item's ray, never past 106 % of its
 *   slot, and while they rise a nearer item is never behind a farther one;
 * - X1 the exit starts where the enter stood at the release: no jump;
 * - X2 by `exitEnd`, under 260 ms and shorter than the enter, every item is back and unseen;
 * - X3 a picked item goes in last: at every exit frame it has travelled least;
 * - RM with Reduce Motion every frame is at the slot at full size, a fade in by 120 ms and out by 100 ms;
 * - B the backdrop is up with the enter and down with the exit.
 */

import { describe, expect, it } from 'bun:test';

import { type Item, itemsOf, type Point, slotOf } from './wheel';
import {
  BACKDROP,
  backdropAt,
  enterEnd,
  enterPose,
  exitEnd,
  exitPose,
  type Pose,
  travelAt,
} from './wheelmotion';

/** A frame every 4 ms, coarser than a device's 8 ms, finer than any change of order. */
const FRAME = 4;

const reachOf = (slot: Point) => Math.hypot(slot.x, slot.y);

/** How far along its slot's ray a pose stands: 0 at the origin, 1 at the slot. */
const travelOf = (pose: Point, slot: Point) =>
  (pose.x * slot.x + pose.y * slot.y) / (reachOf(slot) * reachOf(slot));

/** How far a pose stands off its slot's ray, in points. */
const offRay = (pose: Point, slot: Point) =>
  Math.abs(pose.x * slot.y - pose.y * slot.x) / reachOf(slot);

const frames = (to: number) =>
  Array.from({ length: Math.floor(to / FRAME) + 1 }, (_, k) => k * FRAME);

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

for (const ear of [true, false]) {
  const items = itemsOf(ear);
  const each = (check: (item: Item, slot: Point) => void) => {
    for (const item of items) check(item, slotOf(item));
  };

  describe(`the wheel’s motion, ${(ear && 'five items') || 'four items, no ear'}`, () => {
    it('E1: at the hold every item is at the key button, small and unseen', () =>
      each((item) => {
        const pose = enterPose(item, items, 0, false);
        expect({
          item,
          at: Math.hypot(pose.x, pose.y),
          small: pose.scale <= 0.4,
          seen: pose.opacity,
        }).toEqual({
          item,
          at: 0,
          small: true,
          seen: 0,
        });
      }));

    it('E2: by enterEnd, under 500 ms, every item rests at its slot, whole and seen', () => {
      const end = enterEnd(items, false);
      expect(end).toBeLessThan(500);
      each((item, slot) => {
        const pose = enterPose(item, items, end, false);
        expect(Math.hypot(pose.x - slot.x, pose.y - slot.y)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(pose.scale - 1)).toBeLessThanOrEqual(0.01);
        expect(pose.opacity).toBeCloseTo(1, 2);
      });
    });

    it('E3: every enter frame lies on its ray within 106 % of its slot, the nearer items ahead', () => {
      const order = [...items].sort((a, b) => reachOf(slotOf(a)) - reachOf(slotOf(b)));
      for (const ms of frames(600)) {
        each((item, slot) => {
          const pose = enterPose(item, items, ms, false);
          expect(offRay(pose, slot)).toBeLessThanOrEqual(0.5);
          expect(reachOf(pose)).toBeLessThanOrEqual(reachOf(slot) * 1.06 + 0.5);
        });
      }
      for (const ms of frames(120))
        for (const [k, item] of order.slice(1).entries())
          expect(travelAt(order[k] ?? item, items, ms)).toBeGreaterThanOrEqual(
            travelAt(item, items, ms) - 1e-9,
          );
    });

    it('X1: the exit starts where the enter stood at the release', () => {
      const random = seeded(571);
      for (let n = 0; n < 60; n += 1) {
        const at = random() * 600;
        each((item) => {
          const was = enterPose(item, items, at, false);
          const now = exitPose(item, items, travelAt(item, items, at), 0, false, null);
          expect(Math.hypot(now.x - was.x, now.y - was.y)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(now.scale - was.scale)).toBeLessThanOrEqual(0.02);
        });
      }
    });

    it('X2: by exitEnd, under 260 ms and shorter than the enter, every item is back and unseen', () => {
      const end = exitEnd(items, false);
      expect(end).toBeLessThan(260);
      expect(end).toBeLessThan(enterEnd(items, false));
      each((item) => {
        const pose = exitPose(item, items, 1, end, false, null);
        expect({ item, at: Math.hypot(pose.x, pose.y), seen: pose.opacity }).toEqual({
          item,
          at: 0,
          seen: 0,
        });
      });
    });

    it('X3: a picked item goes in last, travelled least at every exit frame', () => {
      for (const picked of items)
        for (const ms of frames(260)) {
          const left = (item: Item): number =>
            travelOf(exitPose(item, items, 1, ms, false, picked), slotOf(item));
          for (const other of items.filter((item) => item !== picked))
            expect(left(picked)).toBeGreaterThanOrEqual(left(other) - 1e-9);
        }
    });

    it('RM: with Reduce Motion every frame is at the slot at full size; a fade in by 120 ms, out by 100', () => {
      for (const ms of frames(200))
        each((item, slot) => {
          const poses: ReadonlyArray<Pose> = [
            enterPose(item, items, ms, true),
            exitPose(item, items, 1, ms, true, null),
          ];
          for (const pose of poses)
            expect({
              off: Math.hypot(pose.x - slot.x, pose.y - slot.y),
              scale: pose.scale,
            }).toEqual({
              off: 0,
              scale: 1,
            });
        });
      each((item) =>
        expect([
          enterPose(item, items, 0, true).opacity,
          enterPose(item, items, 120, true).opacity,
          exitPose(item, items, 1, 100, true, null).opacity,
        ]).toEqual([0, 1, 0]),
      );
      expect(enterEnd(items, true)).toBeLessThanOrEqual(150);
      expect(exitEnd(items, true)).toBeLessThanOrEqual(120);
    });
  });
}

describe('B: the backdrop', () => {
  it('is down at the hold, up by its enter, and down again by its exit', () => {
    for (const reduced of [false, true]) {
      expect(backdropAt('enter', 0, reduced)).toBe(0);
      expect(backdropAt('enter', BACKDROP.enter, reduced)).toBeCloseTo(BACKDROP.opacity, 5);
      expect(backdropAt('exit', 0, reduced)).toBeCloseTo(BACKDROP.opacity, 5);
      expect(backdropAt('exit', BACKDROP.exit, reduced)).toBe(0);
    }
    for (const ms of frames(BACKDROP.enter - FRAME))
      expect(backdropAt('enter', ms + FRAME, false)).toBeGreaterThan(
        backdropAt('enter', ms, false),
      );
  });
});
