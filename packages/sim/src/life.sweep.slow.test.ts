/**
 * The drive's lifecycle over the model (`fixtures/life.ts`), each subject
 * (boot on both platforms and over a stale session, down on a short and a
 * long state and over a dead holder, `down --clean`, a driver step) with a
 * typed failure, an interrupt or an abrupt exit at each of its host calls in
 * turn, until the fault lands past its last call; then every state is
 * downed, booted and downed again. Every server is found by the next `down`
 * and stopped, and every command after the fault ends as the model says.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { sweepPart } from './fixtures/life-cases.ts';
import { type How, SUBJECTS } from './fixtures/life.ts';

const HOWS: ReadonlyArray<How> = ['fail', 'interrupt', 'exit'];

/** Host calls per part of a sweep, and the parts: no subject makes as many as `PART * PARTS` calls. */
const PART = 12;
const PARTS = 3;

describe('a fault at every host call, over the model', () => {
  for (const subject of SUBJECTS)
    for (const how of HOWS) {
      const reached = { end: false };
      for (let part = 0; part < PARTS; part += 1) {
        const from = 1 + part * PART;
        const to = from + PART - 1;
        const last = part === PARTS - 1;
        it.live(
          `${subject.name}, ${how} at host calls ${from}-${to}: every server found and stopped`,
          () =>
            Effect.gen(function* () {
              if (reached.end) return;
              const found = yield* Effect.promise(() => sweepPart(subject, how, from, to));
              reached.end = found.ended;
              expect(found.violations.slice(0, 8)).toEqual([]);
              if (last) expect(found.ended).toBe(true);
            }),
        );
      }
    }
});
