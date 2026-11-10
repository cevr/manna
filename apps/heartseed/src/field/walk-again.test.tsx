/* oxlint-disable effect/noAsyncFunction -- the case plays a generated device through the field's promise-based screen rig. */

/**
 * The field across generated sequences of commands (`src/test/field-walk.ts`),
 * over generated device 31, whose commands reach an open and its way back,
 * recitals, Again, a peek and a relaunch: each open and way back writes,
 * removes and clears nothing and leaves the whole disk, Again and a peek each
 * rewrite one record of the passage (Again none when already chosen), and
 * each launch ends with no key removed and none but the passage's recalls
 * changed or added.
 */

import { describe, expect, it } from 'bun:test';

import { ENDS } from '../test/field-rig';
import { walkField } from '../test/field-walk';

describe('the field across generated Agains', () => {
  it('writes nothing through any open or way back, across recitals, Again, a peek and a relaunch, over generated device 31', async () => {
    const cover = await walkField([31], 6);
    expect({
      field: (cover.field ?? 0) >= 1,
      say: (cover.say ?? 0) >= 2,
      again: (cover.again ?? 0) >= 1,
      peek: (cover.peek ?? 0) >= 1,
      relaunch: (cover.relaunch ?? 0) >= 1,
      'end:none': (ENDS.get('end:none') ?? 0) >= 1,
    }).toEqual({
      field: true,
      say: true,
      again: true,
      peek: true,
      relaunch: true,
      'end:none': true,
    });
  });
});
