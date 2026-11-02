import { describe, expect, test } from 'bun:test';

import { MAN_HEAD_LIMIT, MAN_LEAN_LIMIT, manNumbersOf } from './table.ts';

/** In Its Order's cold cues the man nods on, scene s: `turn` and `read`. */
const NODS = [8.1, 11.38];

/** Every 1/120 s over the cold open's 30.4 s. */
const TIMES = Array.from({ length: Math.ceil(30.4 * 120) }, (_, i) => i / 120);

describe('the man at the feast table', () => {
  const numbers = manNumbersOf(NODS);
  const idle = manNumbersOf([]);
  const turnOf = (n: ReturnType<typeof numbers>) => n.neck + n.head;

  test('his head part turns no more than his collar draws clean at', () => {
    const most = Math.max(...TIMES.map((t) => Math.abs(turnOf(numbers(t)))));
    expect(most).toBeLessThanOrEqual(MAN_HEAD_LIMIT);
    expect(most).toBeGreaterThan(2);
  });

  test('his lean stays inside the lean his hip cut draws clean at', () => {
    const most = Math.max(...TIMES.map((t) => Math.abs(numbers(t).lean)));
    expect(most).toBeLessThanOrEqual(MAN_LEAN_LIMIT);
  });

  test('each nod inclines his head toward the lead, clockwise on screen, past his idle', () => {
    for (const at of NODS) {
      const peak = at + 0.46;
      expect(turnOf(numbers(peak)) - turnOf(idle(peak))).toBeGreaterThan(1.2);
    }
  });
});
