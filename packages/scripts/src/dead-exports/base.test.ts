import { describe, expect, test } from 'bun:test';

import { debtLines } from './base.ts';

/** A seeded generator of numbers in [0, 1). */
const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const NAMES = ['IDENTITY', 'dyePixel', 'Each', 'unlocatable', 'x#y'];
const REASONS = ['# film lane, recorded', '#', '## a heading', '# packages/film/src/a.ts gone'];
const ENDS = ['', '\n'];

describe("the debt file's lines", () => {
  test('over 300 generated debt texts, the lines are exactly the debt lines in order, never a # line or a blank one', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed);
      const drawn = Array.from({ length: Math.floor(next() * 10) }, (_, i) => {
        const kind = Math.floor(next() * 3);
        if (kind === 0) return { line: REASONS[i % REASONS.length] ?? '#', debt: false };
        if (kind === 1) return { line: '', debt: false };
        return { line: `packages/p${i}/src/m.ts ${NAMES[i % NAMES.length] ?? 'x'}`, debt: true };
      });
      const text = drawn.map(({ line }) => line).join('\n') + (ENDS[Math.floor(next() * 2)] ?? '');
      expect({ seed, lines: debtLines(text) }).toEqual({
        seed,
        lines: drawn.filter(({ debt }) => debt).map(({ line }) => line),
      });
    }
  });
});
