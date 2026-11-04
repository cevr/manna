/**
 * The live `Os.spawn` under `boot`, then `down`, over a model host
 * (`fixtures/spawning.ts`), with a typed failure or an interruption at each
 * step of the start: the spawner's start, the read of the new process's
 * start time, the line that names it, the read of the start's output, the
 * answer, and the child becoming the server. After the boot, every model
 * process that runs is named by its state's record; after the down, none
 * runs; no signal names a process the model did not start, and no failure
 * is untyped. A boot the fault reached fails (typed, or interrupted), and
 * the down after a failed boot finds no session.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';

import { bootThenDown, STEPS } from './fixtures/spawning.ts';

describe('the live start over a model host, a fault at each step', () => {
  it.live('with no fault, the boot records its server and the down stops it', () =>
    Effect.gen(function* () {
      const seen = yield* bootThenDown(Option.none());
      expect(seen).toEqual({
        boot: 'ok',
        down: 'ok',
        reached: false,
        unrecorded: [],
        left: [],
        strays: [],
      });
    }),
  );
  for (const step of STEPS)
    for (const how of ['fail', 'interrupt'] as const)
      it.live(`${how} at ${step}: nothing runs unrecorded, and the down leaves nothing`, () =>
        Effect.gen(function* () {
          const seen = yield* bootThenDown(Option.some({ step, how }));
          expect(seen.reached).toBe(true);
          expect(seen.unrecorded).toEqual([]);
          expect(seen.left).toEqual([]);
          expect(seen.strays).toEqual([]);
          expect(seen.boot).not.toMatch(/^died/);
          expect(seen.down).not.toMatch(/^died/);
          if (how === 'interrupt') expect(seen.boot).toBe('interrupted');
          else expect(seen.boot).not.toBe('ok');
          if (seen.boot !== 'ok') expect(seen.down).toBe('NoSession');
        }),
      );
});
