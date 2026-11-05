/* oxlint-disable effect/noAsyncFunction -- the case plays generated devices through the field's promise-based screen rig. */

/**
 * The field across generated sequences of commands (`src/test/field-walk.ts`),
 * over devices whose commands reach opens and ways back, recitals, relaunches
 * and a peek: each open and way back writes, removes and clears nothing and
 * leaves the whole disk, each recital adds one record of the passage, and
 * each launch ends with no key removed and none but the passage's recalls
 * changed or added.
 */

import { describe, expect, it } from 'bun:test';

import { walkField } from '../test/field-walk';

describe('the field across generated commands', () => {
  it('writes nothing through any open or way back, across recitals, peeks and relaunches, over 2 generated devices', async () => {
    const cover = await walkField([3, 60], 6);
    expect({
      field: (cover.field ?? 0) >= 3,
      say: (cover.say ?? 0) >= 3,
      relaunch: (cover.relaunch ?? 0) >= 3,
      peek: (cover.peek ?? 0) >= 1,
    }).toEqual({ field: true, say: true, relaunch: true, peek: true });
  });
});
