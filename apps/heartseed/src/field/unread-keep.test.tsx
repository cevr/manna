/* oxlint-disable effect/noAsyncFunction, effect/noTernary -- the case plays devices through the field's promise-based screen rig, and names each launch's fault as a plain branch. */

/**
 * An unread session's finished recital is kept when the read of its key's
 * stamp fails while writes work, through the screen rig
 * (`src/test/field-rig.tsx`), which holds every frame to the field's rules.
 * The launch's read fails at its listings (and then the keep's one read of
 * its key), or at every record read the launch makes; the recital still
 * lands, written with its zone's offset at its start, beside an earlier
 * record, and the next healthy launch counts its day. It catches a keep
 * that drops a finished recital because it could not read the stamp its key
 * holds; the generated histories of `sown.test.ts` hold the same rule over
 * reused keys and refused writes.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { heldOn, recallOf } from '../test/field-model';
import { mount, record } from '../test/field-rig';
import { device } from '../test/one';
import { hostOffset } from '../test/zone';

describe('an unread session whose stamp read fails', () => {
  for (const fault of ['the listing and the key', 'every record read'] as const)
    it(`keeps its finished recital when ${fault} fails but writes work: written with its zone’s offset, and counted at the next healthy launch`, async () => {
      device.launch([record(recallOf(passage.reference, Date.UTC(2025, 0, 1, 12), 3, 0))]);
      if (fault === 'every record read') device.fail('get', 100);
      else device.fail('keys', 3);
      const unread = await mount(false);
      const failed = () =>
        fault === 'every record read' ? device.calls.get >= 3 : device.calls.keys === 3;
      expect(await unread.until(() => failed() && unread.buttons().includes('Say it'))).toBe(true);
      if (fault === 'the listing and the key') device.fail('get', 1);
      const armed = device.failing.get;
      await unread.say();
      await unread.until(() => false, 20);
      expect({
        stampReadFailed: device.failing.get < armed,
        sets: device.calls.set,
        recalls: heldOn(device.disk).length,
        control: unread.frames.control,
        headings: unread.headings(),
        faults: unread.faults,
      }).toEqual({
        stampReadFailed: true,
        sets: 1,
        recalls: 2,
        control: 0,
        headings: ['Today'],
        faults: [],
      });
      expect(await unread.leave()).toEqual([]);

      device.launch();
      const after = await mount(true);
      expect(await after.until(after.home)).toBe(true);
      expect(after.onHome().sown).toBe('2 days sown');
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
    });
});
