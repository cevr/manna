/**
 * Search's rules, each on a small hymnal of invented words made here, so
 * each rule is seen alone and no hymn's words are in this file or printed
 * by it. The sweeps over the real compiled hymnal (every hymn by number
 * and title, every word typed alone, seeded half-remembered lines) are in
 * `search.property.slow.test.ts`; each check here compares hymn numbers,
 * counts and booleans.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { find, fold, indexOf, oneEdit, search } from './search';
import type { HymnText } from './text';

/** A hymn of one stanza, its first line the stanza's first. */
const hymn = (number: number, title: string, stanza: ReadonlyArray<string>): HymnText => ({
  number,
  title,
  firstLine: stanza[0] ?? '',
  topic: 'Invented',
  sections: [{ kind: 'stanza', n: 1, lines: stanza }],
});

const hymnal: ReadonlyArray<HymnText> = [
  // Numbers.
  ...[1, 42, 69, 100, 690, 691, 695].map((n) => hymn(n, 'Hollin Mesk', ['Hollin mesk varo tuin'])),
  // A word in two titles and in one stanza, a longer word it starts, and a title a typo of it is.
  hymn(300, 'Zorvan Telimor', ['Abbet ollo nimrey suvast']),
  hymn(305, 'Pemmet Rusko', ['Dalo zorvan pemmet rusko', 'Quarn elbo fistrel']),
  hymn(310, 'Kesh Zorvan', ['Ombral kesh ditto marrow']),
  hymn(320, 'Zorvat Quembly', ['Tolvey annic brume selket']),
  hymn(330, 'Loresh Tumbel', ['Zorvanic tumbel loresh', 'Ivver casto plene']),
  // A line, and a hymn holding the same words in lines of the same weight, in other lines and order.
  hymn(350, 'Mirav Dessel', ['Mirav dessel onquo', 'Palvoro sirendo kalimbor olumtra teliquor']),
  hymn(351, 'Wend Ostal', [
    'Anwe ressel dorn',
    'Teliquor olumtra kalimbor',
    'Sirendo palvoro anwe',
  ]),
  // A title to type.
  hymn(360, 'Mendrake Olumtra Quillet', ['Hask ivren dolmo pake']),
  // Old words and modern ones.
  hymn(370, 'Brasmo Hall', ['Thee brasmo quillet dravesh', 'Pell orrin vasty']),
  hymn(371, 'Merrow Tanvil', ['You merrow tanvil ostre']),
  // Accents, an apostrophe, capitals.
  hymn(380, 'O’ervalen Dúmbra', ['Fenno gristal hape']),
  // Two words in a later line, and a title holding the one and a typo of the other.
  hymn(400, 'Ostrel Vane', ['Ostrel vane pibbo', 'Gurn bravick lummond sefto']),
  hymn(401, 'Bravick Lummend', ['Tarro hesk quindle']),
  // A word in a later line, and a word one edit from it in the same hymn's title.
  hymn(410, 'Grindal Pesh', ['Wosk umbry tolp', 'Hent grindel moaf']),
];
const index = indexOf(hymnal);
const numbers = (query: string) => search(index, query).map((h) => h.number);
/** The line, folded, that hymn `number` was found by for `query`. */
const lineOf = (query: string, number: number) =>
  Option.map(
    Option.flatMap(
      Option.fromUndefinedOr(find(index, query).find((f) => f.hymn.number === number)),
      (f) => f.line,
    ),
    fold,
  );

