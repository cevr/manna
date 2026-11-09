/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise -- the case plays devices through the field's promise-based screen rig, one launch held on a promise until the test releases it. */

/**
 * No field claim before a read completes, through the screen rig
 * (`src/test/field-rig.tsx`), which holds every frame to the root's and the
 * field's rules: a held launch shows no field and offers none until its read
 * lands, then opens home; an unread session offers none, though its recital
 * is written with its zone's offset at its start, beside an old record that
 * has none, and the next launch's home counts its day; a fresh install's
 * first minute offers none.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { heldOn, recallOf } from '../test/field-model';
import { mount, record } from '../test/field-rig';
import { device } from '../test/one';
import { hostOffset } from '../test/zone';

describe('the field before a read', () => {
  it('is offered in no frame of a held launch until its read lands, of an unread session (whose recital the next launch counts), or of the first minute', async () => {
    device.launch([record(recallOf(passage.reference, Date.UTC(2020, 0, 1, 12), 3, 0))]);
    const gate = Promise.withResolvers<void>();
    const held = await mount(true, gate.promise);
    expect(await held.until(() => false, 20)).toBe(false);
    expect([held.frames.pending > 0, held.frames.control, device.calls.open]).toEqual([true, 0, 0]);
    gate.resolve();
    expect(await held.until(held.home)).toBe(true);
    expect(held.faults).toEqual([]);
    expect(await held.leave()).toEqual([]);

    device.launch().fail('keys', 3);
    const unread = await mount(false);
    expect(await unread.until(() => device.calls.keys === 3)).toBe(true);
    await unread.say();
    await unread.until(() => false, 20);
    expect([unread.frames.control, unread.headings(), unread.faults]).toEqual([0, ['Today'], []]);
    expect(await unread.leave()).toEqual([]);

    device.launch();
    const after = await mount(true);
    expect(await after.until(after.home)).toBe(true);
    expect([heldOn(device.disk).length, after.onHome().sown]).toEqual([2, '2 days sown']);
    expect(
      heldOn(device.disk).map((recall) => [
        Object.hasOwn(recall, 'offset'),
        recall.offset === hostOffset(recall.startedAt),
      ]),
    ).toEqual([
      [false, false],
      [true, true],
    ]);
    expect(await after.leave()).toEqual([]);

    device.launch([['heartseed/voice/enabled', 'true']]);
    const fresh = await mount(true);
    expect(await fresh.until(() => fresh.headings().length > 0)).toBe(true);
    await fresh.until(() => false, 20);
    expect([fresh.headings().includes('Today'), fresh.frames.control, fresh.faults]).toEqual([
      false,
      0,
      [],
    ]);
    expect(await fresh.leave()).toEqual([]);
  });
});
