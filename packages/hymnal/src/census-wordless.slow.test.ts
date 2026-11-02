/* oxlint-disable effect/noGlobals -- the check prints its counts of lines and misses with console.log. */

/**
 * Acceptance (checkbulk S4 (3), census2 F2): a census line prints no word
 * that stands inside a quoted span, however the spans nest (`wordlessLine`).
 *
 * Generated property over its whole domain as written: every line made of
 * plain words and quoted spans, straight ("…") or curly (“…”), nested up to
 * three deep (a curly span inside either kind; a straight one only where no
 * straight span is open around it, as a straight inside a straight cannot
 * be read), with
 * any words between. Synthetic words only: `q<n>x` stands inside a span and
 * never prints; `p<n>x` stands outside every span and always prints. No
 * hymn text is read.
 */

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { wordlessLine } from '../scripts/census.js';

/** mulberry32: the same lines on every run. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Style = 'straight' | 'curly';
const OPEN: Record<Style, string> = { straight: '"', curly: '“' };
const CLOSE: Record<Style, string> = { straight: '"', curly: '”' };

const lineOf = (random: () => number) => {
  let n = 0;
  const word = (kind: 'p' | 'q') => `${kind}${(n += 1)}x`;
  const pick = <A>(all: ReadonlyArray<A>): A => all[Math.floor(random() * all.length)] as A;
  /** `straight`: a straight span is open around this one, so no straight span opens inside it. */
  const span = (style: Style, depth: number, straight = false): string => {
    const parts: string[] = [];
    const count = 1 + Math.floor(random() * 4);
    const within = straight || style === 'straight';
    for (let i = 0; i < count; i++) {
      if (depth < 3 && random() < 0.35) {
        const inner: ReadonlyArray<Style> = within ? ['curly'] : ['curly', 'straight'];
        parts.push(span(pick(inner), depth + 1, within));
      } else parts.push(word('q'));
    }
    const glue = pick([' ', ', ', ' — ']);
    return `${OPEN[style]}${parts.join(glue)}${CLOSE[style]}`;
  };
  const parts: string[] = [];
  const count = 1 + Math.floor(random() * 5);
  for (let i = 0; i < count; i++)
    parts.push(random() < 0.5 ? span(pick<Style>(['straight', 'curly']), 1) : word('p'));
  return parts.join(pick([' ', ': ', '; ']));
};

describe('wordlessLine', () => {
  it.effect('prints no word inside any quoted span, nested or not, and every word outside', () =>
    Effect.sync(() => {
      const random = seeded(20261102);
      const misses: string[] = [];
      let nested = 0;
      const LINES = 2000;
      for (let k = 0; k < LINES; k++) {
        const line = lineOf(random);
        if (/["“][^"”]*[“"][^"”]*[”"]/u.test(line)) nested += 1;
        const out = wordlessLine(line);
        const leaked = out.match(/\bq\d+x\b/g) ?? [];
        const kept = (line.match(/\bp\d+x\b/g) ?? []).filter((word) => !out.includes(word));
        if (leaked.length > 0 || kept.length > 0)
          misses.push(`${line} => ${out} (leaked ${leaked.join(',')}; lost ${kept.join(',')})`);
      }
      console.log(
        `wordless: ${misses.length} of ${LINES} lines miss (${nested} hold a nested span)`,
      );
      expect({ misses: misses.length, first: misses.slice(0, 3) }).toEqual({
        misses: 0,
        first: [],
      });
      expect(nested).toBeGreaterThan(200);
    }),
  );
});
