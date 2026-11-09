/* oxlint-disable effect/noTernary, effect/noGlobals -- a drawn case's branches are plain, and each property compares a drawn value with its oracle's as JSON text to name the first that differ. */

/**
 * The seed search's pure parts (`seed-search.ts`), with no process: the
 * seed parameter found by name in generated function sources, the pin of a
 * single seed and of a window, the part's files read from its script, the
 * walks its files import, the search over a fake runner, and the decision
 * of which call to pin.
 *
 * It catches a pin that passes the committed seed through or pins only a
 * window's first entry, a search that runs a seed twice or more than its
 * jobs at once, and a decision that pins when no call took a seed. It
 * misses the processes themselves: `bun run seeds` runs them.
 */

import { describe, expect, it, test } from 'effect-bun-test';
import { Effect, Option } from 'effect';

import {
  type Call,
  callsIn,
  decide,
  partOf,
  pinned,
  pinnedText,
  searchWith,
  seedParam,
  walksOf,
} from './seed-search.ts';

/** A small seeded generator (mulberry32), so each run draws the same values. */
const random = (seed: number) => {
  let state = seed;
  return (below: number) => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296) * below);
  };
};

type Draw = (below: number) => number;

const pick = <A>(draw: Draw, from: ReadonlyArray<A>): A => from[draw(from.length)] as A;

const NAMES = ['seed', 'seeds', 'seedOf', 'reseed', 'seedsAt', 'steps', 'devices', 'n', 'seed2'];
const DEFAULTS = [
  '6',
  "'read'",
  'f(1, 2)',
  '[1, 2]',
  "{ a: 1, b: 'x,y' }",
  '(a, b) => a + b',
  '`a,${b}`',
];
const DESTRUCTURED = ['{ seed, steps }', '{ seeds = [1, 2] }', '[seed, n]', '{ a: seed }'];

/** One drawn parameter: its text, and the kind it is the seed's by (none unless a plain `seed` or `seeds`). */
const param = (draw: Draw) => {
  const form = pick(draw, ['plain', 'default', 'destructured', 'rest'] as const);
  if (form === 'destructured') return { text: pick(draw, DESTRUCTURED), kind: 'none', form };
  const name = pick(draw, NAMES);
  if (form === 'rest') return { text: `...${name}`, kind: 'none', form };
  const kind = ['seed', 'seeds'].includes(name) ? name : 'none';
  if (form === 'default') return { text: `${name} = ${pick(draw, DEFAULTS)}`, kind, form };
  return { text: name, kind, form };
};

/** One drawn function source and the seed parameter it holds, if any. */
const source = (draw: Draw) => {
  const drawn = Array.from({ length: draw(5) }, () => param(draw));
  const body = '{ return seed(1, 2), [steps]; }';
  const only = drawn[0];
  const bare = only?.form === 'plain' && draw(3) === 0;
  const params = bare ? [only] : drawn;
  const list = params.map((each) => each.text).join(', ');
  const text = bare
    ? `${only.text} => ${body}`
    : pick(draw, [
        `(${list}) => ${body}`,
        `async (${list}) => ${body}`,
        `function (${list}) ${body}`,
        `async function walkThem(${list}) ${body}`,
        `function* walk(${list}) ${body}`,
      ]);
  const index = params.findIndex((each) => each.kind !== 'none');
  const want =
    index === -1 ? Option.none() : Option.some({ index, kind: params[index]?.kind ?? 'none' });
  return { text, want, params, bare };
};

