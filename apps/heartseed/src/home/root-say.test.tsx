/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- the cases play devices through the field's promise-based screen rig and read happy-dom nodes whose absent attributes are null. */

/**
 * The root's fixed launches that hold a recital (hshomeroot R1, R2, R4 and
 * R7), cut from `root.test.tsx` by its budget, through the field's screen
 * rig with each frame held to the root's frame rule (`watchedLaunch`). The
 * root renders with no `opening`. A fresh install's first minute through
 * `Continue` opens home in the done state, with no Today frame after it;
 * a recital on Today shows no way back while Say it listens, and
 * `Your field` after its result leads home.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { recallOf } from '../test/field-model';
import { footOf, mount, record } from '../test/field-rig';
import { device } from '../test/one';
import { screensOf, watchedLaunch } from '../test/root-rule';

const VOICE_OFF = ['heartseed/voice/enabled', 'false'] as const;

/** A read launch through the field rig, every frame held to the root's rule. */
const launch = () => watchedLaunch('read', () => mount(true));

describe('the root around a recital', () => {
  it('opens a fresh install on the first minute, and Continue on home in the done state', async () => {
    device.launch([VOICE_OFF]);
    const fresh = await launch();
    const at = (heading: string) => fresh.app.until(() => fresh.app.headings().includes(heading));
    expect(await at('Hear it')).toBe(true);
    await fresh.app.tap('Next');
    expect(await at('Say it with help')).toBe(true);
    await fresh.app.tap('Say it');
    expect(await at('Say it alone')).toBe(true);
    await fresh.app.tap('Say it');
    expect(await at('Planted')).toBe(true);
    const planted = fresh.watch.frames.length;
    await fresh.app.tap('Continue');
    expect(await fresh.app.until(fresh.home)).toBe(true);
    await fresh.app.until(() => false, 8);
    expect({
      foot: footOf(fresh.host),
      need: fresh.app.buttons().includes('When I need…'),
      after: screensOf(fresh.watch.frames.slice(planted)),
      faults: [...fresh.watch.faults, ...fresh.app.faults],
    }).toEqual({
      foot: { card: 'begin-card', line: 'Nothing to tend now', controls: [] },
      need: true,
      after: ['Your field'],
      faults: [],
    });
    expect(await fresh.end()).toEqual([]);
  });

  it('shows Today with no way back while Say it listens, and Your field after the result', async () => {
    device.launch([record(recallOf(passage.reference, Date.UTC(2020, 0, 1, 12), 3, 0)), VOICE_OFF]);
    const run = await launch();
    expect(await run.app.until(() => footOf(run.host).controls.includes('Begin'))).toBe(true);
    await run.app.tap('Begin');
    expect(await run.app.until(() => run.today() && run.app.buttons().includes('Say it'))).toBe(
      true,
    );
    await run.app.say();
    const listening = run.watch.frames.filter((frame) => frame.listening);
    expect({
      listening: listening.length > 0,
      on: [...new Set(listening.map((frame) => frame.headings.join('|')))],
      back: run.app.buttons().includes('Your field'),
    }).toEqual({ listening: true, on: ['Today'], back: true });
    await run.app.tap('Your field');
    expect(await run.app.until(run.home)).toBe(true);
    expect([...run.watch.faults, ...run.app.faults]).toEqual([]);
    expect(await run.end()).toEqual([]);
  });
});
