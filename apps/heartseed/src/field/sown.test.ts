/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the model test drives generated launches step by step over the device stand-in's plain maps, and compares the field with a model written over undefined. */

/**
 * Days sown never fall, as a model test over the garden on the device: the
 * app's real store on `One.Database`'s stand-in (`src/test/one.tsx`), the
 * garden read anew at each launch, and generated keeps between them (new
 * recitals on the same, the next or a later UTC day and at its edges, grade
 * changes with Again, peeks, writes the device refuses), relaunches and
 * unread sessions. After each, a read launch's field is the rule's over the
 * records the device holds (`test/field-model.ts`), and its days sown are
 * never below the last it showed. It catches a count that falls (a streak,
 * days of the passage alone, days from what one launch kept), counts a
 * refused write, or misses an unread session's recitals at the next launch;
 * it misses the screen (`screen.test.tsx`).
 */

import { describe, expect, it } from 'bun:test';
import { Context, Effect, Fiber, Layer, Logger } from 'effect';
import * as TestClock from 'effect/testing/TestClock';

import { fieldOf, type FieldPassage } from '../field';
import { Chime, Garden, layer } from '../garden';
import { Recalls, type Recall } from '../sayit';
import { store } from '../store';
import { after, fieldRule, historyOf, otherReference, recallOf } from '../test/field-model';
import { below, GardenModel, keyOf, pickOf, random } from '../test/garden-model';
import { device } from '../test/one';

const PASSAGE = 'Isaiah 41:10';
const PASSAGES: readonly FieldPassage[] = [{ title: PASSAGE, verses: [PASSAGE] }];

/** Runs a test's effect on a test clock, its logs printed nowhere. */
const quietly = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.merge(Logger.layer([]), TestClock.layer()))));

/** One launch: the real store opened anew on the device and the garden read over it, its waits passed on the test clock. */
const launch = Effect.gen(function* () {
  const reading = yield* Effect.forkChild(
    Layer.build(
      layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.fresh(store),
            Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
          ),
        ),
      ),
    ),
  );
  yield* TestClock.adjust('1 second');
  const services = yield* Fiber.join(reading);
  return { garden: Context.get(services, Garden), recalls: Context.get(services, Recalls) };
});

type Step = 'new' | 'grade' | 'again' | 'peek' | 'refused';

describe('days sown over the device', () => {
  it('never fall and always equal the rule’s over the records the device holds, across 80 generated devices of keeps, Again, peeks, refused writes, relaunches and unread sessions', () =>
    quietly(
      Effect.gen(function* () {
        const cover = new Map<string, number>();
        const bump = (key: string) => cover.set(key, (cover.get(key) ?? 0) + 1);
        for (let seed = 1; seed <= 80; seed += 1) {
          const next = random(seed * 104_729 + 3);
          const model = new GardenModel();
          const firstDay = 20_500 + below(next, 300);
          const start = [PASSAGE, otherReference(next, PASSAGE)]
            .filter(() => next() < 0.7)
            .flatMap((reference) => historyOf(next, reference, firstDay + below(next, 3)));
          for (const recall of start) model.records.set(keyOf(recall), recall);
          device.launch(start.map((recall) => [keyOf(recall), JSON.stringify(recall)] as const));
          let at = Math.max(firstDay * 86_400_000, ...start.map((recall) => recall.startedAt));
          let lastSown = -1;
          let lastHarvest = -1;
          for (let l = 0, launches = 1 + below(next, 4); l < launches; l += 1) {
            const read = l === 0 || next() < 0.75;
            device.launch(device.disk);
            if (!read) device.script([{ at: 'keys' }, { at: 'keys' }, { at: 'keys' }]);
            bump(read ? 'launch:read' : 'launch:unread');
            yield* Effect.scoped(
              Effect.gen(function* () {
                const { garden, recalls } = yield* launch;
                const check = function* (where: Readonly<Record<string, string | number>>) {
                  const view = yield* garden.view;
                  expect({ ...where, view: view._tag }).toEqual({
                    ...where,
                    view: read ? 'Read' : 'Unread',
                  });
                  if (view._tag !== 'Read') return;
                  const field = fieldOf(view, PASSAGES);
                  expect({ ...where, field }).toEqual({
                    ...where,
                    field: fieldRule([...model.records.values()], PASSAGES),
                  });
                  expect({ ...where, fell: field.sown < lastSown }).toEqual({
                    ...where,
                    fell: false,
                  });
                  if (lastSown >= 0 && field.sown > lastSown) bump('sown rose');
                  if (lastHarvest >= 0 && field.harvest < lastHarvest) bump('harvest fell');
                  lastSown = field.sown;
                  lastHarvest = field.harvest;
                };
                yield* check({ seed, l });
                let current: Recall | undefined;
                for (let s = 0, steps = 2 + below(next, 7); s < steps; s += 1) {
                  const step: Step =
                    current === undefined
                      ? 'new'
                      : pickOf(next, ['new', 'new', 'grade', 'again', 'again', 'peek', 'refused']);
                  bump(`step:${step}${read ? '' : ':unread'}`);
                  if (step === 'new' || step === 'refused' || current === undefined) {
                    const held = model.references();
                    const reference =
                      next() < 0.5 || held.length === 0
                        ? PASSAGE
                        : pickOf(next, held as [string, ...string[]]);
                    at = after(next, at, pickOf(next, [0, 0, 1, 1, 2, 9, 40] as const));
                    current = recallOf(reference, at, pickOf(next, [3, 3, 4, 2] as const), 0);
                  } else if (step === 'peek')
                    current = {
                      ...current,
                      peeked: current.peeked + 1,
                      missed: current.missed + 1,
                    };
                  else
                    current = {
                      ...current,
                      grade: step === 'again' ? 1 : pickOf(next, [2, 3, 4] as const),
                    };
                  device.failing.set = step === 'refused' ? 1 : 0;
                  yield* recalls.keep(current);
                  model.keep(current, step !== 'refused');
                  if (step === 'refused') current = undefined;
                  yield* check({ seed, l, s, step });
                }
              }),
            );
          }
        }
        for (const key of [
          'launch:unread',
          'step:again',
          'step:peek',
          'step:refused',
          'step:new:unread',
          'sown rose',
          'harvest fell',
        ])
          expect({ key, covered: (cover.get(key) ?? 0) >= 4 }).toEqual({ key, covered: true });
      }),
    ));
});
