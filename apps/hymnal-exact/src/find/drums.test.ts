/**
 * The drums over their whole domain: for every hymn's number, every drum
 * and every turn from −20 to 20, the port's number and digits after the
 * turn are the current app's `turn` and `digitsOf`. All of them, not a
 * sample.
 */

import { describe, expect, test } from 'bun:test';

import { DRUM_ORDER, digitsOf, LAST, turn } from '@manna/hymnal-app/player/drums';

import { initial, step, view } from './step.ts';

describe('the drums are the current app’s', () => {
  test('every number, every drum, every turn of −20…20', () => {
    const wrong: Array<unknown> = [];
    let checked = 0;
    for (let number = 1; number <= LAST; number++) {
      const opened = step(initial, { kind: 'drumsOpen', bar: number });
      const at = view(opened);
      const digits = digitsOf(number);
      if (
        at.number !== number ||
        at.hundreds !== digits.hundreds ||
        at.tens !== digits.tens ||
        at.ones !== digits.ones
      )
        wrong.push({ number, at });
      for (const drum of DRUM_ORDER)
        for (let n = -20; n <= 20; n++) {
          const shown = view(step(opened, { kind: 'turn', drum, n }));
          const want = turn(number, drum, n);
          const d = digitsOf(want);
          checked += 1;
          if (
            shown.number !== want ||
            shown.hundreds !== d.hundreds ||
            shown.tens !== d.tens ||
            shown.ones !== d.ones
          )
            wrong.push({ number, drum, n, shown: shown.number, want });
        }
    }
    expect(wrong).toEqual([]);
    expect(checked).toBe(695 * 3 * 41);
  });
});
