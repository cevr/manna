// Fixture for film/no-lazy-test-fixture over a runtime made where the file
// loads: `ManagedRuntime.make(layer)` builds its layer on the first run, so
// the first case that runs on it pays the layer's build inside its own time
// limit. Each line marked RED fires the rule, and nothing else does.

import { Effect, Layer, ManagedRuntime } from 'effect';
import * as Runtimes from 'effect/ManagedRuntime';
import { describe, it } from 'effect-bun-test';

declare const scratch: Layer.Layer<never>;

export const runtime = ManagedRuntime.make(scratch); // RED film/no-lazy-test-fixture
export const moduleRuntime = Runtimes.make(scratch); // RED film/no-lazy-test-fixture

describe('a group', () => {
  const shared = ManagedRuntime.make(scratch); // RED film/no-lazy-test-fixture
  it.effect('runs on it', () => Effect.promise(() => shared.runPromise(Effect.void)));
});

it.effect('makes its own', () =>
  Effect.promise(() => ManagedRuntime.make(scratch).runPromise(Effect.void)),
);

export const helper = () => ManagedRuntime.make(scratch);