describe('search by number', () => {
  it('finds a hymn by its number first, then the numbers that start with it', () => {
    expect(numbers('100')).toEqual([100]);
    expect(numbers('69')).toEqual([69, 690, 691, 695]);
  });

  it('reads every form a reader writes a number in, with punctuation around it', () => {
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
      `n° ${n}`,
      `${n}.`,
      `${n},`,
      `(${n})`,
      `#${n}.`,
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
  it('puts the hymns whose title holds a word first, in number order, with no line under them', () => {
    const found = find(index, 'zorvan');
    expect(found.slice(0, 2).map((f) => f.hymn.number)).toEqual([300, 310]);
    expect(found.slice(0, 2).every((f) => Option.isNone(f.line))).toBe(true);
  });

  it('ranks the hymns that hold a word, or a word it starts, above the hymn a typo of it finds', () => {
    // 320's title holds a word one letter from it: rarer, and in a title, but a typo.
    const found = numbers('zorvan');
    expect(found.slice(2, 4).toSorted((a, b) => a - b)).toEqual([305, 330]);
    expect(found.slice(4)).toEqual([320]);
  });

  it('ranks a hymn holding every word of a longer query above one holding a word only by a typo', () => {
    // 401's title holds both, one by a typo: a heavier field, a tighter start, but a typo.
    expect(numbers('bravick lummond').slice(0, 2)).toEqual([400, 401]);
  });

  it('shows the line a hymn holds the word in, not a heavier line one edit from it', () => {
    expect(lineOf('grindel', 410)).toEqual(Option.some('hent grindel moaf'));
  });

  it('finds a word no title holds, and shows the line that holds it', () => {
    expect(lineOf('zorvan', 305)).toEqual(Option.some('dalo zorvan pemmet rusko'));
    expect(lineOf('quarn', 305)).toEqual(Option.some('quarn elbo fistrel'));
  });

  it('finds a whole line typed out first, and shows it under the title', () => {
    const query = 'palvoro sirendo kalimbor olumtra teliquor';
    expect(numbers(query)[0]).toBe(350);
    expect(lineOf(query, 350)).toEqual(Option.some(query));
  });

  it('finds a line with a typo in one of its long words', () => {
    expect(numbers('palvoro sirndo kalimbor olumtra teliquor')[0]).toBe(350);
    expect(numbers('palvoro sirendo kalimbro olumtra teliquor')[0]).toBe(350);
    // Two words, both needed: each found only through its typo.
    expect(numbers('sirndo kalimbro').toSorted((a, b) => a - b)).toEqual([350, 351]);
  });

  it('finds a line with a word or two left out, or two words swapped', () => {
    expect(numbers('palvoro sirendo olumtra teliquor')[0]).toBe(350);
    expect(numbers('palvoro kalimbor teliquor')[0]).toBe(350);
    expect(numbers('sirendo palvoro kalimbor olumtra teliquor')[0]).toBe(350);
  });

  it('finds an old word by the modern one, and a modern word by the old one', () => {
    expect(numbers('you brasmo quillet dravesh')[0]).toBe(370);
    expect(numbers('thou merrow tanvil ostre')[0]).toBe(371);
    expect(numbers('ye merrow tanvil')[0]).toBe(371);
    // Two words, both needed: one found only through its kin.
    expect(numbers('you brasmo')).toEqual([370]);
    expect(numbers('thou merrow')).toEqual([371]);
  });

  it('finds the words a word being typed starts', () => {
    expect(numbers('kal').toSorted((a, b) => a - b)).toEqual([350, 351]);
    expect(numbers('palvoro sirendo kal')[0]).toBe(350);
    // A title as its last word is typed: first, with no line.
    const found = find(index, 'mendrake olumtra qui');
    expect(found[0]?.hymn.number).toBe(360);
    expect(Option.isNone(found[0]?.line ?? Option.some(''))).toBe(true);
  });

  it('ignores case, accents and punctuation', () => {
    expect(fold('Ünïcode, Ça-va! Don’t')).toBe('unicode ca va dont');
    expect(numbers("o'ervalen dumbra")[0]).toBe(380);
    expect(numbers('O’ERVALEN DÚMBRA')[0]).toBe(380);
  });

  it('lists every hymn for an empty query', () => {
    expect(numbers('  ')).toHaveLength(hymnal.length);
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
