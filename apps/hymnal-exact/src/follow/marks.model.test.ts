/* oxlint-disable effect/noTernary, effect/noNullish, effect/noNewError, effect/noThrowStatement -- a Bun test over the current app's decoded chords and timing as plain values; a broken rule throws naming its seed. */

/**
 * The page the follow marks is the current app's: for all 695 hymns each
 * part's first line stands where the current `firstLines` puts it, each
 * line's place among the sung lines is its part's first plus its own, a line
 * is drawn by syllables exactly where the current page draws a
 * `SyllableLine`, and each word's first syllable is where the current
 * `wordStarts` puts it. Then, over hymns and places drawn from the current
 * app's bundled timing (words and syllables kept, read at run time) under
 * generated stanza choices, the line and syllable the current follower
 * marks (`followerOf`, paused at the place) is a line of the page by that
 * place, and its syllable one of that line's: the mark lands on the page.
 */

import { describe, expect, test } from 'bun:test';
import { followerOf } from '@manna/hymnal-app/follow/follower';
import { WHOLE } from '@manna/hymnal-app/follow/marks';
import { timelineOf } from '@manna/hymnal-app/follow/timeline';
import { sectionsOf } from '@manna/hymnal-app/hymns/chords';
import { firstLines, wordStarts } from '@manna/hymnal-app/reader/sung-lines';
import { readTiming } from '@manna/hymnal-app/vite/timing';

import { currentBook, encoded } from '../chords/shipped.testing.ts';
import { book } from '../hymns/book.testing.ts';
import type { PageLine } from '../hymn/page.ts';
import { hymnSources } from '../hymn/sources.ts';
import { below, pick, seeded } from '../test/random.ts';
import { sungOf } from './marks.ts';

const { hymnPage } = hymnSources(book, encoded);
const timing = new Map(readTiming());

/** 1 when `mark` is a syllable of `line`, 0 for a line lit whole or a rest; a syllable the line does not draw throws. */
const syllableOn = (line: PageLine, mark: number, hymn: number, at: number): number => {
  if (mark < 0 || mark === WHOLE) return 0;
  const count = line.words.reduce((sum, word) => sum + word.syllables.length, 0);
  if (!line.timed || mark >= count)
    throw new Error(`seed 7, hymn ${hymn}: syllable ${mark} of line ${at} not drawn`);
  return 1;
};

describe('the page the follow marks', () => {
  test('stands each line and syllable where the current page does', () => {
    expect(book.hymns.length).toBe(695);
    let timed = 0;
    for (const hymn of book.hymns) {
      const page = hymnPage([`${hymn.number}`]);
      const chords = currentBook.of(hymn.number);
      const sections = chords._tag === 'Some' ? sectionsOf(hymn, chords.value) : [];
      const firsts = firstLines(hymn.sections);
      page.parts.forEach((part, k) => {
        expect(part.first).toBe(firsts[k] ?? -1);
        const split = sections[k];
        part.lines.forEach((line, l) => {
          expect(line.at).toBe(part.first + l);
          expect(line.timed).toBe(split?._tag === 'Syllables');
          if (split?._tag !== 'Syllables') return;
          timed += 1;
          const words = split.lines[l] ?? [];
          const starts = wordStarts(words).filter((_, w) => (words[w]?.length ?? 0) > 0);
          expect(line.words.map((word) => word.start)).toEqual([...starts]);
        });
      });
    }
    expect(timed).toBeGreaterThan(1000);
  });

  test('takes the current follower’s mark at every place of generated hymns and choices', () => {
    const random = seeded(7);
    const hymns = book.hymns.filter((hymn) => timing.has(hymn.number));
    let syllables = 0;
    for (let n = 0; n < 150; n += 1) {
      const hymn = pick(random, hymns);
      const decoded = timelineOf(timing.get(hymn.number) ?? '');
      if (decoded._tag === 'None') continue;
      const stanzas = hymn.sections.filter((section) => section.kind === 'stanza').length;
      const choice = random() < 0.5 ? [] : [1 + below(random, Math.max(1, stanzas))];
      const sung = sungOf(decoded.value, hymn.sections, choice);
      const page = hymnPage([`${hymn.number}`]);
      const lines = page.parts.flatMap((part) => part.lines);
      let now = 0;
      const follower = followerOf(sung, {
        now: () => now,
        wake: () => () => {},
        scrollTo: () => {},
        log: () => {},
      });
      for (let p = 0; p < 6; p += 1) {
        now += 1;
        const at = sung.first + below(random, Math.max(1, sung.end - sung.first));
        follower.report({ _tag: 'Here', at, state: 'paused' });
        const marked = follower.marks.line();
        if (marked < 0) continue;
        const line = lines.find((each) => each.at === marked);
        if (line === undefined)
          throw new Error(`seed 7, hymn ${hymn.number}: line ${marked} not on the page`);
        syllables += syllableOn(line, follower.marks.markOf(marked), hymn.number, marked);
      }
    }
    expect(syllables).toBeGreaterThan(100);
  });
});
