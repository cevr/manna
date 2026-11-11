/**
 * Commands on a hymn share the status read in flight, an act between them
 * or not (`readDevice` in `player.ts`: one read per Start). A read asked
 * before an act is read again once it answers (`readFresh`), so sharing it
 * shows nothing stale; a second read started beside it lets the two answer
 * out of order. Each case is the start of a 90 s seed of the world
 * (`world.property.slow.test.ts`, which runs them whole) that broke a stall
 * rule within it when an act started a read of its own.
 */

import { describe, expect, it } from 'effect-bun-test';
import { Clock, Effect } from 'effect';
import { TestClock } from 'effect/testing';

import { drawnKnobs, makeWorld, morning, type Platform, rng, roam, step } from '../test/world';
import { Command } from './player';

/** The rules seed `seed` of `platform` broke in its first `ms` of the world, as the seeded sweep draws it. */
const broken = (platform: Platform, seed: number, ms: number) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const r = rng(seed * 7919 + platform.length);
    const w = makeWorld(platform, clock, drawnKnobs(r), yield* Clock.currentTimeMillis);
    w.send(Command.Start({ track: morning }));
    for (let i = 0; i < ms / step; i++) {
      roam(w, r);
      yield* w.tick;
    }
    w.dispose();
    return [...new Set(w.breaches.map((it) => it.rule))];
  });

describe('a read in flight across an act', () => {
  for (const [platform, seed, ms] of [
    ['ios', 668, 15_000],
    ['android', 911, 25_000],
  ] as const)
    it.effect(`${platform} seed ${seed}, its first ${ms / 1000} s, breaks no rule`, () =>
      Effect.gen(function* () {
        expect(yield* broken(platform, seed, ms)).toEqual([]);
      }),
    );
});
