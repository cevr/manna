import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Path } from 'effect';
import { weakeningFlags } from './strength.ts';
import { testDryRun, unitTests } from './units.ts';

describe("a workspace's test script", () => {
  it.effect.layer(BunServices.layer)(
    'every unit-test task of the repo, as turbo resolves the test run, runs its tests at full strength',
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const root = path.join(import.meta.dir, '..', '..', '..', '..');
        const units = unitTests(
          yield* testDryRun(root, path.join(root, 'node_modules', '.bin', 'turbo')),
        );
        expect(new Set(units.map((unit) => unit.workspace)).size).toBeGreaterThan(5);
        const weak = units.flatMap((unit) =>
          weakeningFlags(unit.command).map((why) => `${unit.taskId}: ${why}`),
        );
        expect(weak).toEqual([]);
      }),
  );
});
