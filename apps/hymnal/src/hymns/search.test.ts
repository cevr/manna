/**
 * Search over the real compiled hymnal (`src/test/setup.ts` hands in the
 * words the bundler derives). Every query is made here from the hymns
 * themselves, and every check compares hymn numbers, so no hymn's words
 * are written in this file or printed by it. The corpus-wide sweeps are in
 * `search.property.slow.test.ts`.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { hymns } from './hymns';
import { find, fold, indexOf, KIN, oneEdit, search } from './search';

const index = indexOf(hymns);
const numbers = (query: string) => search(index, query).map((h) => h.number);
const wordsOf = (text: string) => fold(text).split(' ').filter(Boolean);
type Hymn = (typeof hymns)[number];

/** Every line of a hymn's stanzas and refrains, folded. */
const linesOf = (hymn: Hymn) =>
  hymn.sections.flatMap((section) => section.lines.map((line) => wordsOf(line)));

/** The first line of 6 words or more past the first stanza's opening, of the first hymn that has one at or after `from`. */
const deepLine = (from: number) => {
  for (const hymn of hymns.filter((h) => h.number >= from)) {
    const line = linesOf(hymn)
      .slice(1)
      .find((ws) => ws.length >= 6 && ws.join(' ') !== fold(hymn.title));
    if (line) return { hymn: hymn.number, words: line };
  }
  return { hymn: 0, words: [] };
};

/** Each hymn's words in lower case, unfolded: a quick first sieve for `holders`. */
const raw = hymns.map((hymn) =>
  [hymn.title, ...hymn.sections.flatMap((section) => section.lines)].join('\n').toLowerCase(),
);

/** The hymns that hold `phrase` as whole words in a line or the title. */
const holders = (phrase: string) => {
  const longest = phrase.split(' ').toSorted((a, b) => b.length - a.length)[0] ?? '';
  return hymns
    .filter((hymn, h) => raw[h]?.includes(longest))
    .filter((hymn) =>
      [wordsOf(hymn.title), ...linesOf(hymn)].some((ws) =>
        ` ${ws.join(' ')} `.includes(` ${phrase} `),
      ),
    )
    .map((hymn) => hymn.number);
};

const inFirst = (query: string, targets: ReadonlyArray<number>, k: number) =>
  numbers(query)
    .slice(0, k)
    .some((n) => targets.includes(n));

describe('search by number', () => {
  it('finds a hymn by its number first, then the numbers that start with it', () => {
    expect(numbers('100')).toEqual([100]);
    expect(numbers('69').slice(0, 3)).toEqual([69, 690, 691]);
  });

  it('reads every form a reader writes a number in', () => {
    const forms = (n: number) => [
      `${n}`,
      `#${n}`,
      `# ${n}`,
      `no ${n}`,
      `no. ${n}`,
      `No.${n}`,
      `hymn ${n}`,
      `Hymn #${n}`,
      `number ${n}`,
      ` NUMBER ${n} `,
    ];
    for (const n of [1, 42, 100, 695])
      expect(forms(n).map((q) => numbers(q)[0])).toEqual(forms(n).map(() => n));
  });

  it('carries no line for a hymn found by number', () => {
    expect(find(index, '#100').every((found) => Option.isNone(found.line))).toBe(true);
  });
});

