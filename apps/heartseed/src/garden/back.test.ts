/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction -- the property builds generated histories with plain loops and compares the garden's Option-built answers with a model written over undefined; the launches run over the device stand-in's plain maps, one awaited launch after another. */

/**
 * Move back a stage, as pure code and over the app's real store on the
 * device stand-in. The rule: a step back folds in among a verse's recalls
 * at its instant, moving a verse past a seed one stage down (ear to blade,
 * blade to seed, full corn to ear) and reviewing its card as Again there,
 * against the rule written plainly here over ts-fsrs; a seed's step back,
 * or one before the first recall, changes nothing. The service: a step back
 * writes one record under `heartseed/back/<reference>/<at>`, the view
 * shows the lower stage, the verse comes due within ten minutes, and a
 * relaunch reads the same; a seed, a verse not planted, an unread garden
 * and a failed write answer `Failed` and change nothing.
 *
 * It catches a step back that skips a stage or none, steps a seed below
 * nothing, leaves the card as it was (so full corn snaps back at the next
 * recall), is read in input order, is lost at a relaunch, or is written
 * for a verse it cannot move. It misses the screen, which
 * `src/garden/back-today.test.tsx` owns.
 */

import { describe, expect, it } from 'bun:test';
import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  Fiber,
  Layer,
  Logger,
  Option,
  type Scope,
} from 'effect';
import * as TestClock from 'effect/testing/TestClock';

import {
  Backs,
  Chime,
  cueIn,
  Garden,
  growthOf,
  layer,
  plantOf,
  stageOf,
  type GardenView,
  type Stage,
} from '../garden';
import type { Recall } from '../sayit';
import { store } from '../store';
import {
  asCard,
  below,
  cueRule,
  DAY,
  emptyReference,
  keyOf,
  MINUTE,
  pickOf,
  random,
  referenceNext,
  type ModelStage,
} from '../test/garden-model';
import { device } from '../test/one';

const ORDER: readonly ModelStage[] = ['seed', 'blade', 'ear', 'full corn'];

/** One entry of a history in the model: a recall, or a step back at `at`. */
type ModelEntry = { readonly recall: Recall } | { readonly back: number };

const timeOf = (entry: ModelEntry) => ('recall' in entry ? entry.recall.startedAt : entry.back);

/** The entries in time order, a recall before a step back of the same instant. */
const ordered = (entries: readonly ModelEntry[]) =>
  entries.toSorted((a, b) => timeOf(a) - timeOf(b) || Number('back' in a) - Number('back' in b));

/**
 * The rule written plainly over ts-fsrs: each recall reviews the card under
 * its grade and takes the stage rule's stage (full corn at a stability of
 * 21 days; else a seed at the first recall or at Again; else a blade when a
 * peek or the stage before's cue helped; else an ear); each step back of a
 * verse past a seed takes it one stage down and reviews its card as Again
 * at its instant; any other step back changes nothing.
 */
const modelOf = (entries: readonly ModelEntry[]) => {
  let card = emptyReference();
  let stage: ModelStage | undefined;
  for (const entry of ordered(entries)) {
    if ('recall' in entry) {
      const { recall } = entry;
      card = referenceNext(card, recall.grade, recall.startedAt);
      if (card.stability >= 21) stage = 'full corn';
      else if (stage === undefined || recall.grade === 1) stage = 'seed';
      else if (recall.peeked > 0 || cueRule(stage) !== 'none') stage = 'blade';
      else stage = 'ear';
    } else if (stage !== undefined && stage !== 'seed') {
      card = referenceNext(card, 1, entry.back);
      stage = ORDER[ORDER.indexOf(stage) - 1];
    }
  }
  return { card: asCard(card), stage };
};

const REFERENCE = 'Made 1:1';

/** A recall of `REFERENCE` at `startedAt` under `grade`, with a peek when `peeked`. */
const said = (startedAt: number, grade: Recall['grade'], peeked = false): Recall => ({
  reference: REFERENCE,
  startedAt,
  grade,
  suggested: grade === 4 ? 3 : grade,
  words: 20,
  missed: peeked ? 1 : 0,
  peeked: peeked ? 1 : 0,
  extra: 0,
});

/** A generated history: recalls minutes to 40 days apart (a Good run of 30-day gaps in some, to reach full corn), a step back now and then between them, and sometimes one before the first recall or at a recall's own instant. */
const historyOf = (next: () => number): ModelEntry[] => {
  let at = Date.UTC(2026, 0, 1) + below(next, DAY);
  const entries: ModelEntry[] = [];
  if (next() < 0.1) entries.push({ back: at - MINUTE });
  const corn = next() < 0.3;
  const count = 1 + below(next, 9);
  for (let k = 0; k < count; k += 1) {
    at +=
      corn && k < 6
        ? 30 * DAY
        : next() < 0.4
          ? (1 + below(next, 59)) * MINUTE
          : (1 + below(next, 40)) * DAY;
    const grade = corn && k < 6 ? 3 : pickOf(next, [1, 2, 3, 3, 4] as const);
    entries.push({ recall: said(at, grade, next() < 0.25) });
    if (next() < 0.35) entries.push({ back: next() < 0.15 ? at : at + 1 + below(next, 3 * DAY) });
    if (next() < 0.1) entries.push({ back: at + 2 * MINUTE });
  }
  return entries;
};