describe('seedParam', () => {
  test('finds the parameter named exactly seed or seeds, by index and kind, in generated sources', () => {
    const counts = { found: 0, none: 0, defaults: 0, destructured: 0, bare: 0 };
    const wrong: Array<string> = [];
    for (let run = 1; run <= 400; run += 1) {
      const drawn = source(random(run));
      const got = seedParam(drawn.text);
      if (JSON.stringify(got) !== JSON.stringify(drawn.want)) wrong.push(drawn.text);
      if (Option.isSome(drawn.want)) counts.found += 1;
      else counts.none += 1;
      if (drawn.params.some((each) => each.form === 'default')) counts.defaults += 1;
      if (drawn.params.some((each) => each.form === 'destructured')) counts.destructured += 1;
      if (drawn.bare) counts.bare += 1;
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    expect(Object.entries(counts).filter(([, count]) => count < 20)).toEqual([]);
  });
});

describe('pinned', () => {
  test('pins a single seed to the pin and a list to the window of its length, keeping every other argument', () => {
    const wrong: Array<string> = [];
    for (let run = 1; run <= 300; run += 1) {
      const draw = random(run);
      const kind = pick(draw, ['seed', 'seeds'] as const);
      const length = 1 + draw(6);
      const committed = Array.from({ length }, () => 1 + draw(500));
      const seedArg = kind === 'seed' ? committed[0] : committed;
      const others = Array.from({ length: draw(4) }, () => pick(draw, [7, 'read', [0], { a: 1 }]));
      const at = draw(others.length + 1);
      const args = [...others.slice(0, at), seedArg, ...others.slice(at)];
      const pin = 1 + draw(1000);
      const got = pinned(args, at, kind, pin);
      const want = kind === 'seed' ? pin : Array.from({ length }, (_, offset) => pin + offset);
      const kept = got.every((arg, index) => index === at || arg === args[index]);
      if (!kept || got.length !== args.length || JSON.stringify(got[at]) !== JSON.stringify(want))
        wrong.push(`${kind} ${JSON.stringify(args)} at ${at} pin ${pin}: ${JSON.stringify(got)}`);
    }
    expect(wrong.slice(0, 3)).toEqual([]);
  });

  test('prints the pinned value as the preload does', () => {
    const call = (kind: 'seed' | 'seeds', committed: string): Call => ({
      index: 1,
      fn: 'walk',
      kind,
      committed,
    });
    expect(pinnedText(call('seed', '141'), 9)).toBe('9');
    expect(pinnedText(call('seeds', '[1,2,3,4]'), 5)).toBe('[5,6,7,8]');
  });
});

describe("a part's files", () => {
  test('reads the test files and the preload from its script', () => {
    expect(
      partOf(
        "bun test --no-isolate --parallel=3 --preload ./src/test/setup.ts --path-ignore-patterns='**/*.slow.test.*' ./src/need/walk-b.test.tsx ./src/need/b.test.ts",
      ),
    ).toEqual({
      _tag: 'Part',
      files: ['./src/need/walk-b.test.tsx', './src/need/b.test.ts'],
      preloads: ['./src/test/setup.ts'],
    });
  });

  test('refuses a part naming a folder, or a file outside src', () => {
    const tags = [
      'bun test --preload ./src/test/setup.ts ./src/promises',
      'bun test ./scripts ./vite',
      'bun test ./scripts/icon.test.ts',
      'bun test --preload ./src/test/setup.ts ./src/need/walk-b.test.tsx ./src/about',
      'bun run typecheck',
    ].map((script) => partOf(script)._tag);
    expect(tags).toEqual(['Refused', 'Refused', 'Refused', 'Refused', 'Refused']);
  });

  test('takes the functions its files import by name from src/test modules', () => {
    const text = [
      "import { describe, it } from 'bun:test';",
      "import { walkNeed } from '../test/need-walk';",
      "import { type Steer, walkCase as walk, CELLS } from '../test/run-walk.ts';",
      "import { local } from './local';",
      "import { walkNeed } from '../test/need-walk';",
    ].join('\n');
    expect(walksOf('./src/need/walk-b.test.tsx', text)).toEqual([
      'src/test/need-walk:walkNeed',
      'src/test/run-walk.ts:walkCase',
      'src/test/run-walk.ts:CELLS',
    ]);
  });
});

describe('the search', () => {
  it.effect(
    'runs each seed once, never more than its jobs at once, and answers the meeting seeds ascending',
    () =>
      Effect.gen(function* () {
        const wrong: Array<string> = [];
        let fullJobs = 0;
        for (let run = 1; run <= 200; run += 1) {
          const draw = random(run);
          const from = 1 + draw(300);
          const seeds = Array.from({ length: 1 + draw(12) }, (_, offset) => from + offset);
          const jobs = 1 + draw(4);
          const meets = new Map(seeds.map((seed) => [seed, draw(3) === 0]));
          const delays = new Map(seeds.map((seed) => [seed, draw(6)]));
          const runs = new Map<number, number>();
          let inFlight = 0;
          let most = 0;
          const found = yield* searchWith(seeds, jobs, (seed) =>
            Effect.gen(function* () {
              runs.set(seed, (runs.get(seed) ?? 0) + 1);
              inFlight += 1;
              most = Math.max(most, inFlight);
              for (let turn = 0; turn < (delays.get(seed) ?? 0) + 1; turn += 1) {
                yield* Effect.yieldNow;
              }
              inFlight -= 1;
              return meets.get(seed) ?? false;
            }),
          );
          const want = seeds.filter((seed) => meets.get(seed));
          const twice = seeds.filter((seed) => runs.get(seed) !== 1);
          if (most === Math.min(jobs, seeds.length) && jobs > 1) fullJobs += 1;
          if (most > jobs || twice.length > 0 || JSON.stringify(found) !== JSON.stringify(want))
            wrong.push(
              `jobs ${jobs} seeds ${seeds.join(',')}: most ${most}, twice ${twice}, found ${found}`,
            );
        }
        expect(wrong.slice(0, 3)).toEqual([]);
        expect(fullJobs).toBeGreaterThanOrEqual(50);
      }),
  );
});

describe('the decision', () => {
  const output = [
    'bun test v1',
    'seed-pin call 1 walkCase seed 14',
    'run edges coverage a=1',
    'seed-pin call 2 walkRun seed 14',
    'seed-pin call 3 appearanceCase seeds [1,2,3,4]',
  ].join('\n');
  const calls = callsIn(output);

  test('reads the calls the committed run printed', () => {
    expect(calls.map((call) => `${call.index} ${call.fn} ${call.kind} ${call.committed}`)).toEqual([
      '1 walkCase seed 14',
      '2 walkRun seed 14',
      '3 appearanceCase seeds [1,2,3,4]',
    ]);
  });

  test('refuses no call, several with none chosen, and a choice past them', () => {
    const none = decide([], Option.none());
    const several = decide(calls, Option.none());
    const past = decide(calls, Option.some(4));
    const zero = decide(calls, Option.some(0));
    expect([none._tag, several._tag, past._tag, zero._tag]).toEqual([
      'Refused',
      'Refused',
      'Refused',
      'Refused',
    ]);
    expect(none._tag === 'Refused' && none.why).toContain('no call took');
    expect(several._tag === 'Refused' && several.why).toContain('1 walkCase 14; 2 walkRun 14');
  });

  test('pins the only call, or the one chosen', () => {
    const only = decide(calls.slice(0, 1), Option.none());
    const chosen = decide(calls, Option.some(3));
    expect([only, chosen].map((each) => each._tag === 'Pin' && each.call.index)).toEqual([1, 3]);
  });
});