describe('search by words', () => {
  it('puts the hymns whose title holds a word first, with no line under them', () => {
    // The word of 6 letters or more that the most titles hold.
    const counts = new Map<string, number>();
    for (const hymn of hymns)
      for (const word of new Set(wordsOf(hymn.title)))
        if (word.length >= 6) counts.set(word, (counts.get(word) ?? 0) + 1);
    const [word = '', count = 0] = [...counts].toSorted((a, b) => b[1] - a[1])[0] ?? [];
    expect(count).toBeGreaterThan(5);
    const found = find(index, word);
    const titled = found.filter((f) => wordsOf(f.hymn.title).some((w) => w.startsWith(word)));
    expect(titled.length).toBeGreaterThanOrEqual(count);
    expect(found.slice(0, titled.length)).toEqual(titled);
    expect(titled.every((f) => Option.isNone(f.line))).toBe(true);
  });

  it('finds a word no title holds, and shows the line that holds it', () => {
    const inTitles = new Set(hymns.flatMap((hymn) => wordsOf(hymn.title)));
    const { hymn, words } = deepLine(300);
    const word = words.find((w) => w.length >= 6 && !inTitles.has(w)) ?? '';
    expect(word).not.toBe('');
    const found = find(index, word).find((f) => f.hymn.number === hymn);
    expect(found).toBeDefined();
    expect(
      Option.map(found?.line ?? Option.none(), (line) => wordsOf(line).includes(word)),
    ).toEqual(Option.some(true));
  });

  it('finds a whole line typed out first, and shows it under the title', () => {
    const { hymn, words } = deepLine(200);
    const query = words.join(' ');
    const found = find(index, query);
    expect(holders(query)).toContain(found[0]?.hymn.number ?? -1);
    expect(Option.map(found[0]?.line ?? Option.none(), (line) => wordsOf(line).join(' '))).toEqual(
      Option.some(query),
    );
    expect(hymn).toBeGreaterThan(0);
  });

  it('finds a line with a typo in one of its long words', () => {
    const { words } = deepLine(400);
    const long = words.findIndex((w) => w.length >= 5);
    const typed = words.with(long, `${words[long]?.slice(0, 2)}${words[long]?.slice(3)}`);
    expect(oneEdit(words[long] ?? '', typed[long] ?? '')).toBe(true);
    expect(inFirst(typed.join(' '), holders(words.join(' ')), 5)).toBe(true);
  });

  it('finds a line with a word or two left out, or two words swapped', () => {
    const { words } = deepLine(500);
    const targets = holders(words.join(' '));
    expect(inFirst(words.filter((_, i) => i !== 2).join(' '), targets, 5)).toBe(true);
    expect(inFirst(words.filter((_, i) => i !== 1 && i !== 3).join(' '), targets, 5)).toBe(true);
    const swapped = [words[1], words[0], ...words.slice(2)].join(' ');
    expect(inFirst(swapped, targets, 5)).toBe(true);
  });

  it('finds an old word by the modern one, and a modern word by the old one', () => {
    const swap = (from: string, to: string) => {
      let ws: ReadonlyArray<string> = [];
      for (const [i, hymn] of hymns.entries()) {
        if (ws.length > 0) break;
        if (!raw[i]?.includes(from)) continue;
        ws = linesOf(hymn).find((line) => line.length >= 5 && line.includes(from)) ?? [];
      }
      return {
        query: ws.map((w) => ({ [from]: to })[w] ?? w).join(' '),
        targets: holders(ws.join(' ')),
      };
    };
    for (const [from, to] of [
      ['thee', 'you'],
      ['thy', 'your'],
      ['hath', 'has'],
      ['you', 'thou'],
    ] as const) {
      const { query, targets } = swap(from, to);
      expect(targets.length).toBeGreaterThan(0);
      expect(inFirst(query, targets, 5)).toBe(true);
    }
    expect(KIN.flat()).toContain('canst');
  });

  it('ignores case, accents and punctuation', () => {
    expect(fold('Ünïcode, Ça-va! Don’t')).toBe('unicode ca va dont');
    // A word the hymns write with an apostrophe, typed with a straight one, a curly one, in capitals.
    const word =
      hymns.flatMap((hymn) => hymn.title.split(/\s+/)).find((w) => /^\p{L}+['’]\p{L}+$/u.test(w)) ??
      '';
    expect(word).not.toBe('');
    const straight = word.replace(/’/g, "'");
    expect(numbers(straight).length).toBeGreaterThan(0);
    expect(numbers(straight)).toEqual(numbers(straight.replace(/'/g, '’').toUpperCase()));
  });

  it('lists every hymn for an empty query', () => {
    expect(numbers('  ')).toHaveLength(695);
  });
});

describe('one edit', () => {
  it('is a letter dropped, added, changed, or two side by side swapped', () => {
    expect(['abcde', 'abde', 'abcxde', 'abxde', 'abdce'].map((w) => oneEdit('abcde', w))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(['abc', 'edcba', 'axcxe', 'abcdefg'].map((w) => oneEdit('abcde', w))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