const recallsIn = (entries: readonly ModelEntry[]) =>
  entries.flatMap((entry) => ('recall' in entry ? [entry.recall] : []));

const backsIn = (entries: readonly ModelEntry[]) =>
  entries.flatMap((entry) => ('back' in entry ? [entry.back] : []));

describe('a step back as a rule', () => {
  it('moves 500 generated verses one stage down at each step back past a seed, reviewed as Again there, in any input order, and grows them from there', () => {
    const met = new Map<string, number>();
    const meet = (what: string) => met.set(what, (met.get(what) ?? 0) + 1);
    for (let seed = 1; seed <= 500; seed += 1) {
      const next = random(seed * 4241);
      const entries = historyOf(next);
      const recalls = recallsIn(entries).toSorted(() => next() - 0.5);
      if (!Arr.isReadonlyArrayNonEmpty(recalls)) continue;
      const plant = plantOf(
        recalls,
        backsIn(entries).toSorted(() => next() - 0.5),
      );
      const model = modelOf(entries);
      expect({ seed, stage: stageOf(plant) as Stage | undefined, card: plant.card }).toEqual({
        seed,
        stage: model.stage,
        card: model.card,
      });
      expect({
        seed,
        cue: cueIn({ _tag: 'Read', plants: new Map([[REFERENCE, plant]]) }, REFERENCE),
      }).toEqual({
        seed,
        cue: cueRule(model.stage),
      });
      for (const recall of recalls) {
        const before = entries.filter((entry) => timeOf(entry) < recall.startedAt);
        const upTo = [...before, { recall }];
        const from = modelOf(before).stage;
        const to = modelOf(upTo).stage;
        const grew =
          from !== undefined && to !== undefined && ORDER.indexOf(to) > ORDER.indexOf(from)
            ? { from, to }
            : undefined;
        expect({
          seed,
          at: recall.startedAt,
          growth: Option.getOrUndefined(growthOf(plant, recall.startedAt)),
        }).toEqual({
          seed,
          at: recall.startedAt,
          growth: grew,
        });
      }
      ordered(entries).forEach((entry, k, all) => {
        if (!('back' in entry)) return;
        const was = modelOf(all.slice(0, k)).stage;
        const now = modelOf(all.slice(0, k + 1)).stage;
        meet(`${was ?? 'unplanted'}>${now ?? 'unplanted'}`);
      });
    }
    const floors = {
      'ear>blade': 20,
      'blade>seed': 40,
      'full corn>ear': 20,
      'seed>seed': 20,
      'unplanted>unplanted': 20,
    };
    expect(Object.entries(floors).filter(([what, floor]) => (met.get(what) ?? 0) < floor)).toEqual(
      [],
    );
  });
});

/** Runs an effect on a test clock set to `now`, its logs recorded nowhere. */
const quietly = <A, E>(now: number, effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(now);
        return yield* effect;
      }),
    ).pipe(Effect.provide(Layer.merge(Logger.layer([]), TestClock.layer()))),
  );

/** One launch over the device: the garden and its `Backs`, its read run to its end. */
const launch = Effect.gen(function* () {
  const built = Layer.build(
    layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.fresh(store),
          Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
        ),
      ),
    ),
  );
  const reading = yield* Effect.forkChild(built);
  yield* TestClock.adjust('1 second');
  const services = yield* Fiber.join(reading);
  return { garden: Context.get(services, Garden), backs: Context.get(services, Backs) };
});

/** The stage of `REFERENCE` in a view, `unread` or `unplanted` when it has none. */
const stageIn = (view: GardenView): Stage | 'unread' | 'unplanted' => {
  if (view._tag === 'Unread') return 'unread';
  const plant = view.plants.get(REFERENCE);
  return plant === undefined ? 'unplanted' : stageOf(plant);
};

const dueIn = (view: GardenView) =>
  view._tag === 'Unread' ? 0 : (view.plants.get(REFERENCE)?.card.due ?? 0);

const recordOf = (recall: Recall) => [keyOf(recall), JSON.stringify(recall)] as const;

const backKeys = () => [...device.disk.keys()].filter((key) => key.startsWith('heartseed/back/'));

const PLANTED = Date.UTC(2026, 0, 5, 9);

/** A verse's records and a day after its last: full corn by Good a day and then a week later; an ear by Good a day later and again ten minutes on. */
const GROWN: Readonly<Record<'full corn' | 'ear', readonly Recall[]>> = {
  'full corn': [said(PLANTED, 3), said(PLANTED + DAY, 3), said(PLANTED + 8 * DAY, 3)],
  ear: [said(PLANTED, 3), said(PLANTED + DAY, 3), said(PLANTED + DAY + 10 * MINUTE, 3)],
};

