/**
 * The KJV display rule over its whole domain: every verse of the corpus,
 * and generated strings that put the marks where the corpus never does.
 * The expected text is computed here character by character, apart from
 * the rule under test: skip a leading `¶` and the whitespace after it,
 * then keep every character but `[`, `]`, `‹` and `›`, in order.
 */

import { describe, expect, it } from 'bun:test';

import { readPassage, readVerses } from '../vite/passage';
import { displayText } from './display';

const MARKS = new Set(['[', ']', '‹', '›']);
const HIDDEN = ['¶', '[', ']', '‹', '›'];
const WHITESPACE = new Set([' ', '\t']);

/** The text the rule must show for `source`, computed one character at a time. */
const expected = (source: string) => {
  const chars = [...source];
  let start = 0;
  if (chars[0] === '¶') {
    start = 1;
    while (start < chars.length && WHITESPACE.has(chars[start] ?? '')) start += 1;
  }
  return chars
    .slice(start)
    .filter((char) => !MARKS.has(char))
    .join('');
};

/** The checks of `checks` that do not hold, each named after `where`. */
const failed = (where: string, checks: ReadonlyArray<readonly [boolean, string]>) =>
  checks.filter(([holds]) => !holds).map(([, what]) => `${where} ${what}`);

const ISAIAH_41_10 =
  'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.';

describe('the KJV display rule, over every verse of the corpus', () => {
  const verses = readVerses();

  it('checks exactly 31,102 verses', () => {
    expect(verses.length).toBe(31_102);
  });

  it('shows each verse without its marks, every other character the source’s, trimmed and non-empty', () => {
    const wrong = verses.flatMap((verse) => {
      const shown = displayText(verse.text);
      const where = `${verse.book}:${verse.chapter}:${verse.verse}`;
      return failed(where, [
        ...HIDDEN.map((mark) => [!shown.includes(mark), `keeps ${mark}`] as const),
        [shown === expected(verse.text), `shows «${shown}»`],
        [shown.length > 0 && shown.trim() === shown, 'is empty or untrimmed'],
      ]);
    });
    expect(wrong).toEqual([]);
  });

  it('shows Isaiah 41:10 word for word, and Today derives the same', () => {
    const source = verses.find(
      (verse) => verse.book === 23 && verse.chapter === 41 && verse.verse === 10,
    );
    expect(source?.text.startsWith('¶ ')).toBe(true);
    expect(displayText(source?.text ?? '')).toBe(ISAIAH_41_10);
    expect(readPassage()).toEqual({ reference: 'Isaiah 41:10', text: ISAIAH_41_10 });
  });
});

/** A seeded generator (mulberry32): the same strings on every run. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const WORDS = ['Fear', 'thou', 'not', 'I', 'am', 'with', 'thee', 'LORD', 'a'];
const PUNCTUATION = [',', '.', ':', ';', '?', '!', '(', ')', "'", '-'];
const MARK_LIST = [...MARKS];
const SPACES = [' ', '\t'];

/** At least 1,000 strings of words, spaces, punctuation and marks at any place, some after a leading `¶` and its whitespace. */
const generate = (count: number) => {
  const random = seeded(41_10);
  const pick = (items: ReadonlyArray<string>) => items[Math.floor(random() * items.length)] ?? '';
  const leadOf = () => {
    if (random() < 0.5) return '';
    return `¶${Array.from({ length: Math.floor(random() * 4) }, () => pick(SPACES)).join('')}`;
  };
  return Array.from({ length: count }, () => {
    const tokens = Array.from({ length: Math.floor(random() * 16) }, () => {
      const kind = random();
      if (kind < 0.35) return pick(MARK_LIST);
      if (kind < 0.6) return pick(WORDS);
      if (kind < 0.8) return ' ';
      return pick(PUNCTUATION);
    });
    return { lead: leadOf(), body: tokens.join('') };
  });
};

describe('the KJV display rule, over generated strings', () => {
  const cases = generate(2_000);

  it('reaches marks first, last, adjacent and unbalanced, and a ¶ with more than one whitespace after it', () => {
    const reached = {
      first: cases.some(({ body }) => MARKS.has(body[0] ?? '')),
      last: cases.some(({ body }) => MARKS.has(body.at(-1) ?? '')),
      firstAfterPilcrow: cases.some(({ lead, body }) => lead !== '' && MARKS.has(body[0] ?? '')),
      adjacent: cases.some(({ body }) => /[[\]‹›]{2}/u.test(body)),
      unbalanced: cases.some(
        ({ body }) =>
          body.split('[').length !== body.split(']').length ||
          body.split('‹').length !== body.split('›').length,
      ),
      closerFirst: cases.some(({ body }) => /^[\]›]/u.test(body)),
      longWhitespace: cases.some(({ lead }) => /^¶\s{2,}$/u.test(lead)),
      tab: cases.some(({ lead }) => lead.includes('\t')),
      pilcrowAlone: cases.some(({ lead }) => lead === '¶'),
      noPilcrow: cases.some(({ lead }) => lead === ''),
    };
    expect(reached).toEqual({
      first: true,
      last: true,
      firstAfterPilcrow: true,
      adjacent: true,
      unbalanced: true,
      closerFirst: true,
      longWhitespace: true,
      tab: true,
      pilcrowAlone: true,
      noPilcrow: true,
    });
  });

  it('hides every mark, is idempotent, and keeps every other character in order', () => {
    const wrong = cases.flatMap(({ lead, body }) => {
      const input = `${lead}${body}`;
      const shown = displayText(input);
      return failed(`«${input}»`, [
        ...HIDDEN.map((mark) => [!shown.includes(mark), `keeps ${mark}`] as const),
        [displayText(shown) === shown, 'is not idempotent'],
        [shown === expected(input), `shows «${shown}»`],
      ]);
    });
    expect(cases.length).toBeGreaterThanOrEqual(1_000);
    expect(wrong).toEqual([]);
  });

  it('keeps the words a bracket encloses, and a mark beside punctuation', () => {
    expect(displayText('¶  [‹Fear›] thou] not[;')).toBe('Fear thou not;');
    expect(displayText('‹the beloved son:›.')).toBe('the beloved son:.');
    expect(displayText('[]')).toBe('');
  });
});
