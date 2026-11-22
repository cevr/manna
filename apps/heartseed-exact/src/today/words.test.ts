/* oxlint-disable effect/noNullish, effect/noTernary, effect/noNewError, effect/noThrowStatement, effect/noGlobals -- a property test: the generators branch plainly, and a broken rule throws naming its seed and its point as JSON. */

/**
 * The word under a finger (`wordUnder`, over the frames Exact's `frame()`
 * answers) is the current Heartseed's (`wordAt`, over its words' laid-out
 * boxes), for 300 seeded KJV verses, each word laid out in wrapping lines
 * of generated sizes, some not laid out yet (`unavailable`, never a word's),
 * at points on a word, in a gap, between lines, above, below and beside the
 * words, and with no word laid out at all.
 */

import { describe, expect, it } from 'bun:test';
import { readVerses } from '@manna/heartseed/passage';
import { shownWordsOf, wordAt, type Box } from '@manna/heartseed/reading/words';
import { Option } from 'effect';

import { seeded, type Random } from '../test/random';
import { wordUnder, type Frame } from './hold';

const VERSES = 300;
const POINTS = 30;

const framesOf = (random: Random, words: number): readonly Frame[] => {
  const none = random.chance(0.03);
  const width = 150 + random.below(400);
  const height = 14 + random.below(40);
  const gap = random.below(16);
  let x = 0;
  let y = random.below(400);
  return Array.from({ length: words }, () => {
    const w = 8 + random.below(120);
    if (x + w > width && x > 0) {
      x = 0;
      y += height + gap;
    }
    const frame = { x, y, width: w, height, unavailable: none || random.chance(0.05) };
    x += w + random.below(12);
    return frame;
  });
};

const pointNear = (random: Random, frames: readonly Frame[]) => {
  const frame = frames.length > 0 ? random.pick([...frames]) : { x: 0, y: 0, width: 1, height: 1 };
  return random.pick([
    { x: frame.x + random.next() * frame.width, y: frame.y + random.next() * frame.height },
    { x: frame.x + frame.width + random.next() * 10, y: frame.y + frame.height / 2 },
    { x: frame.x, y: frame.y + frame.height + random.next() * 14 },
    { x: -50 + random.next() * 800, y: -100 + random.next() * 1400 },
  ]);
};

describe('the word under a finger', () => {
  it(`is the current app's over ${VERSES} verses`, () => {
    const verses = readVerses();
    let found = 0;
    for (let seed = 1; seed <= VERSES; seed++) {
      const random = seeded(seed);
      const words = shownWordsOf(random.pick(verses).text).length;
      const frames = framesOf(random, words);
      const boxes = new Map<number, Box>(
        frames.flatMap((frame, index) =>
          frame.unavailable
            ? []
            : [
                [
                  index,
                  { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
                ] as const,
              ],
        ),
      );
      for (let n = 0; n < POINTS; n++) {
        const at = pointNear(random, frames);
        const port = Option.getOrNull(wordUnder(at, frames));
        const one = Option.getOrNull(wordAt(at.x, at.y, boxes));
        if (port !== one)
          throw new Error(`seed ${seed} at ${JSON.stringify(at)}: ${port}, the current app ${one}`);
        if (port !== null) found++;
      }
    }
    expect(found).toBeGreaterThan(VERSES * POINTS * 0.9);
  });
});