const grownTo = (stage: 'full corn' | 'ear') => ({
  disk: GROWN[stage].map(recordOf),
  after: PLANTED + 9 * DAY,
});

describe('a step back over the device', () => {
  it('moves full corn to an ear, then to a blade, then to a seed, each one record, due within ten minutes, kept through a relaunch, and moves no seed', async () => {
    const corn = grownTo('full corn');
    device.launch(corn.disk);
    const times: number[] = [];
    const seen = await quietly(
      corn.after,
      Effect.gen(function* () {
        const { garden, backs } = yield* launch;
        const out: unknown[] = [stageIn(yield* garden.view)];
        for (let k = 0; k < 4; k += 1) {
          const at = yield* Clock.currentTimeMillis;
          const from = stageIn(yield* garden.view);
          if (from === 'unread' || from === 'unplanted') return out;
          const answer = yield* backs.back({ reference: REFERENCE, from });
          const view = yield* garden.view;
          if (answer === 'Moved') times.push(at);
          out.push([answer, stageIn(view), dueIn(view) > at && dueIn(view) - at <= 10 * MINUTE]);
          yield* TestClock.adjust('1 minute');
        }
        return out;
      }),
    );
    expect(seen).toEqual([
      'full corn',
      ['Moved', 'ear', true],
      ['Moved', 'blade', true],
      ['Moved', 'seed', true],
      ['Failed', 'seed', true],
    ]);
    expect(backKeys()).toEqual(times.map((at) => `heartseed/back/${REFERENCE}/${at}`));
    expect(JSON.parse(device.disk.get(backKeys()[0] ?? '') ?? '{}')).toEqual({
      reference: REFERENCE,
      at: times[0],
    });

    device.launch(device.disk);
    const again = await quietly(
      corn.after + DAY,
      Effect.gen(function* () {
        const { garden } = yield* launch;
        return stageIn(yield* garden.view);
      }),
    );
    expect(again).toBe('seed');
  });

  it('answers Failed and writes nothing for a verse not planted, a stage the verse does not stand at, a failed write and an unread garden', async () => {
    const ear = grownTo('ear');
    device.launch(ear.disk);
    const seen = await quietly(
      ear.after,
      Effect.gen(function* () {
        const { garden, backs } = yield* launch;
        const other = yield* backs.back({ reference: 'Made 9:9', from: 'ear' });
        const stale = yield* backs.back({ reference: REFERENCE, from: 'blade' });
        device.fail('set', 1);
        const refused = yield* backs.back({ reference: REFERENCE, from: 'ear' });
        return [other, stale, refused, stageIn(yield* garden.view)];
      }),
    );
    expect([seen, backKeys()]).toEqual([['Failed', 'Failed', 'Failed', 'ear'], []]);

    device.launch(ear.disk).fail('keys', 3);
    const unread = await quietly(
      ear.after,
      Effect.gen(function* () {
        const { garden, backs } = yield* launch;
        return [
          yield* backs.back({ reference: REFERENCE, from: 'ear' }),
          stageIn(yield* garden.view),
        ];
      }),
    );
    expect([unread, backKeys()]).toEqual([['Failed', 'unread'], []]);
  });

  it('settles one ask once: answered twice it moves the verse once and gives the same answer twice', async () => {
    const ear = grownTo('ear');
    device.launch(ear.disk);
    const seen = await quietly(
      ear.after,
      Effect.gen(function* () {
        const { garden, backs } = yield* launch;
        const ask = { reference: REFERENCE, from: 'ear' } as const;
        const answers = yield* Effect.all([backs.back(ask), backs.back(ask)], {
          concurrency: 'unbounded',
        });
        return [...answers, stageIn(yield* garden.view)];
      }),
    );
    expect([seen, backKeys().length]).toEqual([['Moved', 'Moved', 'blade'], 1]);
  });

  it('settles one ask whose first save fails as Failed: a second answer writes nothing, and a new ask then moves the verse', async () => {
    const ear = grownTo('ear');
    device.launch(ear.disk);
    const seen = await quietly(
      ear.after,
      Effect.gen(function* () {
        const { garden, backs } = yield* launch;
        const ask = { reference: REFERENCE, from: 'ear' } as const;
        device.fail('set', 1);
        const first = yield* backs.back(ask);
        const again = yield* backs.back(ask);
        const kept = [first, again, stageIn(yield* garden.view), backKeys().length];
        const fresh = yield* backs.back({ reference: REFERENCE, from: 'ear' });
        return [...kept, fresh, stageIn(yield* garden.view), backKeys().length];
      }),
    );
    expect(seen).toEqual(['Failed', 'Failed', 'ear', 0, 'Moved', 'blade', 1]);
  });
});
