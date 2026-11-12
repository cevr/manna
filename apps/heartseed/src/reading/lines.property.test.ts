/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its texts with plain branches and writes its reference as a plain walk over the text's characters. */

/**
 * A verse's lines (hspiece L1). Its seam: `linesOf`, judged against a
 * reference that walks the text one character at a time (a word is a
 * whitespace run holding a letter or number; every other character between
 * two words' letters is the gap's), for generated texts of 1-70 words with
 * every mark the corpus holds, mark-only runs, leading marks, a paragraph
 * mark, several kinds of whitespace and numbers, and for the real pieces
 * the session plans over (Protection & Fear taught and two held passages).
 * Each line's ends are words of `wordSpans`, the lines cover every word in
 * order, and each line's shown words joined give `shownWordsOf` in order.
 *
 * It catches a line at a plain gap or a parenthesis, a strong break with
 * fewer than 4 words either side or a comma break with fewer than 6, a gap
 * read from the word's own trail alone, a short verse cut, and a word split
 * other than the voice's. It misses how the lines are drawn: that is the
 * drawings' test.
 */

import { describe, expect, it } from 'bun:test';

import { collectionPieces, piecesOf } from '../passages';
import { TAUGHT } from '../promises';
import { collectionsOf } from '../promises/taught';
import { below, random } from '../test/garden-model';
import { wordSpans } from '../voice/reading';
import { linesOf, type Line } from './lines';
import { shownWordsOf } from './words';

const CORES = ['and', 'Lord', 'é', 'αγάπη', 'жизнь', '愛', '3', '144', 'O'];
const LEADS = ['', '', '', '', '', '(', '¶ ', '— ', "'"];
const TRAILS = [
  '',
  '',
  '',
  '',
  ',',
  ',',
  ';',
  ':',
  '.',
  '?',
  '!',
  ')',
  "'",
  '-',
  ' —',
  ' ...',
  ' ,',
  ' ;',
  '.)',
  ',)',
];
const SPACES = [' ', ' ', ' ', '  ', '\t', '\u00a0'];

const pick = <A>(next: () => number, list: readonly A[]): A => list[below(next, list.length)]!;

/** Marks that never end a line, for the texts drawn with no room to break. */
const PLAIN_TRAILS = ['', '', '', ')', "'", '-'];

/** A text of `count` words, from `next`: one in five with no mark that can end a line. */
const textOf = (next: () => number, count: number): string => {
  const parts: string[] = [];
  const trails = below(next, 5) === 0 ? PLAIN_TRAILS : TRAILS;
  for (let index = 0; index < count; index += 1) {
    if (index > 0) parts.push(pick(next, SPACES));
    parts.push(`${pick(next, LEADS)}${pick(next, CORES)}${pick(next, trails)}`);
  }
  return parts.join('');
};

const LETTER = /[\p{L}\p{N}]/u;
const SPACE = /\s/u;

type Kind = 'strong' | 'comma' | 'plain';

/** The text's whitespace-free runs, one character at a time, each marked a word when it holds a letter or number. */
const runsOf = (text: string): readonly { chars: string[]; word: boolean }[] => {
  const runs: { chars: string[]; word: boolean }[] = [];
  let open: string[] = [];
  for (const char of [...text, ' ']) {
    if (!SPACE.test(char)) {
      open.push(char);
      continue;
    }
    if (open.length > 0) runs.push({ chars: open, word: open.some((each) => LETTER.test(each)) });
    open = [];
  }
  return runs;
};

/** A gap's kind: strong with one of `. ; : ? !`, a comma gap with `,` and none of those, else plain. */
const kindOf = (gap: string): Kind => {
  if (/[.;:?!]/u.test(gap)) return 'strong';
  return gap.includes(',') ? 'comma' : 'plain';
};

