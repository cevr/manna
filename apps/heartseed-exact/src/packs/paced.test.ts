/* oxlint-disable effect/noAsyncFunction -- a test of steps run a turn each: the pause it hands `inTurns` is a Promise. */

/**
 * Work in steps: `sumPaced` is the shared `sumOf` over the texts joined by
 * a newline, whatever their sizes and wherever a step ends, and a step
 * hashes no more than `SLICE` code units; `inTurns` pauses between every
 * two steps and answers what `atOnce` answers.
 */

import { describe, expect, it } from 'bun:test';

import { seeded } from '../test/random';
import { sumOf } from '../text/sum';
import { atOnce, inTurns, SLICE, sumPaced, type Paced } from './paced';

/** Made-up texts around a step's edge: empty ones, short ones, and some longer than a step. */
const textsOf = (seed: number) => {
  const random = seeded(seed);
  const sizes = [0, 1, 7, SLICE - 1, SLICE, SLICE + 1, 2 * SLICE + 3];
  return Array.from({ length: random.below(8) }, () =>
    String.fromCharCode(32 + random.below(500)).repeat(random.pick(sizes)),
  );
};

/** How many steps `paced` takes to its end. */
const stepsOf = <T>(paced: Paced<T>) => {
  let steps = 1;
  while (paced.next().done !== true) steps++;
  return steps;
};

describe('work in steps', () => {
  it('sumPaced is sumOf over the texts joined by a newline, a step per SLICE code units', () => {
    for (let seed = 0; seed < 60; seed++) {
      const texts = textsOf(seed);
      const joined = texts.join('\n');
      expect(atOnce(sumPaced(texts))).toBe(sumOf(joined));
      const hashed = texts.reduce((total, text) => total + text.length, 0);
      expect(stepsOf(sumPaced(texts))).toBe(Math.max(1, Math.ceil(hashed / SLICE)));
    }
  });

  it('inTurns pauses between every two steps and answers what atOnce does', async () => {
    const texts = [`${'a'.repeat(3 * SLICE)}`, 'b'];
    let pauses = 0;
    const sum = await inTurns(sumPaced(texts), async () => {
      pauses++;
    });
    expect(sum).toBe(atOnce(sumPaced(texts)));
    expect(pauses).toBe(stepsOf(sumPaced(texts)) - 1);
  });
});
