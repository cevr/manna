/* oxlint-disable effect/noAsyncFunction -- the walk drives the real root through React's promise-based `act`, one awaited tap at a time. */

/**
 * The Add verses sheet under the real `<Root />` (hsguards7 §C) through
 * `test/root-sheet-walk.ts`: a taught collection's verses read
 * `In your field` on the sheet as home draws them, and a plant that lands
 * reads so on reopening. Each case is one world, whose script alone must
 * reach its floors.
 *
 * It catches a root that hands the sheet a field without the taught
 * collections, or of the app's own row alone.
 */

import { expect, it } from 'bun:test';

import { walkRoot } from '../test/root-sheet-walk';
import { missed } from '../test/shelves-walk';

it('offers Proverbs 18:10 as in your field when only the taught protection collection holds it', async () => {
  const { faults, reached } = await walkRoot(1576);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['taught:protection', 1],
      ['sheet:taught:protection', 1],
      ['launch:Read', 1],
      ['stored:pick', 1],
      ['stored:taught-range', 1],
      ['own:not-planted', 1],
      ['open:add-verses', 1],
      ['offer:plant', 1],
      ['offer:in field', 1],
      ['in-field:needs-held', 1],
      ['in-field:needs-planted', 1],
      ['in-field:needs-taught', 1],
      ['proverb:in-field:by-taught', 1],
      ['proverb:by-taught:protection', 1],
      ['plant:landed', 1],
      ['plant:to-3:no-add', 1],
    ]),
  ).toEqual([]);
});

it('offers a taught collection named after an unknown id as in your field, and a landed plant as in your field on reopening', async () => {
  const { faults, reached } = await walkRoot(13);
  expect(faults).toEqual([]);
  expect(
    missed(reached, [
      ['taught:unknown', 1],
      ['sheet:taught:unknown', 1],
      ['own:planted', 1],
      ['open:add-row', 1],
      ['in-field:needs-taught', 1],
      ['proverb:plant:untaught', 1],
      ['proverb:in-field:untaught', 1],
      ['plant:landed', 1],
      ['plant:then-in-field', 1],
    ]),
  ).toEqual([]);
});
