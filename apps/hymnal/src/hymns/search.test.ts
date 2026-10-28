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
import { find, fold, hymnIndex, KIN, oneEdit, search } from './search';

const index = hymnIndex();
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

/** Each hymn's title and lines folded, each between spaces, made once per hymn as `holders` asks. */
const spaced = new Map<number, ReadonlyArray<string>>();
const spacedOf = (hymn: Hymn): ReadonlyArray<string> => {
  const made =
    spaced.get(hymn.number) ??
    [wordsOf(hymn.title), ...linesOf(hymn)].map((ws) => ` ${ws.join(' ')} `);
  spaced.set(hymn.number, made);
  return made;
};

/** The hymns that hold `phrase` as whole words in a line or the title. */
const holders = (phrase: string) => {
  const longest = phrase.split(' ').toSorted((a, b) => b.length - a.length)[0] ?? '';
  return hymns
    .filter((hymn, h) => raw[h]?.includes(longest))
    .filter((hymn) => spacedOf(hymn).some((line) => line.includes(` ${phrase} `)))
    .map((hymn) => hymn.number);
};

/** Each hymn's words (its title's and every line's), folded once per hymn. */
const wordSets = new Map(
  hymns.map((hymn, h) => [hymn.number, new Set(wordsOf(raw[h] ?? ''))] as const),
);
/** Every word the hymns hold, sorted, for the words a prefix starts. */
const vocabulary = [...new Set([...wordSets.values()].flatMap((set) => [...set]))].toSorted();

/** The words the hymns hold that start with `prefix`. */
const startingWith = (prefix: string) => {
  let low = 0;
  let high = vocabulary.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((vocabulary[middle] ?? '') < prefix) low = middle + 1;
    else high = middle;
  }
  const out: Array<string> = [];
  for (let i = low; (vocabulary[i] ?? '').startsWith(prefix); i++) out.push(vocabulary[i] ?? '');
  return out;
};

/** The hymns that hold `word` with no typo: the word itself, a word it starts, or its kin. */
const sureHolders = (word: string) => {
  const forms = [...(KIN.find((group) => group.includes(word)) ?? []), ...startingWith(word)];
  return hymns.map((hymn) => hymn.number).filter((n) => forms.some((w) => wordSets.get(n)?.has(w)));
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
      `hymn no. ${n}`,
      `hymn no ${n}`,
      `${n}.`,
      `${n},`,
      `(${n})`,
      `#${n}.`,
      `n° ${n}`,
    ];
    for (const n of [1, 42, 100, 695])
      expect(forms(n).map((q) => numbers(q)[0])).toEqual(forms(n).map(() => n));
    expect(numbers('(100)')).toEqual([100]);
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
    expect(found.slice(0, titled.length).map((f) => f.hymn.number)).toEqual(
      titled.map((f) => f.hymn.number),
    );
    expect(titled.every((f) => Option.isNone(f.line))).toBe(true);
  });

  it('ranks the hymns that hold a word typed alone above the hymns a typo of it finds', () => {
    // Every 200th word of 4 letters or more, in sorted order: 25 words.
    const words = vocabulary.filter((w) => w.length >= 4).filter((_, i) => i % 200 === 0);
    const misses = words.filter((word) => {
      const holders = sureHolders(word);
      const found = numbers(word);
      return (
        !found.slice(0, holders.length).every((n) => holders.includes(n)) ||
        found.length < holders.length
      );
    });
    expect({ words: words.length, misses: misses.length }).toEqual({ words: 25, misses: 0 });
  });

  it('finds the words a word being typed starts', () => {
    // The first 3 letters of a word of 6 letters or more that no hymn holds as a word.
    const stubs = vocabulary
      .filter((w) => w.length >= 6 && !wordSets.values().some((set) => set.has(w.slice(0, 3))))
      .filter((_, i) => i % 50 === 0)
      .map((w) => w.slice(0, 3));
    expect(stubs.length).toBeGreaterThan(5);
    const misses = stubs.filter((stub) => {
      const holders = sureHolders(stub);
      return (
        numbers(stub)
          .toSorted((a, b) => a - b)
          .join() !== holders.join()
      );
    });
    expect(misses.length).toBe(0);
  });

  it('finds a title as its last word is typed, among the titles that hold what is typed', () => {
    const titles = hymns
      .filter((hymn) => {
        const ws = wordsOf(hymn.title);
        return ws.length >= 3 && (ws.at(-1)?.length ?? 0) >= 5;
      })
      .filter((_, i) => i % 20 === 0);
    expect(titles.length).toBeGreaterThan(5);
    const misses = titles.filter((hymn) => {
      const ws = wordsOf(hymn.title);
      const typed = [...ws.slice(0, -1), ws.at(-1)?.slice(0, 3) ?? ''];
      // The titles that hold every word typed, the last as a word it starts.
      const titled = hymns.filter((other) => {
        const title = wordsOf(other.title);
        return (
          typed.slice(0, -1).every((w) => title.includes(w)) &&
          title.some((w) => w.startsWith(typed.at(-1) ?? ''))
        );
      }).length;
      const at = numbers(typed.join(' ')).indexOf(hymn.number);
      return at < 0 || at >= titled;
    });
    expect(misses.map((hymn) => hymn.number)).toEqual([]);
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
    expect(
      Option.map(found[0]?.line ?? Option.none(), (line) => wordsOf(line).join(' ') === query),
    ).toEqual(Option.some(true));
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
