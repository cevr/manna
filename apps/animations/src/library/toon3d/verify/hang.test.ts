import { describe, expect, test } from 'bun:test';
import { Cause, Duration, Effect, Exit, Option, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import type { RenderPng, ViewName } from '../render.ts';
import type { Raster } from './measures.ts';
import {
  firstLaunch,
  jobsOf,
  QUICK_PLAN,
  RenderHung,
  secondLaunch,
  type Launch,
  type Placement,
} from './pipeline.ts';

const BOUND = Duration.seconds(120);

const blank: Raster = { width: 16, height: 24, rgba: new Uint8Array(16 * 24 * 4).fill(255) };

const kept: ReadonlyMap<ViewName, Raster> = new Map([['front', blank]]);

const place: Placement = { width: 16, height: 24, ox: 8, oy: 16 };

const jobs = jobsOf(QUICK_PLAN, new Map([['front', place]]));

const answers: RenderPng = () => Effect.succeed(new Uint8Array(0));

/** A render that answers its first `n` requests and never answers the next. */
const hangsAfter = (n: number): RenderPng => {
  let asked = 0;
  return (req) => {
    asked += 1;
    if (asked > n) return Effect.never;
    return answers(req);
  };
};

/** What hung, once the clock passed the bound by a second: `RenderHung <job>`, or `still waiting`, `answered` or the other failure's tag. */
const endAfterBound = <A, E extends { readonly _tag: string }>(run: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(run, { startImmediately: true });
    yield* TestClock.adjust('121 seconds');
    yield* Effect.yieldNow;
    return Option.match(Option.fromUndefinedOr(fiber.pollUnsafe()), {
      onNone: () => 'still waiting',
      onSome: Exit.match({
        onSuccess: () => 'answered',
        onFailure: (cause) =>
          Option.match(Cause.findErrorOption(cause), {
            onNone: () => 'died',
            onSome: (error) => {
              if (Schema.is(RenderHung)(error)) return `RenderHung ${error.job}`;
              return error._tag;
            },
          }),
      }),
    });
  }).pipe(Effect.provide(TestClock.layer()), Effect.runPromise);

const launchOf = (open: Launch['open']): Launch => ({ open, bound: BOUND });

describe('a hung page fails the run, naming what hung', () => {
  test('a page that never opens', () =>
    endAfterBound(firstLaunch(launchOf(Effect.never), QUICK_PLAN, kept)).then((end) => {
      expect(end).toBe('RenderHung first launch: page');
    }));

  test('a placement render that never answers', () =>
    endAfterBound(firstLaunch(launchOf(Effect.succeed(hangsAfter(0))), QUICK_PLAN, kept)).then(
      (end) => {
        expect(end).toBe('RenderHung first launch: place front 1');
      },
    ));

  test('a job render of the second launch that never answers', () =>
    endAfterBound(secondLaunch(launchOf(Effect.succeed(hangsAfter(2))), jobs)).then((end) => {
      expect(jobs[2]?.name).toBe('bend/f0000.png');
      expect(end).toBe('RenderHung second launch: bend/f0000.png');
    }));

  test('a launch whose renders all answer finishes within the bound', () =>
    endAfterBound(secondLaunch(launchOf(Effect.succeed(answers)), jobs)).then((end) => {
      expect(end).toBe('answered');
    }));
});
