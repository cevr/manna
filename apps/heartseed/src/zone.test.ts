/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noAsyncFunction, effect/noNewPromise, eslint/no-await-in-loop -- the levels are a plain list whose end is an absent head; a level's work throws on purpose to show `inZone` restores through a throw; each run spans awaits as a walk's travel does, and the runs share the host's zone, so they run one after another. */

/**
 * The tests' zone helpers (`test/zone.ts`) over generated runs: `inZone`
 * nested one to three deep over `ZONES`, each level's work returning or
 * throwing, then `travel` and `restore(hostZone())` pairs with an `await`
 * between. Inside each level the host reads the innermost zone, and after
 * each run it reads UTC, the zone bun test starts in, at a January and a
 * July instant. The oracle is `Intl` (`offsetIn`), never the app's day code.
 */

import { describe, expect, it } from 'bun:test';
import { Data } from 'effect';

import { hostOffset, hostZone, inZone, offsetIn, restore, travel, ZONES } from './test/zone';

const RUNS = 200;

const JANUARY = Date.UTC(2026, 0, 15, 12);
const JULY = Date.UTC(2026, 6, 15, 12);

/** A seeded generator of numbers in [0, 1). */
const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const below = (next: () => number, n: number) => Math.floor(next() * n);

const zoneOf = (next: () => number) => ZONES[below(next, ZONES.length)] ?? 'UTC';

/** The error a level's work throws on purpose. */
class Planted extends Data.TaggedError('Planted')<{ readonly zone: string }> {}

type Level = { readonly zone: string; readonly throws: boolean };

/** The instants a level is read at: January, July, and one drawn across 1970-2100. */
const instantsOf = (next: () => number) => [
  JANUARY,
  JULY,
  Math.floor(next() * Date.UTC(2100, 0, 1)),
];

/** Runs `levels` nested through `inZone`, holding the host to each level's zone before and after the level inside it. */
const nest = (levels: ReadonlyArray<Level>, ats: ReadonlyArray<number>): void => {
  const [level, ...inner] = levels;
  if (level === undefined) return;
  inZone(level.zone, () => {
    const reads = () => ats.map((at) => [hostOffset(at), offsetIn(level.zone, at)]);
    expect(reads().map(([host]) => host)).toEqual(reads().map(([, zone]) => zone));
    if (inner.some((each) => each.throws)) {
      expect(() => nest(inner, ats)).toThrow(Planted);
    } else {
      nest(inner, ats);
    }
    expect(reads().map(([host]) => host)).toEqual(reads().map(([, zone]) => zone));
    if (level.throws) throw new Planted({ zone: level.zone });
  });
};

/** One run: nested levels, then `travel` and `restore(hostZone())` pairs with an `await` between. */
const runOnce = async (seed: number) => {
  const next = random(seed);
  const levels = Array.from({ length: 1 + below(next, 3) }, () => ({
    zone: zoneOf(next),
    throws: next() < 0.3,
  }));
  const ats = instantsOf(next);
  if (levels.some((each) => each.throws)) {
    expect(() => nest(levels, ats)).toThrow(Planted);
  } else {
    nest(levels, ats);
  }
  for (const _ of Array.from({ length: below(next, 3) })) {
    const zone = zoneOf(next);
    const before = hostZone();
    travel(zone);
    await Promise.resolve();
    expect(ats.map(hostOffset)).toEqual(ats.map((at) => offsetIn(zone, at)));
    restore(before);
  }
  return [hostOffset(JANUARY), hostOffset(JULY)];
};

describe('the tests’ zones', () => {
  it(`puts the host back in UTC after nested inZone levels, returning or throwing, and travel and restore pairs across an await, each level reading its own zone, over ${RUNS} generated runs`, async () => {
    const ends = [];
    for (const seed of Array.from({ length: RUNS }, (_, i) => i + 1)) {
      ends.push([seed, ...(await runOnce(seed))]);
    }
    expect(ends.filter(([, january, july]) => january !== 0 || july !== 0).slice(0, 3)).toEqual([]);
  });
});
