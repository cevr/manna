/* oxlint-disable effect/noAsyncFunction -- the walk drives the real root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet under the real `<Root />` (hsguards7 §C) through
 * `test/root-sheet-walk.ts`, on two more worlds: a taught collection's own
 * shelf, and the app's own verse beside a held Proverbs 18:10 with the
 * protection collection taught. Each case is one world, whose script alone
 * must reach its floors.
 *
 * It catches a root that hands the sheet a field without the taught
 * collections, or of the app's own row alone.
 */

import { expect, it } from 'bun:test';

import { walkRoot } from '../test/root-sheet-walk';
import { missed } from '../test/shelves-walk';

it("offers a taught collection's own shelf wholly as in your field, and a list it holds in part as Plant", async () => {
  const { faults, reached } = await walkRoot(1421);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['taught:without', 1],
      ['sheet:taught:without', 1],
      ['stored:taught-range', 1],
      ['taught:in-part', 1],
      ['taught-shelf:whole', 1],
      ['in-field:needs-taught', 1],
      ['in-field:needs-planted', 1],
      ['proverb:plant:untaught', 1],
    ]),
  ).toEqual([]);
});

it("offers the app's own verse and a held Proverbs 18:10 as in your field beside the taught protection collection", async () => {
  const { faults, reached } = await walkRoot(430);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['taught:protection', 1],
      ['sheet:taught:protection', 1],
      ['stored:proverb', 1],
      ['open:add-list', 1],
      ['in-field:needs-own', 1],
      ['proverb:in-field:taught-and-more', 1],
    ]),
  ).toEqual([]);
});
