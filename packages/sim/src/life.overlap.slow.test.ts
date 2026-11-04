/**
 * The drive's lifecycle over the model (`fixtures/life.ts`) with commands
 * that overlap (`fixtures/life-cases.ts`): the pairs at once (`down‖down`,
 * `boot‖boot`, `boot‖down` from none and from a live session, `down‖tap`,
 * and two downs or boots over a dead holder), a newer boot, down or tap run
 * to its end at each host call of a boot and of a down, and generated
 * sequences of 6-11 steps mixing commands, faults, overlaps, crashes and pid
 * reuse. Of two boots or two downs of one state at most one is ok, no two
 * commands signal one process, and every server is found by the next
 * `down`.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { generatedSequences, newerOf, PAIRS, pauseSweep } from './fixtures/life-cases.ts';
import { SUBJECTS } from './fixtures/life.ts';

const PAUSED = ['boot web', 'down web, long state', 'down over a dead holder'];

/** Generated sequences per test, and the tests. */
const PER = 10;
const PARTS = 6;

describe('overlapping commands over the model', () => {
  for (const one of PAIRS)
    it.live(one.name, () =>
      Effect.gen(function* () {
        const seen = yield* Effect.promise(one.run);
        expect(seen.observed).toEqual(one.expected);
        expect(seen.violations).toEqual([]);
      }),
    );

  for (const subject of SUBJECTS.filter((one) => PAUSED.includes(one.name)))
    for (const newer of newerOf(subject.cmd.s))
      it.live(
        `${subject.name}, a newer ${newer.kind} at each host call: every server found, none signalled twice`,
        () =>
          Effect.gen(function* () {
            const found = yield* Effect.promise(() => pauseSweep(subject, newer));
            expect(found.violations.slice(0, 8)).toEqual([]);
            expect(found.ended).toBe(true);
            expect(found.worlds).toBeGreaterThan(8);
          }),
      );

  for (let part = 0; part < PARTS; part += 1) {
    const from = 1 + part * PER;
    it.live(`generated sequences ${from}-${from + PER - 1}: no violation`, () =>
      Effect.gen(function* () {
        const violations = yield* Effect.promise(() => generatedSequences(from, from + PER));
        expect(violations.slice(0, 8)).toEqual([]);
      }),
    );
  }
});
