import { describe, expect, test } from 'bun:test';

import {
  MAN_HEAD_LIMIT,
  MAN_LEAN_LIMIT,
  WOMAN_HEAD_LIMIT,
  WOMAN_LEAN_LIMIT,
  manNumbersOf,
  womanNumbersOf,
} from './table.ts';

const NODS = [8.1, 11.38];

const TIMES = Array.from({ length: Math.ceil(30.4 * 120) }, (_, i) => i / 120);

type Numbers = { lean: number; neck: number; head: number };
const turnOf = (n: Numbers) => n.neck + n.head;

describe('the man at the feast table', () => {
  const numbers = manNumbersOf(NODS);
  const idle = manNumbersOf([]);

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

describe('the woman at the feast table', () => {
  const numbers = womanNumbersOf(NODS);
  const idle = womanNumbersOf([]);

  test('her head part turns no more than her veil draws clean at', () => {
    const most = Math.max(...TIMES.map((t) => Math.abs(turnOf(numbers(t)))));
    expect(most).toBeLessThanOrEqual(WOMAN_HEAD_LIMIT);
    expect(most).toBeGreaterThan(2);
  });

  test('her lean stays inside the lean her hip cut draws clean at', () => {
    const most = Math.max(...TIMES.map((t) => Math.abs(numbers(t).lean)));
    expect(most).toBeLessThanOrEqual(WOMAN_LEAN_LIMIT);
  });

  test('each turn inclines her head toward the lead, picture-left of her, counter-clockwise on screen, past her idle', () => {
    for (const at of NODS) {
      const peak = at + 0.46;
      expect(turnOf(numbers(peak)) - turnOf(idle(peak))).toBeLessThan(-1.2);
    }
  });

  test('her idle runs on its own seed, apart from the man', () => {
    const differ = TIMES.some((t) => womanNumbersOf([])(t).lean !== manNumbersOf([])(t).lean);
    expect(differ).toBe(true);
  });
});
