/* oxlint-disable effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): the rules branch plainly. */

/**
 * The hymn pager's rule, as the current app's (`reader/pager.ts`): a swipe
 * moves through the list the reader pressed the hymn's row in, when it holds
 * the hymn, else through every hymn in number order; the ends do not wrap.
 * The pager draws the hymn and one page each side (`around`), and the hymn
 * a settled offset shows is the current app's `settledAt`, over the pages
 * drawn.
 */

import { settledAt } from '@manna/hymnal-app/reader/pager';

/** The hymns a pager moves through, in order, and the place of the hymn in them. */
export interface Pages {
  readonly list: ReadonlyArray<number>;
  readonly index: number;
}

/** The pages drawn for a hymn: its number, and it with the hymn before and after, as many as there are. */
export interface Around {
  readonly number: number;
  readonly numbers: Array<number>;
}

/** The pages for hymn `number` come from `from` when it holds the hymn, else from `every`, in number order. */
export const pagesFor = (
  from: ReadonlyArray<number>,
  number: number,
  every: ReadonlyArray<number>,
): Pages => {
  const list = from.includes(number) ? from : every;
  return { list, index: Math.max(0, list.indexOf(number)) };
};

/** Hymn `number` and its neighbours in its pages; none for a number no list holds. */
export const around = (
  from: ReadonlyArray<number>,
  number: number,
  every: ReadonlyArray<number>,
): Around => {
  const { list, index } = pagesFor(from, number, every);
  if (!list.includes(number)) return { number, numbers: [] };
  return { number, numbers: list.slice(Math.max(0, index - 1), index + 2) };
};

/** The hymn the pages `numbers`, each `width` wide, show once settled at `offset`; 0 for none. */
export const settled = (offset: number, width: number, numbers: ReadonlyArray<number>): number => {
  const shown = settledAt(offset, width, numbers);
  return shown._tag === 'Some' ? shown.value : 0;
};
