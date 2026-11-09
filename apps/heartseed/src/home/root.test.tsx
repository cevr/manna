/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noNullish -- the cases play devices through the field's promise-based screen rig, one launch held on a promise until the case releases it, and read happy-dom nodes whose absent attributes are null. */

/**
 * The root's fixed launches (hshomeroot R1-R3, R6 and R8) through the
 * field's screen rig (`src/test/field-rig.tsx`), each frame of each launch
 * held to the root's frame rule (`watchedLaunch`, `src/test/root-rule.ts`).
 * The root renders with no `opening`, so every case's opening comes from the
 * default. Each case names its expected screens and values: a read launch
 * with the passage due, pending then home with its plan's counts in every
 * home frame; an unread garden on Today with no field; garbled passages,
 * home with `Begin` alone; a held read, pending until its release; a
 * relaunch after a choice and a visit, which keeps neither; and When I
 * need… from home and back, then a known promise on Today. The launches
 * that hold a recital are `root-say.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { recallOf } from '../test/field-model';
import { footOf, mount, record, selectedPlants } from '../test/field-rig';
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
    expect(await read.app.until(() => footOf(read.host).controls.includes('Begin'))).toBe(true);
    await read.app.until(() => false, 8);
    const homes = read.watch.frames.filter((frame) => frame.headings.join('|') === 'Your field');
    expect({
      foot: footOf(read.host),
      screens: screensOf(read.watch.frames),
      uncounted: homes.filter((frame) => frame.counts === '').length,
      first: homes[0]?.counts,
      faults: [...read.watch.faults, ...read.app.faults],
    }).toEqual({
      foot: { card: 'begin-card', line: '1 to tend · about 1 min', controls: ['Begin'] },
      screens: ['pending', 'Your field'],
      uncounted: 0,
      first: '1 to tend · about 1 min',
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

  it('opens home over garbled passages with Begin alone, which opens Today on the app’s passage', async () => {
    device.launch([due(), [KEY, GARBLED], VOICE_OFF]);
    const garbled = await launch('read');
    expect(await garbled.app.until(() => footOf(garbled.host).controls.includes('Begin'))).toBe(
      true,
    );
    await garbled.app.until(() => false, 8);
    expect({
      heading: garbled.app.headings(),
      foot: footOf(garbled.host).controls,
      counts: garbled.host.querySelectorAll('[data-testid="counts"]').length,
      need: garbled.app.buttons().includes('When I need…'),
    }).toEqual({ heading: ['Your field'], foot: ['Begin'], counts: 0, need: false });
    await garbled.app.tap('Begin');
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
    await first.app.tap(`Start here with ${passage.reference}`);
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
    expect([selectedPlants(first.host), footOf(first.host).controls]).toEqual([[], ['Begin']]);
    expect([...first.watch.faults, ...first.app.faults]).toEqual([]);
    expect(await first.end()).toEqual([]);

    const again = await launch('read', undefined, time);
    expect(await again.app.until(again.home)).toBe(true);
    await again.app.until(() => false, 8);
    expect({
      chosen: selectedPlants(again.host),
      foot: footOf(again.host),
      screens: screensOf(again.watch.frames),
      faults: [...again.watch.faults, ...again.app.faults],
    }).toEqual({
      chosen: [],
      foot: { card: 'begin-card', line: 'Nothing to tend now', controls: [] },
      screens: ['pending', 'Your field'],
      faults: [],
    });
    expect(await again.end()).toEqual([]);
  });

  it('opens When I need… from home, back to home by Your field, and a known promise on Today', async () => {
    device.launch([due(), VOICE_OFF]);
    const need = await launch('read');
    const onNeed = () => need.app.until(() => need.app.headings().join('|') === 'When I need…');
    expect(await need.app.until(need.home)).toBe(true);
    await need.app.tap('When I need…');
    expect(await onNeed()).toBe(true);
    expect(
      ['Your field', passage.reference, 'Today'].map((name) => need.app.buttons().includes(name)),
    ).toEqual([true, true, false]);
    await need.app.tap('Your field');
    expect(await need.app.until(need.home)).toBe(true);
    await need.app.tap('When I need…');
    expect(await onNeed()).toBe(true);
    await need.app.tap(passage.reference);
    expect(
      await need.app.until(
        () =>
          need.today() &&
          need.reference() === passage.reference &&
          need.app.buttons().includes('Say it'),
      ),
    ).toBe(true);
    expect({
      need: need.app.buttons().includes('When I need…'),
      screens: screensOf(need.watch.frames),
      faults: [...need.watch.faults, ...need.app.faults],
    }).toEqual({
      need: false,
      screens: ['pending', 'Your field', 'When I need…', 'Your field', 'When I need…', 'Today'],
      faults: [],
    });
    expect(await need.end()).toEqual([]);
  });
});
