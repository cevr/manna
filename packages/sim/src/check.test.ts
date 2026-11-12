/**
 * `@manna/sim/check`: a template is filled as a regular expression of its
 * parts would fill it, a selector reads as the drive reads it, and a
 * journey's text loads as `sim journey` loads it, a quiet app's shot refused.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Option, Schema } from 'effect';

import { fillsTemplate, loadJourneyText, parseSelector, selectorsOf } from './check.ts';
import { probeApp } from './fixtures/probe.ts';

const toJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

describe('@manna/sim/check', () => {
  test('a template is filled only by non-empty holes that end where the value ends', () => {
    let seed = 7;
    const next = (below: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % below;
    };
    const pick = <A>(from: ReadonlyArray<A>): A => from[next(from.length)] as A;
    const PIECES = ['', 'a', 'b', 'ab', ' ', 'a b'];
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const disagree: Array<string> = [];
    for (let round = 0; round < 400; round++) {
      const parts = Array.from({ length: 2 + next(3) }, () => pick(PIECES));
      const holes = parts.slice(1).map(() => pick(PIECES));
      const value = parts.reduce((text, part, at) => text + (holes[at - 1] ?? '') + part, '');
      const suffixed = value + pick(PIECES);
      const oracle = new RegExp(`^${parts.map(escape).join('(.+)')}$`, 's');
      for (const one of [value, suffixed])
        if (fillsTemplate(one, parts, () => true) !== oracle.test(one))
          disagree.push(`${toJson(parts)} ${toJson(one)}`);
    }
    expect(disagree.slice(0, 5)).toEqual([]);
  });

  test('a selector reads its role, its kind and its value, quoted or bare', () => {
    expect(parseSelector('role=button label="Say it"')).toEqual({
      by: 'label',
      value: 'Say it',
      role: Option.some('button'),
    });
    expect(parseSelector('id=today-card')).toEqual({
      by: 'id',
      value: 'today-card',
      role: Option.none(),
    });
    expect(parseSelector('Hear it')).toEqual({
      by: 'label',
      value: 'Hear it',
      role: Option.none(),
    });
  });

  it.effect(
    "loads a journey's text with its defaults, and names each step's target, start and expects",
    () =>
      Effect.gen(function* () {
        const journey = yield* loadJourneyText(
          probeApp,
          'probe',
          toJson({
            feature: 'probe',
            platform: 'ios',
            steps: [
              { name: 'a', action: 'scroll', target: 'screen', direction: 'down' },
              {
                name: 'b',
                action: 'gesture',
                from: 'id=list',
                dx: 0,
                dy: 9,
                expect: [{ hides: 'id=x' }, { shows: 'label=Y' }],
              },
              { name: 'c', action: 'pinch', at: '20,30', scale: 2 },
            ],
          }),
        );
        expect(journey.steps.map((step) => step.receipt)).toEqual(['both', 'both', 'both']);
        expect(journey.steps.map(selectorsOf)).toEqual([[], ['id=list', 'id=x', 'label=Y'], []]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('a quiet app refuses a step that keeps a shot, by its receipt or the default', () =>
    Effect.gen(function* () {
      const quiet = { ...probeApp, quiet: true };
      const back = { name: 'a', action: 'back' };
      const shot = { ...back, receipt: 'shot' };
      const steps = [
        { ...back, receipt: 'both' },
        shot,
        { ...back, receipt: 'snapshot' },
        { ...back, receipt: 'none' },
        back,
      ];
      const made = (step: typeof back) =>
        toJson({ feature: 'probe', platform: 'ios', steps: [step] });
      const refused = [];
      for (const step of steps) {
        const exit = yield* Effect.exit(loadJourneyText(quiet, 'probe', made(step)));
        refused.push(Exit.isFailure(exit));
      }
      expect(refused).toEqual([true, true, false, false, true]);
      const loud = yield* Effect.exit(loadJourneyText(probeApp, 'probe', made(shot)));
      expect(Exit.isSuccess(loud)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
