import { describe, expect, test } from 'bun:test';

import { ARM_LIMIT, HEAD_LIMIT, numbersOf } from './lead.ts';

/** In Its Order's cold cues, scene s: the raise from `bottle`, its landing on k6, then `turn`, `smile` and `read`. */
const CUES = { raise: 6.9, landed: 7.233, turn: 8.1, smile: 9.38, read: 11.38 };

/** Every 1/120 s over the cold open's 30.4 s. */
const TIMES = Array.from({ length: Math.ceil(30.4 * 120) }, (_, i) => i / 120);

describe('the lead at the feast table', () => {
  const numbers = numbersOf(CUES);

  test('his head part turns no more than his collar draws clean at', () => {
    const turn = Math.max(...TIMES.map((t) => Math.abs(numbers(t).neck + numbers(t).head)));
    expect(turn).toBeLessThanOrEqual(HEAD_LIMIT);
    expect(turn).toBeGreaterThan(1);
  });

  test('his bottle arm keeps every bone within its cuff limit', () => {
    for (const bone of ['shoulderRight', 'elbowRight', 'wristRight'] as const) {
      const most = Math.max(...TIMES.map((t) => Math.abs(numbers(t)[bone])));
      expect(most).toBeLessThanOrEqual(ARM_LIMIT);
    }
  });
});
