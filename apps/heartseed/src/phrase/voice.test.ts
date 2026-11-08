/* oxlint-disable effect/noNullish -- the walk over the corpus reads an absent verse or word as undefined and names a wrong mark by its numbers. */

/**
 * The natural voice over phrases (hsphrase H8): for a seeded sample of the
 * KJV's verses as the app reads them (`src/kjv.ts`), with Fear's verses and
 * John 3:16 among them, the natural voice's plan (`src/natural/plan.ts`'s
 * `planOf` over the app's lexicon) plans each phrase's own text whenever it
 * plans its verse's, and gives one mark per word of that text, in order,
 * each at the word's whitespace run in UTF-16 within the phrase's text, the
 * same run the verse's own plan marks once moved by where the phrase starts
 * in the verse. Words are found here one code point at a time
 * (`test/phrase-model.ts`'s `wordsOf`), apart from the plan's own scan.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { versesOf } from '../kjv';
import { lexicon } from '../natural/lexicon';
import { planOf, type WordMark } from '../natural/plan';
import { cutOf, type Phrase } from '../phrase';
import { below, random } from '../test/garden-model';
import { wordsOf } from '../test/phrase-model';

const SAMPLE = 700;

/** The verses always in the sample: John 3:16, and Fear's long ones and its whole one. */
const FIXED = [
  [43, 3, 16],
  [19, 91, 1],
  [19, 91, 4],
  [23, 43, 2],
  [23, 54, 17],
  [5, 31, 6],
  [19, 56, 3],
  [23, 41, 10],
] as const;

const marksOf = (text: string): Option.Option<readonly WordMark[]> => {
  const { words, vocab } = lexicon();
  return Option.map(planOf(words, vocab, text), (plan) =>
    plan.chunks.flatMap((chunk) => chunk.marks),
  );
};

const sampleOf = () => {
  const next = random(41);
  const out: (readonly [string, string])[] = FIXED.map(([book, chapter, verse]) => [
    `${book}:${chapter}:${verse}`,
    versesOf(book, chapter)[verse - 1] ?? '',
  ]);
  while (out.length < SAMPLE) {
    const book = BIBLE_BOOKS[below(next, BIBLE_BOOKS.length)];
    if (book === undefined) continue;
    const chapter = 1 + below(next, book.chapters);
    const verses = versesOf(book.number, chapter);
    const verse = below(next, verses.length);
    out.push([`${book.number}:${chapter}:${verse + 1}`, verses[verse] ?? '']);
  }
  return out;
};

/** What is wrong of one phrase's marks: a count off its words, a mark off its word's run, or off the verse's own mark of that word moved by `start`. */
const markFaults = (
  at: string,
  phrase: Phrase,
  start: number,
  marks: readonly WordMark[],
  verseMarks: readonly WordMark[],
) => {
  const faults: string[] = [];
  const found = wordsOf(phrase.text);
  if (marks.length !== found.length)
    faults.push(`${at}: ${marks.length} marks over ${found.length} words`);
  for (const [index, word] of found.entries()) {
    const mark = marks[index];
    const whole = verseMarks[phrase.first - 1 + index];
    if (mark?.location !== word.start || mark.length !== word.end - word.start)
      faults.push(`${at}: word ${index + 1} marked at ${mark?.location}+${mark?.length}`);
    if (whole?.location !== start + word.start || whole.length !== mark?.length)
      faults.push(`${at}: word ${index + 1} off its verse's mark`);
  }
  return faults;
};

/** What is wrong of one planned verse's phrases: a text not the verse's from its first word, a phrase not planned, or its marks' faults. */
const phraseFaults = (where: string, text: string, verseMarks: readonly WordMark[]) => {
  const faults: string[] = [];
  const verseWords = wordsOf(text);
  for (const phrase of cutOf(text)) {
    const at = `${where} [${phrase.first}-${phrase.last}]`;
    const start = verseWords[phrase.first - 1]?.start ?? -1;
    if (text.slice(start, start + phrase.text.length) !== phrase.text)
      faults.push(`${at}: the phrase's text is not the verse's from its first word`);
    const marks = marksOf(phrase.text);
    if (Option.isNone(marks)) faults.push(`${at}: not planned`);
    else faults.push(...markFaults(at, phrase, start, marks.value, verseMarks));
  }
  return faults;
};

describe('the natural voice over phrases', () => {
  it("plans each phrase's own text whenever its verse's, one mark per word at its UTF-16 run", () => {
    const faults: string[] = [];
    const tally = { phrased: 0, planned: 0, phrases: 0 };
    for (const [where, text] of sampleOf()) {
      const phrases = cutOf(text);
      if (phrases.length === 0) continue;
      tally.phrased += 1;
      const verseMarks = marksOf(text);
      if (Option.isNone(verseMarks)) continue;
      tally.planned += 1;
      tally.phrases += phrases.length;
      faults.push(...phraseFaults(where, text, verseMarks.value));
    }
    expect(faults.slice(0, 8)).toEqual([]);
    expect(tally.planned).toBeGreaterThanOrEqual(500);
    expect(tally.phrases).toBeGreaterThanOrEqual(1500);
  });
});
