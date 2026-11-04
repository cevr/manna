/* oxlint-disable effect/noNullish -- a mark's absent time and reveal, and a word with no text or no name, are null in the view contract the screen reads. */

/**
 * How each word of a recital shows, held to Today's rules over every status
 * and every index: what a sighted reader sees of it, what the screen reader
 * reads, and whether a tap peeks at it.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import type { Mark, MarkStatus } from '../matcher';
import { wordOf, type Ink, type ShownWord } from './screen';

const STATUSES: readonly MarkStatus[] = ['pending', 'tentative', 'matched', 'miss', 'peek'];

const WORDS = ['alpha,', 'Beta', 'gamma;', '‘delta’', 'Epsilon:', ''];

/** What a reader meets of a shown word: the text seen and its ink, the text laid out, the name read aloud, and whether a tap peeks. */
interface Met {
  readonly seen: string | null;
  readonly ink: Ink | null;
  readonly laidOut: string | null;
  readonly name: string | null;
  readonly peeks: boolean;
}

type TextWord = Extract<ShownWord, { readonly _tag: 'Text' }>;

const seenOf = (shown: TextWord) => {
  if (shown.ink === 'unseen') return null;
  return shown.text;
};

const nameOf = (shown: TextWord) => {
  if (shown.hidden) return null;
  return Option.getOrElse(shown.label, () => shown.text);
};

const metOf = (shown: ShownWord): Met => {
  if (shown._tag === 'Mark')
    return { seen: null, ink: null, laidOut: null, name: shown.label, peeks: true };
  return {
    seen: seenOf(shown),
    ink: shown.ink,
    laidOut: shown.text,
    name: nameOf(shown),
    peeks: false,
  };
};

/** Today's rules (spec, Today → The verse), one per status. */
const rule = (status: MarkStatus, index: number, word: string): Met => {
  switch (status) {
    case 'matched':
      return { seen: word, ink: 'lit', laidOut: word, name: word, peeks: false };
    case 'pending':
      return { seen: null, ink: 'unseen', laidOut: word, name: null, peeks: false };
    case 'tentative':
      return { seen: word, ink: 'hearing', laidOut: word, name: null, peeks: false };
    case 'miss':
      return {
        seen: null,
        ink: null,
        laidOut: null,
        name: `Missed word ${index + 1}`,
        peeks: true,
      };
    case 'peek':
      return { seen: word, ink: 'peeked', laidOut: word, name: `${word}, peeked`, peeks: false };
  }
};

/** A heard word has its time; any other has none. */
const timeOf = (index: number, status: MarkStatus) => {
  if (status === 'matched' || status === 'tentative') return { start: index, end: index + 1 };
  return null;
};

const markOf = (index: number, status: MarkStatus): Mark => ({
  index,
  status,
  time: timeOf(index, status),
  revealed: null,
});

describe('a recital’s words', () => {
  it('show and read as Today’s rules say, over all five statuses, every index to 63 and words with and without punctuation', () => {
    let cases = 0;
    for (const status of STATUSES)
      for (let index = 0; index < 64; index += 1)
        for (const word of WORDS) {
          const shown = wordOf(markOf(index, status), word);
          const where = `${status} at ${index}, word of ${word.length} characters`;
          expect(shown.index, where).toBe(index);
          expect(metOf(shown), where).toEqual(rule(status, index, word));
          cases += 1;
        }
    expect(cases).toBe(STATUSES.length * 64 * WORDS.length);
  });
});
