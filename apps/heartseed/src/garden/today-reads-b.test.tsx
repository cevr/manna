/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- a React screen test: it drives the stage rig's promise-based steps one launch after another and reads nodes whose absent attributes are null. */

/**
 * Today's stage over an open that fails every attempt, through the stage
 * rig (`src/test/stage-rig.tsx`), the second part of
 * `today-reads.test.tsx`: no frame of the session names a stage, a plant,
 * planting or growth, and no frame draws a plant image, read by its
 * source with ids and labels aside, held against the images the passage's
 * own seed, blade and ear draw when read from the disk in the same process. It counts words without printing one.
 */

import { describe, expect, it } from 'bun:test';

import type { Growth } from '../garden';
import { DAY } from '../test/garden-model';
import { device } from '../test/one';
import {
  AT,
  DRAWING_FAULTS,
  mount,
  passageKeys,
  PLANT_IMAGES,
  recallAt,
  recordOf,
  UNREAD_FRAMES,
  UNREAD_LOOKS,
} from '../test/stage-rig';

describe('Today’s stage over a failed open', () => {
  it('claims nothing for the session when the open fails every attempt, and a recital with the device down keeps nothing', async () => {
    device.launch([recordOf(recallAt(Date.UTC(2026, 0, 5, 9)))]).fail('open', 16);
    const chimes: Growth[] = [];
    const today = await mount(chimes, undefined, undefined, 'unread');
    expect(await today.until(() => device.calls.open === 14)).toBe(true);
    await today.say('Say it');
    await today.until(() => false, 20);
    expect([
      today.stage(),
      today.plant(),
      today.frames.claimed,
      chimes,
      passageKeys().length,
    ]).toEqual([null, null, 0, [], 1]);
    await today.leave();
  });

  it('reads the passage’s own plant from the disk as a seed, a blade and an ear after one, two and three daily recalls', async () => {
    const daily = [3, 2, 1].map((days) => recordOf(recallAt(AT - days * DAY)));
    const stages: (string | null)[] = [];
    for (const recalls of [1, 2, 3]) {
      device.launch(daily.slice(0, recalls));
      const chimes: Growth[] = [];
      const today = await mount(chimes, undefined, { now: AT + 60 * DAY });
      expect(await today.until(() => today.stage() !== null)).toBe(true);
      stages.push(today.stage());
      expect(chimes).toEqual([]);
      await today.leave();
    }
    expect(stages).toEqual(['Stage: seed', 'Stage: blade', 'Stage: ear']);
  });

  it('draws no plant image, with or without a test id or label, in any frame of the failed launch above, though the seed, the blade and the ear drew their own images beside their stage lines once read', () => {
    expect(
      Object.fromEntries([...PLANT_IMAGES].map(([asset, stages]) => [asset, [...stages]])),
    ).toEqual({
      'assets/home/seed-light.png': ['Stage: seed'],
      'assets/home/blade-light.png': ['Stage: blade'],
      'assets/home/ear-light.png': ['Stage: ear'],
    });
    expect(UNREAD_FRAMES.seen).toBeGreaterThan(0);
    expect(UNREAD_LOOKS.size).toBeGreaterThan(10);
    expect([...DRAWING_FAULTS]).toEqual([]);
  });
});
