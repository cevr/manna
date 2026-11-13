/* oxlint-disable effect/noAsyncFunction -- the case plays a generated device through the field's promise-based screen rig. */

/**
 * The field across generated sequences of commands (`src/test/field-walk.ts`),
 * over generated device 57, whose commands reach opens and ways back, a
 * recital, two relaunches and a peek: each open and way back writes, removes
 * and clears nothing and leaves the whole disk, a recital adds one record of
 * the passage only at its `Next`, and each launch ends with no key removed and none but the
 * passage's recalls changed or added.
 */

import { describe, expect, it } from 'bun:test';

import { walkField } from '../test/field-walk';

describe('the field across generated relaunches', () => {
  it('writes nothing through any open or way back, across a recital, a peek and relaunches, over generated device 57', async () => {
    const cover = await walkField([57], 6);
    expect({
      field: (cover.field ?? 0) >= 2,
      say: (cover.say ?? 0) >= 1,
      relaunch: (cover.relaunch ?? 0) >= 2,
      peek: (cover.peek ?? 0) >= 1,
    }).toEqual({ field: true, say: true, relaunch: true, peek: true });
  });
});
