import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { goldenFaults } from './figure-golden-fixture.ts';

describe("the figure measure's pins on the real crops", () => {
  it.effect(
    'hold every case, measured as pinned, and read lean the same less its rims, shading and artifacts',
    () =>
      Effect.gen(function* () {
        expect(yield* goldenFaults('real')).toEqual([]);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
