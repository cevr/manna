/* oxlint-disable effect/noNodeBuiltinImport -- the census is pinned as a sha256 digest, which node:crypto gives. */

/**
 * The cut over the whole KJV as the app reads it (`src/kjv.ts`), pinned
 * (hsphrase H1, P1's census): how many verses are phrased, how many
 * phrases and cuts at each kind of gap there are, and a digest of every
 * phrased verse's ranges in canon order. Every phrase holds 4-12 words, the
 * phrases cover their verse in order, and each phrase's text holds exactly
 * its range of the verse's words. Any change to the cut's order of choices,
 * its tie-break or its word rule moves the digest; the property beside it
 * (`phrase.property.test.ts`) says which rule moved.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import { versesOf } from '../kjv';
import { sourceWords } from '../matcher/words';
import { cutOf, type Phrase } from '../phrase';

const STRONG = /[.;:?!]/u;

interface Census {
  verses: number;
  phrased: number;
  phrases: number;
  plain: number;
  comma: number;
}

/** The gap at a cut: the marks after the last letter or number of the phrase before, and before the first of the phrase after. */
const gapAt = (before: string, after: string): string =>
  `${/[^\p{L}\p{N}]*$/u.exec(before)?.[0] ?? ''}${/^[^\p{L}\p{N}]*/u.exec(after)?.[0] ?? ''}`;

/** What is wrong with one phrased verse's phrases: a range out of order or size, other words in a phrase, or words left over. */
const faultsOf = (where: string, words: readonly string[], phrases: readonly Phrase[]) => {
  const faults: string[] = [];
  let next = 1;
  for (const phrase of phrases) {
    const size = phrase.last - phrase.first + 1;
    if (phrase.first !== next || size < 4 || size > 12)
      faults.push(`${where} phrase ${phrase.first}-${phrase.last}`);
    if (sourceWords(phrase.text).join(' ') !== words.slice(phrase.first - 1, phrase.last).join(' '))
      faults.push(`${where} phrase ${phrase.first}-${phrase.last} holds other words`);
    next = phrase.last + 1;
  }
  if (next !== words.length + 1) faults.push(`${where} phrases end at ${next - 1}`);
  return faults;
};

/** Counts one phrased verse's phrases and the gaps it is cut at. */
const countIn = (census: Census, phrases: readonly Phrase[]) => {
  census.phrased += 1;
  census.phrases += phrases.length;
  for (const [at, phrase] of phrases.slice(1).entries()) {
    const gap = gapAt(phrases[at]?.text ?? '', phrase.text);
    if (STRONG.test(gap)) continue;
    if (gap.includes(',')) census.comma += 1;
    else census.plain += 1;
  }
};

describe('the cut over the KJV', () => {
  it('phrases 28,417 verses into 85,244 phrases, by the pinned digest', () => {
    const census: Census = { verses: 0, phrased: 0, phrases: 0, plain: 0, comma: 0 };
    const lines: string[] = [];
    const faults: string[] = [];
    for (const book of BIBLE_BOOKS)
      for (let chapter = 1; chapter <= book.chapters; chapter += 1)
        for (const [index, text] of versesOf(book.number, chapter).entries()) {
          census.verses += 1;
          const phrases = cutOf(text);
          const words = sourceWords(text);
          const where = `${book.number}:${chapter}:${index + 1}`;
          if (phrases.length === 0 && words.length > 12) faults.push(`${where} kept whole`);
          if (phrases.length === 0) continue;
          countIn(census, phrases);
          faults.push(...faultsOf(where, words, phrases));
          lines.push(
            `${where} ${phrases.map((phrase) => `${phrase.first}-${phrase.last}`).join(',')}\n`,
          );
        }
    expect(faults.slice(0, 10)).toEqual([]);
    expect(census).toEqual({
      verses: 31_102,
      phrased: 28_417,
      phrases: 85_244,
      plain: 8_041,
      comma: 31_282,
    });
    expect(createHash('sha256').update(lines.join('')).digest('hex')).toBe(
      '342524ccf2fa7609ae550e6b51229e2d422bd670750dcbd187cc82754731f196',
    );
  });
});
