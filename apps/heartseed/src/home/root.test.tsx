/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noNullish -- the cases play devices through the field's promise-based screen rig, one launch held on a promise until the case releases it, and read happy-dom nodes whose absent attributes are null. */

/**
 * The root's fixed launches (hshomeroot R1-R3, R6 and R8) through the
 * field's screen rig (`src/test/field-rig.tsx`), each frame of each launch
 * held to the root's frame rule (`watchedLaunch`, `src/test/root-rule.ts`).
 * The root takes no props, so every case opens as a launch does. Each case
 * names its expected screens and values: a read launch with the passage due, pending then home with its plan's counts in every
 * home frame; an unread garden on Today with no field; garbled passages,
 * home with `Start` alone; a held read, pending until its release; a
 * relaunch after a choice and a visit, which keeps neither; and home with
 * nothing due, whose `Practice anyway` opens Today on the passage and comes
 * back with the card as it was. The launches that hold a recital are
 * `root-say.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { recallOf } from '../test/field-model';
import { cardOf, mount, record, selectedPlants } from '../test/field-rig';
import type { Time } from '../test/clock';
import { device } from '../test/one';
import { KEY } from '../test/passages-model';
import { screensOf, watchedLaunch } from '../test/root-rule';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = Date.UTC(2026, 10, 5);
const VOICE_OFF = ['heartseed/voice/enabled', 'false'] as const;
const GARBLED = 'not a list of passages';

/** The passage recalled long ago, so it is due at any launch now. */
const due = () => record(recallOf(passage.reference, Date.UTC(2020, 0, 1, 12), 3, 0));

/** A launch through the field rig, every frame held to the root's rule. */
const launch = (garden: 'read' | 'unread', held?: Promise<void>, time?: Time) =>
  watchedLaunch(garden, () => mount(garden === 'read', held, time));

