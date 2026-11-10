/* oxlint-disable effect/noNullish, effect/noAsyncFunction, effect/noNewPromise -- a React screen test: it drives the stage rig's promise-based steps one after another, holds a launch on a promise it resolves, and reads nodes whose absent attributes are null. */

/**
 * Today's stage as a reader and a screen reader meet it, through the stage
 * rig (`src/test/stage-rig.tsx`): Today in happy-dom under the app's own
 * layer over the scripted recital, the app's real store on the device and
 * a recording chime. A disk with no recall of any verse opens the first
 * minute (`src/first`), so each launch here starts with a recall on the
 * disk: the passage's, or, for the passage not planted, another verse's.
 *
 * The stage line reads `Stage: <stage>`, the plant beside it is hidden from
 * the screen reader and drawn as its stage's one hand-drawn image, known by
 * its source, and the growth line shows only while the finished recital it
 * names is on the screen. Every frame is watched: until the garden's read
 * completes, no frame names a stage, a plant, planting or growth. It counts
 * words without printing one. The failed reads and another verse's plant
 * are `src/garden/today-reads.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import type { Growth } from '../garden';
import { toDue } from '../test/clock';
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
  recallAt,
  recordOf,
  UNREAD_FRAMES,
  UNREAD_LOOKS,
} from '../test/stage-rig';

describe('Today’s stage over the device’s store', () => {
  it('reads not planted, then a seed, grows to a blade under its letters and then to a green ear at each due, a chime each, falls back to a blade at a peek, keeps it through a restart, falls to a seed at Again, and climbs back silently', async () => {
    device.launch([recordOf(recallAt(Date.UTC(2026, 0, 5, 9), OTHER))]);
    const chimes: Growth[] = [];
    const time = { now: AT };
    const today = await mount(chimes, undefined, time);
    expect(await today.until(() => today.stage() !== null)).toBe(true);
    expect([today.stage(), today.growth(), today.plant() !== null]).toEqual([
      'Stage: not planted',
      null,
      false,
    ]);

    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: seed')).toBe(true);
    expect([today.growth(), today.plant()?.getAttribute('aria-hidden'), chimes]).toEqual([
      null,
      'true',
      [],
    ]);
    expect(today.drawn()).toEqual(['assets/home/seed-light.png']);
    expect(passageKeys()).toHaveLength(1);

    await today.renew();
    expect([today.stage(), today.growth()]).toEqual(['Stage: seed', null]);
    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: blade')).toBe(true);
    expect([today.growth(), today.drawn()]).toEqual([
      'Grew to a blade.',
      ['assets/home/blade-light.png'],
    ]);
    expect(chimes.map(({ reference, from, to }) => [reference, from, to])).toEqual([
      [passage.reference, 'seed', 'blade'],
    ]);

    await today.renew();
    expect([today.ends, today.frames.end > 0]).toEqual([
      [
        { grew: ['1 grew a stage.'], grown: [`${passage.reference}, seed`] },
        { grew: ['1 grew a stage.'], grown: [`${passage.reference}, blade`] },
      ],
      true,
    ]);
    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: ear')).toBe(true);
    expect([today.growth(), today.drawn()]).toEqual([
      'Grew to an ear.',
      ['assets/home/ear-light.png'],
    ]);
    expect(chimes.map(({ reference, from, to }) => [reference, from, to])).toEqual([
      [passage.reference, 'seed', 'blade'],
      [passage.reference, 'blade', 'ear'],
    ]);

    await today.click(today.one('[data-testid="word-10"]'));
    expect(await today.until(() => today.stage() === 'Stage: blade')).toBe(true);
    expect([today.growth(), chimes.length, passageKeys().length, today.drawn()]).toEqual([
      null,
      2,
      3,
      ['assets/home/blade-light.png'],
    ]);
    await today.leave();

    toDue(time, passageRecalls());
    device.launch();
    const again = await mount(chimes, undefined, time);
    expect(await again.until(() => again.stage() === 'Stage: blade')).toBe(true);
    expect([again.growth(), again.plant()?.getAttribute('aria-hidden')]).toEqual([null, 'true']);

    await again.say();
    expect(await again.until(() => again.stage() === 'Stage: ear')).toBe(true);
    expect(again.growth()).toBe('Grew to an ear.');
    expect(chimes.map(({ from, to }) => [from, to])).toEqual([
      ['seed', 'blade'],
      ['blade', 'ear'],
      ['blade', 'ear'],
    ]);

    await again.click(again.radio('Again'));
    expect(await again.until(() => again.stage() === 'Stage: seed')).toBe(true);
    expect([again.growth(), chimes.length]).toEqual([null, 3]);

    await again.click(again.radio('Good'));
    expect(await again.until(() => again.stage() === 'Stage: ear')).toBe(true);
    expect([again.growth(), chimes.length, passageKeys().length]).toEqual([
      'Grew to an ear.',
      3,
      4,
    ]);
    await again.leave();
  });

  it('claims nothing in any frame while the launch is held, opens nothing, and reads full corn once released, drawn as the corn', async () => {
    device.launch(fullCorn());
    const gate = Promise.withResolvers<void>();
    const today = await mount([], gate.promise);
    expect(await today.until(() => false, 20)).toBe(false);
    expect([
      today.one('[data-testid="reference"]') !== null,
      today.frames.seen > 0,
      today.frames.claimed,
      device.calls.open,
    ]).toEqual([true, true, 0, 0]);

    gate.resolve();
    await today.begin();
    expect(await today.until(() => today.stage() === 'Stage: full corn')).toBe(true);
    expect([today.plant()?.getAttribute('aria-hidden'), today.growth(), today.drawn()]).toEqual([
      'true',
      null,
      ['assets/home/corn-light.png'],
    ]);
    expect(today.frames.claimed).toBeGreaterThan(0);
    await today.leave();
  });

  it('draws no part of a plant, with or without a test id or label, in any frame of the held, pending and unread launches above, though each of the four stages drew its parts once read', () => {
    expect(
      Object.fromEntries([...PLANT_IMAGES].map(([asset, stages]) => [asset, [...stages]])),
    ).toEqual({
      'assets/home/seed-light.png': ['Stage: seed'],
      'assets/home/blade-light.png': ['Stage: blade'],
      'assets/home/ear-light.png': ['Stage: ear'],
      'assets/home/corn-light.png': ['Stage: full corn'],
    });
    expect(UNREAD_FRAMES.seen).toBeGreaterThan(0);
    expect(UNREAD_LOOKS.size).toBeGreaterThan(10);
    expect([...DRAWING_FAULTS]).toEqual([]);
  });
});
