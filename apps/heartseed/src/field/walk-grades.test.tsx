/* oxlint-disable effect/noAsyncFunction -- the case plays a generated device through the field's promise-based screen rig. */

/**
 * The field across generated sequences of commands (`src/test/field-walk.ts`),
 * over generated device 43, whose commands reach opens and ways back between
 * recitals, a peek and a relaunch: each open and way back writes, removes and
 * clears nothing and leaves the whole disk, a peek writes nothing before
 * `Next`, and each launch ends with no key removed and none but the
 * passage's recalls changed or added. Device 31, which reaches Again, is
 * `walk-again.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { walkField } from '../test/field-walk';

describe('the field across generated grades', () => {
  it('writes nothing through any open or way back, across a recital, a peek and a relaunch, over generated device 43', async () => {
    const cover = await walkField([43], 6);
    expect({
      field: (cover.field ?? 0) >= 3,
      say: (cover.say ?? 0) >= 1,
      peek: (cover.peek ?? 0) >= 1,
      relaunch: (cover.relaunch ?? 0) >= 1,
    }).toEqual({ field: true, say: true, peek: true, relaunch: true });
  });
});
