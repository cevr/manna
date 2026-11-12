/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its texts with plain branches and names a wrong case by its word numbers. */

/**
 * The reference an earlier build kept a piece of a verse under (hsphrase
 * H2), which this build still reads so old records fold into their verse:
 * `phraseReference` with `phraseOf`, judged against the model's reader
 * (`test/phrase-model.ts`) over round trips, near misses and generated
 * strings.
 *
 * It catches a reader that takes a reference in any other form, so a
 * verse's own reference would fold into another verse, or an old piece's
 * would stand as a verse of its own.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { phraseOf, phraseReference } from './phrase';
import { below, random } from './test/garden-model';
import { phraseOfRule, phraseRefRule } from './test/phrase-model';

const pick = <A>(next: () => number, list: readonly A[]): A => list[below(next, list.length)]!;

const VERSES = ['John 3:16', 'Isaiah 41:10', '1 Samuel 2:3', 'Song of Solomon 1:1', 'Psalms 91:1'];
const STRAY = ['J', ' ', '[', ']', '-', '1', '0', '9', '3', ':', 'é'];

/** A number as a reference's range may hold it, from `next`: 1-3 of the digits 1, 0, 9 and 3 (none in an eighth), now and then a stray character. */
const numberOf = (next: () => number): string =>
  Array.from({ length: below(next, 8) === 0 ? 0 : 1 + below(next, 3) }, () =>
    below(next, 10) === 0 ? pick(next, STRAY) : pick(next, ['1', '0', '9', '3']),
  ).join('');

const NEAR_MISSES = [
  'John 3:16 [01-6]',
  'John 3:16 [1-06]',
  'John 3:16 [0-3]',
  'John 3:16 [3-1]',
  'John 3:16 [1-6] ',
  'John 3:16[1-6]',
  'John 3:16 1-6]',
  'John 3:16 [1-6',
  'John 3:16 [+1-6]',
  'John 3:16 [-1-6]',
  'John 3:16 [1--6]',
  'John 3:16 [1-6-7]',
  'John 3:16 [1.5-6]',
  'John 3:16 [1-9007199254740992]',
  'John 3:16 [9007199254740992-9007199254740993]',
  'John [3]:16 [1-6]',
  'John 3:16] [1-6]',
  ' [1-6]',
  '[1-6]',
  'John 3:16 [1-6]x',
  'John 3:16 [ 1-6]',
  'John 3:16 [1 - 6]',
  'John 3:16 [١-٦]',
  'John 3:16',
  '',
];

describe('the old piece reference', () => {
  it('reads back what it writes, for verse references and any verse part with no bracket', () => {
    const next = random(0x2e1);
    const faults: string[] = [];
    for (let c = 0; c < 3000; c += 1) {
      const verse =
        below(next, 2) === 0
          ? pick(next, VERSES)
          : Array.from({ length: 1 + below(next, 8) }, () =>
              pick(
                next,
                STRAY.filter((char) => char !== '[' && char !== ']'),
              ),
            ).join('');
      const a = 1 + below(next, 120);
      const b = 1 + below(next, 120);
      const first = Math.min(a, b);
      const last = Math.max(a, b);
      const reference = phraseReference(verse, { first, last });
      if (reference !== phraseRefRule(verse, first, last))
        faults.push(`${first}-${last} written another way`);
      if (
        JSON.stringify(Option.getOrUndefined(phraseOf(reference))) !==
        JSON.stringify({ verse, first, last })
      )
        faults.push(`${JSON.stringify(reference)} read back otherwise`);
    }
    expect(faults.slice(0, 10)).toEqual([]);
  });

  it('reads no near miss of the form, and reads generated strings as H2 does', () => {
    expect(
      NEAR_MISSES.filter((reference) => Option.isSome(phraseOf(reference))).concat(
        NEAR_MISSES.filter((reference) => phraseOfRule(reference) !== undefined),
      ),
    ).toEqual([]);
    expect(
      Option.getOrUndefined(phraseOf('John 3:16 [9007199254740991-9007199254740991]')),
    ).toEqual({
      verse: 'John 3:16',
      first: 9007199254740991,
      last: 9007199254740991,
    });
    const next = random(0x51a7);
    const faults: string[] = [];
    let read = 0;
    for (let c = 0; c < 3000; c += 1) {
      const text =
        below(next, 2) === 0
          ? `${pick(next, VERSES)} [${numberOf(next)}${pick(next, ['-', '-', '-', '', '--', ':'])}${numberOf(next)}]`
          : Array.from({ length: below(next, 16) }, () => pick(next, STRAY)).join('');
      const got = Option.getOrUndefined(phraseOf(text));
      const want = phraseOfRule(text);
      if (want !== undefined) read += 1;
      if (JSON.stringify(got) !== JSON.stringify(want))
        faults.push(`${JSON.stringify(text)} read as ${JSON.stringify(got)}`);
    }
    expect(faults.slice(0, 10)).toEqual([]);
    expect(read).toBeGreaterThan(100);
  });
});
