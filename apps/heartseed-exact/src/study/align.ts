/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a build-time rule over plain arrays. */

/**
 * Lines a verse's tagged words up with the words the app shows (q118): the
 * app's own text is the frame, so the phone carries no second copy of the
 * Bible. When both have as many words, each shown word takes its tagged
 * word's numbers, word for word. Otherwise the two are lined up by the
 * words themselves (`lettersOf`, a longest common subsequence), each shown
 * word takes the numbers of the tagged word it matches, and a shown word
 * that matches none takes none. A verse where under `ALIGN_FLOOR` of the
 * tagged words find their shown word carries no tags at all; shown words
 * the tagged text lacks (a psalm's title) only take none.
 */

import type { WordTag } from './tags';
import { lettersOf } from './words';

/** A tagged word: its text in the tagged KJV, its numbers without their letter, and whether it was added. */
export interface TaggedWord {
  readonly text: string;
  readonly numbers: ReadonlyArray<number>;
  readonly added: boolean;
}

/** The share of words that must match for a verse to carry tags. */
export const ALIGN_FLOOR = 0.8;

/** How a verse was lined up: `equal` word for word, `aligned` by its words, `bare` with no tags. */
export type AlignKind = 'equal' | 'aligned' | 'bare';

/** A verse lined up: its shown words' tags (none when bare), how, and each shown word's tagged word's index (-1 for none). */
export interface Aligned {
  readonly kind: AlignKind;
  readonly tags: ReadonlyArray<WordTag> | undefined;
  readonly from: ReadonlyArray<number>;
}

const tagOf = (word: TaggedWord | undefined): WordTag =>
  word === undefined ? { numbers: [], added: false } : { numbers: word.numbers, added: word.added };

/** For each of `a`'s keys, the index of the key of `b` a longest common subsequence pairs it with, or -1; an empty key pairs with nothing. */
export const commonPairs = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): Array<number> => {
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  const longest = (i: number, j: number) => table[i * width + j] ?? 0;
  const same = (i: number, j: number) => a[i] !== '' && a[i] === b[j];
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i * width + j] = same(i, j)
        ? longest(i + 1, j + 1) + 1
        : Math.max(longest(i + 1, j), longest(i, j + 1));
  const pairs = Array.from({ length: a.length }, () => -1);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (same(i, j)) {
      pairs[i] = j;
      i++;
      j++;
    } else if (longest(i + 1, j) >= longest(i, j + 1)) i++;
    else j++;
  }
  return pairs;
};

/** `shown` lined up with `tagged`. */
export const alignVerse = (
  shown: ReadonlyArray<string>,
  tagged: ReadonlyArray<TaggedWord>,
): Aligned => {
  if (shown.length === tagged.length)
    return {
      kind: 'equal',
      tags: tagged.map(tagOf),
      from: tagged.map((_, index) => index),
    };
  const from = commonPairs(
    shown.map(lettersOf),
    tagged.map((word) => lettersOf(word.text)),
  );
  const matched = from.filter((index) => index >= 0).length;
  if (matched < ALIGN_FLOOR * tagged.length)
    return { kind: 'bare', tags: undefined, from: shown.map(() => -1) };
  return {
    kind: 'aligned',
    tags: from.map((index) => tagOf(index < 0 ? undefined : tagged[index])),
    from,
  };
};
