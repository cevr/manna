/* oxlint-disable effect/noNullish, effect/noAsyncFunction -- a React screen test: it drives the stage rig's promise-based steps one after another and reads nodes whose absent attributes are null. */

/**
 * Today's stage over reads that fail and over another verse's plant,
 * through the stage rig (`src/test/stage-rig.tsx`): Today in happy-dom
 * under the app's own layer over the scripted recital, the app's real
 * store on the device and a recording chime. For the whole session when
 * every listing failed, no frame names a stage, a plant, planting or
 * growth, and another verse's plant never shows as the passage's. An open
 * that fails every attempt is `today-reads-b.test.tsx`'s, a part of its
 * own. It counts words without printing one.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import type { Growth } from '../garden';
import { toDue } from '../test/clock';
import { DAY } from '../test/garden-model';
import { device } from '../test/one';
import {
  AT,
  DRAWING_FAULTS,
  fullCorn,
  mount,
  OTHER,
  passageKeys,
  passageRecalls,
  PLANT_IMAGES,
  PREFIX,
  recallAt,
  recordOf,
  UNREAD_FRAMES,
  UNREAD_LOOKS,
} from '../test/stage-rig';

describe('Today’s stage over failed reads and another verse’s plant', () => {
  it('claims nothing for the session when every listing fails, says it all the same, writes its recital silently, and reads it at the next launch at its due', async () => {
    device.launch([recordOf(recallAt(AT - DAY))]).fail('keys', 3);
    const chimes: Growth[] = [];
    const time = { now: AT };
    const today = await mount(chimes, undefined, time, 'unread');
    expect(await today.until(() => device.calls.keys === 3)).toBe(true);
    await today.say('Say it');
    expect(await today.until(() => passageKeys().length === 2)).toBe(true);
    await today.until(() => false, 20);
    expect([today.stage(), today.growth(), today.plant(), today.frames.claimed, chimes]).toEqual([
      null,
      null,
      null,
      0,
      [],
    ]);
    expect(device.calls.keys).toBe(3);
    await today.leave();

    toDue(time, passageRecalls());
    device.launch();
    const next = await mount(chimes, undefined, time);
    expect(await next.until(() => next.stage() === 'Stage: blade')).toBe(true);
    expect([next.growth(), chimes]).toEqual([null, []]);
    await next.leave();
  });

  it('reads the passage’s own plant, never another verse’s: with another verse at full corn on the disk, the passage is not planted, then a seed, then grows to a blade and an ear at each due', async () => {
    const theirs = fullCorn(OTHER);
    device.launch(theirs);
    const chimes: Growth[] = [];
    const today = await mount(chimes, undefined, { now: AT });
    expect(await today.until(() => today.stage() !== null)).toBe(true);
    expect([today.stage(), today.growth(), today.plant() !== null]).toEqual([
      'Stage: not planted',
      null,
      false,
    ]);

    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: seed')).toBe(true);
    await today.renew();
    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: blade')).toBe(true);
    expect(today.growth()).toBe('Grew to a blade.');
    await today.renew();
    expect(today.ends).toEqual([
      { grew: ['1 grew a stage.'], grown: [`${passage.reference}, seed`] },
      { grew: ['1 grew a stage.'], grown: [`${passage.reference}, blade`] },
    ]);
    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: ear')).toBe(true);
    expect(today.growth()).toBe('Grew to an ear.');
    expect(chimes.map(({ reference, from, to }) => [reference, from, to])).toEqual([
      [passage.reference, 'seed', 'blade'],
      [passage.reference, 'blade', 'ear'],
    ]);
    expect([...device.disk].filter(([key]) => key.startsWith(`${PREFIX}${OTHER}/`))).toEqual<
      (readonly [string, string | null])[]
    >(theirs);
    await today.leave();
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
