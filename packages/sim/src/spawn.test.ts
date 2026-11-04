/**
 * The live `Os.spawn` under `boot`, over a model host
 * (`fixtures/spawning.ts`), on the review's case: the read of the new
 * process's start time fails typed. The boot fails typed and leaves nothing
 * running, so the `down` after it finds no session and has nothing to stop.
 * Every other step of the start, failed or interrupted, is in
 * `spawn.slow.test.ts`.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';

import { bootThenDown } from './fixtures/spawning.ts';

describe('the live start over a model host', () => {
  it.live(
    'a boot whose read of its new server start time fails leaves nothing running unrecorded',
    () =>
      Effect.gen(function* () {
        const seen = yield* bootThenDown(Option.some({ step: 'read', how: 'fail' }));
        expect(seen).toEqual({
          boot: 'ToolFailed',
          down: 'NoSession',
          reached: true,
          unrecorded: [],
          left: [],
          strays: [],
          bootSignals: [],
        });
      }),
  );
});
