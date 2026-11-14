import { Data, Effect, Schema } from 'effect';
import * as Arbitrary from 'effect/Arbitrary';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';

import { refusal, withDataHost } from './data-host.ts';

const before = {
  date: globalThis.Date,
  random: Math.random,
  performanceNow: performance.now,
  setInterval: globalThis.setInterval,
  frame: Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame'),
  symbol: globalThis.Symbol,
  dispose: Symbol.dispose,
};

/** Each call the data module refuses, by the name its refusal gives. */
const refused: ReadonlyArray<readonly [string, () => unknown]> = [
  ['Date.now()', () => Date.now()],
  ['Date()', () => Reflect.apply(Date, undefined, [])],
  ['new Date()', () => new Date()],
  ['Math.random()', () => Math.random()],
  ['performance.now()', () => performance.now()],
  ['setInterval()', () => setInterval(() => undefined, 1)],
  [
    'requestAnimationFrame()',
    () =>
      Reflect.apply(Reflect.get(globalThis, 'requestAnimationFrame'), undefined, [() => undefined]),
  ],
];

const refuses = (call: () => unknown, api: string) => {
  try {
    call();
    return false;
  } catch (error) {
    return error instanceof Error && error.message === refusal(api);
  }
};

/** Inside a run: every refused call throws its refusal, a date from a value is still a date, and `Symbol.dispose` is gone. */
const guarded = () =>
  refused.every(([api, call]) => refuses(call, api)) &&
  new Date(86_400_000).toISOString() === '1970-01-02T00:00:00.000Z' &&
  new Date(0) instanceof before.date &&
  Reflect.get(Symbol, 'dispose') === undefined &&
  !Reflect.has(Symbol, 'dispose') &&
  Symbol.for('x') === before.symbol.for('x');

/** Outside every run: each global is the one it was before any. */
const restored = () =>
  globalThis.Date === before.date &&
  Math.random === before.random &&
  performance.now === before.performanceNow &&
  globalThis.setInterval === before.setInterval &&
  Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame')?.value ===
    before.frame?.value &&
  'requestAnimationFrame' in globalThis === (before.frame !== undefined) &&
  globalThis.Symbol === before.symbol &&
  Symbol.dispose === before.dispose &&
  typeof Date.now() === 'number';

class Planted extends Data.TaggedError('Planted')<{ readonly message?: string }> {}

/** A step of a program of nested runs: open a run inside this one, close this one, or throw out of it. */
const Step = Schema.Literals(['enter', 'exit', 'throw']);
type Step = typeof Step.Type;

/** Runs `steps` from `at` inside the current run; a planted throw ends this run and the one around it goes on. */
const runLevel = (steps: ReadonlyArray<Step>, at: { i: number }, broken: Array<string>): void => {
  while (at.i < steps.length) {
    const step = steps[at.i];
    at.i += 1;
    if (!guarded()) broken.push(`unguarded before step ${at.i}`);
    if (step === 'exit') return;
    if (step === 'throw') throw new Planted({});
    try {
      withDataHost(() => runLevel(steps, at, broken));
    } catch (error) {
      if (!(error instanceof Planted)) throw error;
    }
    if (!guarded()) broken.push(`unguarded after the run that ended at step ${at.i}`);
  }
};

describe('withDataHost', () => {
  test('refuses each clock, timer and random call inside, and gives a date from a value', () => {
    expect(withDataHost(guarded)).toBe(true);
    expect(restored()).toBe(true);
  });

  test('returns what the run returns, and restores when the run throws', () => {
    expect(withDataHost(() => 7)).toBe(7);
    expect(() =>
      withDataHost(() => {
        throw new Planted({ message: 'out' });
      }),
    ).toThrow('out');
    expect(restored()).toBe(true);
  });

  test('names the refused call', () => {
    expect(() => withDataHost(() => Date.now())).toThrow(
      'Date.now() is unavailable in data sources',
    );
  });

  it.effect('restores every global after any order of nested, failing and returning runs', () =>
    Effect.gen(function* () {
      const result = yield* Arbitrary.checkEffect(
        Arbitrary.array(Arbitrary.schema(Step), { maxLength: 24 }),
        (steps) => {
          const broken: Array<string> = [];
          const at = { i: 0 };
          while (at.i < steps.length) {
            try {
              withDataHost(() => runLevel(steps, at, broken));
            } catch (error) {
              if (!(error instanceof Planted)) throw error;
            }
            if (!restored()) broken.push(`not restored after step ${at.i}`);
          }
          return broken.length === 0 && restored();
        },
        { runs: 200 },
      );
      expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
    }),
  );
});