describe('the root', () => {
  it('opens a read launch with the passage due on pending frames, then home with its plan in every frame', async () => {
    device.launch([due(), VOICE_OFF]);
    const read = await launch('read');
    expect(await read.app.until(() => cardOf(read.host).controls.includes('Start'))).toBe(true);
    await read.app.until(() => false, 8);
    const homes = read.watch.frames.filter((frame) => frame.headings.join('|') === 'Your field');
    expect({
      foot: cardOf(read.host),
      screens: screensOf(read.watch.frames),
      uncounted: homes.filter((frame) => frame.counts === '').length,
      first: homes[0]?.counts,
      faults: [...read.watch.faults, ...read.app.faults],
    }).toEqual({
      foot: {
        card: 'today-card',
        line: '1 verse · about 1 min | 1 to review',
        controls: ['Start'],
      },
      screens: ['pending', 'Your field'],
      uncounted: 0,
      first: '1 verse · about 1 min | 1 to review',
      faults: [],
    });
    expect(await read.end()).toEqual([]);
  });

  it('opens an unread garden on Today, with no field in any frame', async () => {
    device.launch([due(), VOICE_OFF]).fail('keys', 3);
    const unread = await launch('unread');
    expect(await unread.app.until(() => device.calls.keys === 3 && unread.today())).toBe(true);
    await unread.app.until(() => false, 8);
    expect({
      screens: screensOf(unread.watch.frames),
      back: unread.app.frames.control,
      faults: [...unread.watch.faults, ...unread.app.faults],
    }).toEqual({ screens: ['pending', 'Today'], back: 0, faults: [] });
    expect(await unread.end()).toEqual([]);
  });

  it('opens home over garbled passages with Start alone, which opens Today on the app’s passage', async () => {
    device.launch([due(), [KEY, GARBLED], VOICE_OFF]);
    const garbled = await launch('read');
    expect(await garbled.app.until(() => cardOf(garbled.host).controls.includes('Start'))).toBe(
      true,
    );
    await garbled.app.until(() => false, 8);
    expect({
      heading: garbled.app.headings(),
      foot: cardOf(garbled.host).controls,
      headline: garbled.host.querySelectorAll('[data-testid="today-headline"]').length,
    }).toEqual({ heading: ['Your field'], foot: ['Start'], headline: 0 });
    await garbled.app.tap('Start');
    expect(
      await garbled.app.until(
        () =>
          garbled.today() &&
          garbled.reference() === passage.reference &&
          garbled.app.buttons().includes('Say it'),
      ),
    ).toBe(true);
    expect([...garbled.watch.faults, ...garbled.app.faults]).toEqual([]);
    expect(await garbled.end()).toEqual([]);
  });

  it('shows only pending frames while the read is held, then home', async () => {
    device.launch([due(), VOICE_OFF]);
    const gate = Promise.withResolvers<void>();
    const held = await launch('read', gate.promise);
    expect(await held.app.until(() => false, 20)).toBe(false);
    expect([screensOf(held.watch.frames), device.calls.open]).toEqual([['pending'], 0]);
    gate.resolve();
    expect(await held.app.until(held.home)).toBe(true);
    expect({
      screens: screensOf(held.watch.frames),
      faults: [...held.watch.faults, ...held.app.faults],
    }).toEqual({ screens: ['pending', 'Your field'], faults: [] });
    expect(await held.end()).toEqual([]);
  });

  it('forgets the choice, the visit and the screen at a relaunch', async () => {
    const time = { now: DAY + 15 * HOUR };
    device.launch([record(recallOf(passage.reference, time.now - 2 * MINUTE, 3, 0)), VOICE_OFF]);
    const first = await launch('read', undefined, time);
    expect(await first.app.until(first.home)).toBe(true);
    const plant = first.app.buttons().find((label) => label?.startsWith(`${passage.reference}, `));
    await first.app.tap(plant ?? `<no plant of ${passage.reference}>`);
    await first.app.tap(`Practice ${passage.reference}`);
    expect(
      await first.app.until(
        () =>
          first.today() &&
          first.reference() === passage.reference &&
          first.app.buttons().includes('Say it'),
      ),
    ).toBe(true);
    await first.app.tap('Your field');
    expect(await first.app.until(first.home)).toBe(true);
    expect([selectedPlants(first.host), cardOf(first.host).controls]).toEqual([[], ['Start']]);
    expect([...first.watch.faults, ...first.app.faults]).toEqual([]);
    expect(await first.end()).toEqual([]);

    const again = await launch('read', undefined, time);
    expect(await again.app.until(again.home)).toBe(true);
    await again.app.until(() => false, 8);
    expect({
      chosen: selectedPlants(again.host),
      foot: cardOf(again.host),
      screens: screensOf(again.watch.frames),
      faults: [...again.watch.faults, ...again.app.faults],
    }).toEqual({
      chosen: [],
      foot: {
        card: 'today-card',
        line: 'All tended for today | Nothing is due right now.',
        controls: ['Practice anyway'],
      },
      screens: ['pending', 'Your field'],
      faults: [],
    });
    expect(await again.end()).toEqual([]);
  });

  it('offers Practice anyway on home with nothing due, which opens Today on the passage, then home again as it was', async () => {
    const time = { now: DAY + 15 * HOUR };
    device.launch([record(recallOf(passage.reference, time.now - 2 * MINUTE, 3, 0)), VOICE_OFF]);
    const anyway = await launch('read', undefined, time);
    expect(await anyway.app.until(() => cardOf(anyway.host).controls.length > 0)).toBe(true);
    const before = cardOf(anyway.host);
    await anyway.app.tap('Practice anyway');
    expect(
      await anyway.app.until(
        () =>
          anyway.today() &&
          anyway.reference() === passage.reference &&
          anyway.app.buttons().includes('Say it'),
      ),
    ).toBe(true);
    await anyway.app.tap('Your field');
    expect(await anyway.app.until(anyway.home)).toBe(true);
    expect({
      before,
      after: cardOf(anyway.host).card,
      need: anyway.app.buttons().includes('When I need…'),
      screens: screensOf(anyway.watch.frames),
      faults: [...anyway.watch.faults, ...anyway.app.faults],
    }).toEqual({
      before: {
        card: 'today-card',
        line: 'All tended for today | Nothing is due right now.',
        controls: ['Practice anyway'],
      },
      after: 'today-card',
      need: false,
      screens: ['pending', 'Your field', 'Today', 'Your field'],
      faults: [],
    });
    expect(await anyway.end()).toEqual([]);
  });
});
