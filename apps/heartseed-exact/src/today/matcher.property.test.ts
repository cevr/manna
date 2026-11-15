/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): the generators branch plainly and read optional list items. */

/**
 * The marks Today shows are Heartseed's matcher's, over its whole domain: for
 * a fixed seeded sample of 50 KJV verses and seeded transcripts of each (the
 * verse's words with drops, swaps and repeats, archaic words said as the
 * sounds-alike table's hearings or modern forms, and arbitrary strings),
 * heard as interim and final results and then finished, the slice's view
 * shows exactly the statuses of `matcherView` over `createMatcher(verse)`
 * fed the same results directly.
 */

import { describe, expect, it } from 'bun:test';
import { createMatcher, matcherView, updateMatcher } from '@manna/heartseed/matcher';
import table from '@manna/heartseed/kjv-hearings.json';
import { readVerses } from '@manna/heartseed/passage';

import { seeded, type Random } from '../test/random';
import { initial, step, type TodayInput } from './step';
import { view } from './view';

const VERSES = 50;
const TRANSCRIPTS = 6;

const archaic: Readonly<
  Record<
    string,
    { readonly modern: readonly string[]; readonly hearings: Readonly<Record<string, string>> }
  >
> = table.archaic;

/** Each archaic word's sayings a recognizer may write: its hearings and its modern forms. */
const sayings = (word: string): readonly string[] => {
  const entry = archaic[word];
  return entry === undefined ? [] : [...Object.keys(entry.hearings), ...entry.modern];
};

const ARBITRARY = ['', 'x', 'Ω', 'ﬁre', 'e\u0301', '𝔉ear', '42', "can't", '—', 'THEE', 'thee,'];

const transcript = (random: Random, verse: string): string => {
  const words = verse
    .split(/\s+/u)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ''))
    .filter((word) => word !== '');
  const out: string[] = [];
  for (const word of words) {
    if (random.chance(0.1)) continue;
    const said = sayings(word);
    out.push(said.length > 0 && random.chance(0.5) ? random.pick(said) : word);
    if (random.chance(0.05)) out.push(word);
    if (random.chance(0.05)) out.push(random.pick(ARBITRARY));
  }
  for (let n = random.below(3); n > 0; n--) {
    const at = random.below(Math.max(1, out.length - 1));
    const [a, b] = [out[at], out[at + 1]];
    if (a !== undefined && b !== undefined) out.splice(at, 2, b, a);
  }
  return out.join(' ');
};

/** The transcript heard as the recognizer reports it: growing interim tails, finals cut at random words. */
const reports = (
  random: Random,
  said: string,
): readonly { transcript: string; final: boolean }[] => {
  const words = said.split(' ');
  const out: { transcript: string; final: boolean }[] = [];
  let finals = 0;
  while (finals < words.length) {
    const end = Math.min(words.length, finals + 1 + random.below(8));
    out.push({ transcript: words.slice(finals, end).join(' '), final: false });
    if (random.chance(0.6) || end === words.length) {
      out.push({ transcript: words.slice(0, end).join(' '), final: true });
      finals = end;
    }
  }
  return out;
};

/** The statuses Heartseed's matcher gives `verse` heard as `heard`, then finished. */
const reference = (verse: string, heard: readonly { transcript: string; final: boolean }[]) => {
  const timed = (text: string, from: number) =>
    text
      .split(/\s+/u)
      .filter((word) => word !== '')
      .map((word, index) => ({ text: word, start: from + index, end: from + index + 1 }));
  let finals = '';
  let state = createMatcher(verse);
  heard.forEach((report, index) => {
    if (report.final) finals = report.transcript;
    const finalWords = timed(finals, 0);
    state = updateMatcher(state, {
      type: 'recognition',
      revision: index + 1,
      finalWords,
      tentativeWords: timed(report.final ? '' : report.transcript, finalWords.length),
    });
  });
  return matcherView(updateMatcher(state, { type: 'finish' })).marks.map((mark) => mark.status);
};

const slice = (verse: string, heard: readonly { transcript: string; final: boolean }[]) => {
  const inputs: TodayInput[] = [
    { _tag: 'say', recognition: 'r', at: 0, offset: 0 },
    ...heard.map((report): TodayInput => ({ _tag: 'heard', recognition: 'r', ...report })),
    { _tag: 'finish' },
  ];
  const shown = view(inputs.reduce(step, initial({ reference: '', text: verse })));
  const recall = shown.pending?.recall;
  return {
    marks: shown.words.map((word) => word.mark),
    result: { right: (recall?.words ?? 0) - (recall?.missed ?? 0), total: recall?.words },
  };
};

describe("Today's marks", () => {
  it(`are the matcher's for ${VERSES} KJV verses and ${TRANSCRIPTS} seeded transcripts each`, () => {
    const verses = readVerses();
    const random = seeded(41_10);
    for (let n = 0; n < VERSES; n++) {
      const verse = random.pick(verses).text;
      for (let t = 0; t < TRANSCRIPTS; t++) {
        const heard = reports(random, transcript(random, verse));
        const expected = reference(verse, heard);
        const shown = slice(verse, heard);
        expect({ verse, heard, marks: shown.marks }).toEqual({ verse, heard, marks: expected });
        expect(shown.result).toEqual({
          right: expected.filter((status) => status === 'matched').length,
          total: expected.length,
        });
      }
    }
  });
});
