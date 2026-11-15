/**
 * The declaration Exact's type check reads for `@manna/core/bible`
 * (`decl/bible.d.ts`, mapped in the app's `tsconfig.json`) says what the
 * source does: the source's books are the declared ones (its numbers are
 * branded, so the match runs one way, and the testaments both ways), so a
 * changed canon type fails this workspace's typecheck, whose config
 * (`tsconfig.src.json`) has no such mapping and reads the source.
 */

import { expect, it } from 'bun:test';

import type * as Bible from '@manna/core/bible';
import type * as DeclaredBible from './decl/bible.d.ts';

/** Whether every `A` is a `B`: the declaration promises no field the source lacks. */
type Gives<A, B> = [A] extends [B] ? true : false;

const DECLARED: readonly true[] = [
  true satisfies Gives<typeof Bible.BIBLE_BOOKS, typeof DeclaredBible.BIBLE_BOOKS>,
  true satisfies Gives<Bible.Book, DeclaredBible.Book>,
  true satisfies Gives<DeclaredBible.Book['testament'], Bible.Book['testament']>,
];

it("core's canon, as the chooser declares it, is its source's", () => {
  expect(DECLARED.every((each) => each)).toBe(true);
});
