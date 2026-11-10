/* oxlint-disable effect/noAsyncFunction -- the case plays a generated device through the field's promise-based screen rig. */

/**
 * The field across generated sequences of commands (`src/test/field-walk.ts`),
 * over generated device 3, whose commands reach opens and ways back,
 * recitals, a relaunch and a peek: each open and way back writes, removes and
 * clears nothing and leaves the whole disk, each recital adds one record of
 * the passage, and each launch ends with no key removed and none but the
 * passage's recalls changed or added. Device 60, with more relaunches, is
 * `walk-relaunch.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { ENDS } from '../test/field-rig';
import { walkField } from '../test/field-walk';

describe('the field across generated commands', () => {
  it('writes nothing through any open or way back, across recitals, peeks and a relaunch, over generated device 3', async () => {
    const cover = await walkField([3], 6);
    expect({
      field: (cover.field ?? 0) >= 2,
      say: (cover.say ?? 0) >= 2,
      relaunch: (cover.relaunch ?? 0) >= 1,
      peek: (cover.peek ?? 0) >= 1,
      'end:one': (ENDS.get('end:one') ?? 0) >= 1,
    }).toEqual({ field: true, say: true, relaunch: true, peek: true, 'end:one': true });
  });
});