/** The reference: each word's gap as the kind it is, walking the text one character at a time. */
const gapKinds = (text: string): readonly Kind[] => {
  const runs = runsOf(text);
  const kinds: Kind[] = [];
  let gap = '';
  let seen = false;
  for (const run of runs) {
    if (!run.word) {
      gap += run.chars.join('');
      continue;
    }
    let first = 0;
    while (!LETTER.test(run.chars[first] ?? 'a')) first += 1;
    let last = run.chars.length - 1;
    while (!LETTER.test(run.chars[last] ?? 'a')) last -= 1;
    gap += run.chars.slice(0, first).join('');
    if (seen) kinds.push(kindOf(gap));
    seen = true;
    gap = run.chars.slice(last + 1).join('');
  }
  return kinds;
};

/** The reference's line sizes for `text`. */
const sizesModel = (text: string): readonly number[] => {
  const kinds = gapKinds(text);
  const count = kinds.length + 1;
  if (count <= 20) return [count];
  const sizes: number[] = [];
  let open = 0;
  for (let word = 0; word < kinds.length; word += 1) {
    open += 1;
    const room = kinds[word] === 'strong' ? 4 : kinds[word] === 'comma' ? 6 : count;
    if (open >= room && count - word - 1 >= room) {
      sizes.push(open);
      open = 0;
    }
  }
  return [...sizes, open + 1];
};

/** Every fault of `lines` over `text`: a line's ends outside the words, a gap or overlap, sizes not the reference's, shown words not `shownWordsOf`'s. */
const faultsOf = (text: string, lines: readonly Line[]): readonly string[] => {
  const count = wordSpans(text).length;
  const faults: string[] = [];
  lines.forEach((line, at) => {
    if (line.first < 0 || line.last >= count || line.first > line.last)
      faults.push(`line ${at} ${line.first}-${line.last} outside ${count} words`);
    const before = lines[at - 1];
    if (before !== undefined && line.first !== before.last + 1) faults.push(`line ${at} not next`);
  });
  if (lines[0]?.first !== 0 || lines.at(-1)?.last !== count - 1) faults.push('lines miss an end');
  const sizes = lines.map((line) => line.last - line.first + 1);
  if (sizes.join('+') !== sizesModel(text).join('+'))
    faults.push(`sizes ${sizes.join('+')}, model ${sizesModel(text).join('+')}`);
  const shown = shownWordsOf(text);
  const joined = lines.flatMap((line) => shown.slice(line.first, line.last + 1));
  if (JSON.stringify(joined) !== JSON.stringify(shown)) faults.push('shown words differ');
  return faults;
};

describe('a verse’s lines', () => {
  it('follow the punctuation as the reference walks it, over generated texts', () => {
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const wrong: string[] = [];
    for (let seed = 1; seed <= 1200; seed += 1) {
      const next = random(seed * 7919);
      const text = textOf(next, 1 + below(next, 70));
      const lines = linesOf(text);
      for (const fault of faultsOf(text, lines)) wrong.push(`seed ${seed}: ${fault}`);
      const kinds = gapKinds(text);
      bump(kinds.length + 1 <= 20 ? 'short' : lines.length > 1 ? 'lined' : 'unbroken');
      for (const line of lines.slice(0, -1)) bump(`break:${kinds[line.last]}`);
      if (lines.some((line) => line.last - line.first + 1 > 12)) bump('a long line');
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const kind of ['short', 'lined', 'unbroken', 'break:strong', 'break:comma', 'a long line'])
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(20);
    expect(tally.get('break:plain') ?? 0).toBe(0);
  });

  it('cut the real pieces the session plans, Protection & Fear and two held passages, as the reference does', () => {
    const pieces = piecesOf(
      [],
      {
        _tag: 'Read',
        passages: [
          { book: 23, chapter: 43, first: 1, last: 7 },
          { book: 43, chapter: 3, first: 14, last: 21 },
        ],
        lists: [],
      },
      collectionPieces(collectionsOf(TAUGHT)),
    );
    expect(pieces.length).toBe(28);
    const wrong = pieces.flatMap((piece) =>
      faultsOf(piece.text, linesOf(piece.text)).map((fault) => `${piece.reference}: ${fault}`),
    );
    expect(wrong).toEqual([]);
    expect(pieces.filter((piece) => linesOf(piece.text).length > 1).length).toBeGreaterThanOrEqual(
      8,
    );
  });
});
