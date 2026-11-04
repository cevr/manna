/**
 * The drive's lifecycle over the model (`fixtures/life.ts`) with a second
 * fault inside the recovery of a first: a boot (both platforms) or a down
 * (both platforms) fails or is interrupted at every other host call, and
 * then a typed failure or an abrupt exit lands at each call its recovery
 * makes, until the second lands past it. A failed record write whose stop
 * fails once is stopped again, and every server is found by the next
 * `down` and stopped.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { recoveryPart } from './fixtures/life-cases.ts';
import { SUBJECTS } from './fixtures/life.ts';

const NAMES = ['boot ios', 'boot web', 'down ios', 'down web, long state'];
const FIRSTS = ['fail', 'interrupt'] as const;
const SECONDS = ['fail', 'exit'] as const;

/** The first fault's host calls: every other one, up to past each subject's last. */
const CALLS = Array.from({ length: 12 }, (_, at) => 1 + at * 2);
/** First-fault calls per test. */
const PER = 2;

describe('a fault inside the recovery of a fault, over the model', () => {
  for (const subject of SUBJECTS.filter((one) => NAMES.includes(one.name)))
    for (const first of FIRSTS)
      for (const second of SECONDS)
        for (let part = 0; part * PER < CALLS.length; part += 1) {
          const calls = CALLS.slice(part * PER, part * PER + PER);
          it.live(
            `${subject.name}: ${first} at host call ${calls.join(', ')}, then ${second} at each recovery call`,
            () =>
              Effect.gen(function* () {
                const violations = yield* Effect.promise(() =>
                  recoveryPart(subject, first, second, calls),
                );
                expect(violations.slice(0, 8)).toEqual([]);
              }),
          );
        }
});
