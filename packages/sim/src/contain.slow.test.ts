/**
 * The contained host's whole domain (`fixtures/contain.ts`), one test per
 * command on both platforms: a link of every kind planted at every
 * component below a root of every path the command names, the links the
 * prebuild and the build make as they run, and the five liveness layouts.
 * No host call leaves its roots, every refusal is typed, every layout ends
 * as the plain one, and the install commands reach the four census
 * triggers between them.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { commandNames, runDomain } from './fixtures/contain.ts';

const KINDS = ['out', 'dangling', 'relative', 'chain', 'alias', 'cross'] as const;
const reached = new Set<string>();

describe('the contained host over every host call', () => {
  it.effect('runs every command on the five liveness layouts: 245 cases', () =>
    Effect.sync(() => expect(commandNames.length * 5).toBe(245)),
  );

  for (const name of commandNames)
    it.live(`${name}: every call, tool argument and tree stays inside its roots`, () =>
      Effect.gen(function* () {
        const found = yield* Effect.promise(() =>
          runDomain({
            kinds: KINDS,
            commands: (each) => each === name,
            liveness: () => true,
            plants: () => true,
          }),
        );
        for (const trigger of found.triggers) reached.add(trigger);
        expect(found.violations.slice(0, 12)).toEqual([]);
        expect(found.untyped.slice(0, 12)).toEqual([]);
        expect(found.liveness).toEqual([]);
        expect(found.livenessCases).toBe(5);
      }),
    );

  it.effect('reaches the four census triggers', () =>
    Effect.sync(() =>
      expect([...reached].toSorted()).toEqual(['build-log', 'dd-build', 'deep-dd', 'native-path']),
    ),
  );
});
