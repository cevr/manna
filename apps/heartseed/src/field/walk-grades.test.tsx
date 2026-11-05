/* oxlint-disable effect/noAsyncFunction -- the case plays generated devices through the field's promise-based screen rig. */

/**
 * The field across generated sequences of commands (`src/test/field-walk.ts`),
 * over devices whose commands reach opens and ways back between recitals,
 * Again and a peek: each open and way back writes, removes and clears nothing
 * and leaves the whole disk, Again and a peek each rewrite one record of the
 * passage (Again none when already chosen), and each launch ends with no key
 * removed and none but the passage's recalls changed or added.
 */

import { describe, expect, it } from 'bun:test';

import { walkField } from '../test/field-walk';

describe('the field across generated grades', () => {
  it('writes nothing through any open or way back, across recitals, Again and peeks, over 2 generated devices', async () => {
    const cover = await walkField([12, 31], 6);
    expect({
      field: (cover.field ?? 0) >= 3,
      say: (cover.say ?? 0) >= 3,
      again: (cover.again ?? 0) >= 1,
      peek: (cover.peek ?? 0) >= 1,
      relaunch: (cover.relaunch ?? 0) >= 1,
    }).toEqual({ field: true, say: true, again: true, peek: true, relaunch: true });
  });
});
