/* oxlint-disable effect/noNullish -- a property test over plain offsets. */

/**
 * The hold, as a property over the Bible's shapes: for generated verses
 * (1 to 90 words of 1 to 18 letters, numbers 1 to 176) and every verse of
 * three real chapters (read by offsets only), every offset the chapter
 * hands for a selection inside a word names that word; an offset on a
 * space names the word before it; an offset outside the words (the
 * verse's number, past the end) names none; the sheet the hold opens is
 * Words on that verse; and the verses chosen are unchanged.
 */

import { expect, it } from 'bun:test';

import { navLaunch, select } from '../read/nav';
import { wordsRead } from '../study/read';
import { shownWords } from '../study/words';
import { seeded } from '../test/random';
import { textOf } from '../text/text';
import { holdOffset, holdPrefix, holdWord, isHold, type Span } from './hold';
import { placeKey, wordIndexOf } from './sheet';
import { sheetOn, studyStep, type StudyState } from './step';

/** Every offset of the drawn text (`<verse> ` then the words), with the word the hold must name. */
const expectations = (verse: number, spans: ReadonlyArray<Span>) => {
  const prefix = holdPrefix(verse);
  const end = spans.at(-1)?.end ?? 0;
  const out: Array<readonly [number, number]> = [];
  for (let drawn = 0; drawn < prefix + end + 3; drawn++) {
    const at = drawn - prefix;
    let want = -1;
    if (at >= 0 && at < end) want = spans.findLastIndex((span) => span.start <= at);
    out.push([drawn, want]);
  }
  return out;
};

const check = (verse: number, spans: ReadonlyArray<Span>) => {
  for (const [drawn, want] of expectations(verse, spans)) {
    const got = holdWord(spans, holdOffset(verse, drawn));
    expect([verse, drawn, got]).toEqual([verse, drawn, want]);
  }
};

it('names the word under every offset of 500 generated verses', () => {
  const random = seeded(7);
  for (let run = 0; run < 500; run++) {
    const verse = 1 + random.below(176);
    const text = Array.from({ length: 1 + random.below(90) }, () =>
      'a'.repeat(1 + random.below(18)),
    ).join(' ');
    check(verse, shownWords(text));
  }
});

it('names the word under every offset of every verse of three real chapters', () => {
  for (const [book, chapter] of [
    [43, 3],
    [19, 119],
    [17, 8],
  ] as const)
    for (const shown of textOf({ book, chapter, first: 1, last: 999 }).verses)
      check(shown.verse, wordsRead(undefined, book, chapter, shown.verse).words);
});

it('a hold opens Words on its verse with that word, and leaves the verses chosen', () => {
  const random = seeded(11);
  for (let run = 0; run < 200; run++) {
    const verse = 1 + random.below(36);
    const words = wordsRead(undefined, 43, 3, verse);
    if (words.words.length === 0) continue;
    const start = random.below(holdPrefix(verse) + (words.words.at(-1)?.end ?? 0) + 2);
    const chosen = random.below(36);
    const state: StudyState = {
      nav: select(navLaunch().nav, 'read'),
      book: 43,
      chapter: 3,
      word: '',
      unfolded: [],
      backs: '',
      row: -1,
      held: false,
      holds: 0,
      first: chosen,
      last: chosen,
    };
    const after = studyStep(state, { _tag: 'select', verse, start, text: 'word' });
    expect(sheetOn(after.nav)).toMatchObject({ book: 43, chapter: 3, verse, tab: 'words' });
    expect([after.first, after.last]).toEqual([chosen, chosen]);
    expect(after.held).toBe(true);
    expect(wordIndexOf(after.word, placeKey(43, 3, verse), verse, words)).toBe(
      holdWord(words.words, start - holdPrefix(verse)),
    );
  }
});

it('takes one word as a hold, and neither nothing nor a drag across words', () => {
  expect([isHold('loved'), isHold(''), isHold('so loved'), isHold('a\tb')]).toEqual([
    true,
    false,
    false,
    false,
  ]);
});
