/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the model test drives generated launches step by step over the device stand-in's plain maps, switches the host's zone through `process.env.TZ` (restored when the test ends), and compares the field with a model written over undefined. */

/**
 * Days sown never fall, as a model test over the garden on the device: the
 * app's real store on `One.Database`'s stand-in (`src/test/one.tsx`), the
 * garden read anew at each launch, and generated keeps between them. The
 * device starts with old records (no offset) beside new ones of any zone,
 * and records the read must skip (each bad offset, no value, bad JSON,
 * another recital's record, a grade of 5, the voice's switch, another
 * key). Its zone changes between launches and while open; each new recital
 * is stamped with its zone's offset at its start (by `Intl`, `test/zone.ts`)
 * and starts minutes, hours, days or months on, at a local 04:00 or a
 * daylight-saving edge, or set back; a grade change, Again or a peek after
 * travel keeps the recital's offset; a write the device refuses adds no day
 * and the same recital lands at its next keep. After each step a read
 * launch's field is the rule's over the records the device holds
 * (`test/field-model.ts`, by the model and by the disk), and its days sown
 * are never below the last it showed. It catches a count that falls (a
 * streak, days in the device's zone now, days from what one launch kept),
 * counts a refused write, or misses an unread session's recitals at the
 * next launch; it misses the screen (`screen.test.tsx`) and Say it's press
 * (`press.test.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { Context, Effect, Fiber, Layer, Logger } from 'effect';
import * as TestClock from 'effect/testing/TestClock';

import { fieldOf, type FieldPassage } from '../field';
import { Chime, Garden, layer } from '../garden';
import { Recalls, type Recall } from '../sayit';
import { store } from '../store';
import { CHANGES, fourIn } from '../test/day-model';
import { after, fieldRule, heldOn, historyOf, otherReference, recallOf } from '../test/field-model';
import { below, DAY, GardenModel, keyOf, MINUTE, pickOf, random } from '../test/garden-model';
import { device } from '../test/one';
import { hostZone, offsetIn, restore, travel, ZONES } from '../test/zone';

const PASSAGE = 'Isaiah 41:10';
const PASSAGES: readonly FieldPassage[] = [{ title: PASSAGE, verses: [PASSAGE] }];
const HOUR = 60 * MINUTE;

/** Runs a test's effect on a test clock, its logs printed nowhere, the host's zone put back after. */
const quietly = <A, E>(effect: Effect.Effect<A, E>) => {
  const host = hostZone();
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(Layer.merge(Logger.layer([]), TestClock.layer())),
      Effect.ensuring(Effect.sync(() => restore(host))),
    ),
  );
};

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

type Step = 'new' | 'grade' | 'again' | 'peek' | 'refused' | 'travel';

/** `recall` as a device in `zone` stores it: the zone's offset at its start, or none for an old record. */
const inZoneOf = (zone: string | undefined, recall: Recall): Recall => {
  const { offset: _, ...rest } = recall;
  return zone === undefined ? rest : { ...rest, offset: offsetIn(zone, recall.startedAt) };
};

/** Each value under `offset` that makes a record no recall: a string, a fraction, null, a boolean, a number as text, a minute past either bound. */
const BAD_OFFSETS: readonly (readonly [string, unknown])[] = [
  ['bad:string', 'east'],
  ['bad:fraction', 1.5],
  ['bad:null', null],
  ['bad:boolean', true],
  ['bad:numeric text', '-300'],
  ['bad:past east', 1081],
  ['bad:past west', -1081],
];

/** Values the read must skip, each under a recall key, and why. */
const skipped = (at: number): readonly (readonly [string, string, string | null])[] => {
  const good = { ...recallOf(PASSAGE, at, 3, 0), offset: -300 };
  const later = (by: number) => ({ ...good, startedAt: at + by });
  const bad = BAD_OFFSETS.map(
    ([kind, offset], by) =>
      [kind, keyOf(later(by)), JSON.stringify({ ...later(by), offset })] as const,
  );
  return [
    ...bad,
    ['skip:no value', keyOf(later(7)), null],
    ['skip:bad json', keyOf(later(8)), '{"reference":'],
    ['skip:misfiled', keyOf(later(9)), JSON.stringify(good)],
    ['skip:grade 5', keyOf(later(10)), JSON.stringify({ ...later(10), grade: 5 })],
    ['skip:voice switch', 'heartseed/voice/enabled', 'true'],
    ['skip:other key', 'other/thing', 'kept as it is'],
  ];
};

/** The next start after `at` for a new recital in `zone`: minutes or hours on, the next days or months on (by `after`), a local 04:00 a millisecond either side, a daylight-saving change, or set back hours. */
const nextStart = (next: () => number, at: number, zone: string) => {
  const roll = below(next, 8);
  if (roll === 0) return { at: at + (1 + below(next, 50)) * MINUTE, kind: 'minutes' };
  if (roll === 1) return { at: at + (1 + below(next, 9)) * HOUR, kind: 'hours' };
  if (roll === 2) return { at: after(next, at, pickOf(next, [1, 2, 9] as const)), kind: 'days' };
  if (roll === 3) return { at: after(next, at, 30 + below(next, 150)), kind: 'months' };
  if (roll === 4) {
    const four = fourIn(zone, at + DAY);
    return { at: four + pickOf(next, [-1, 0, 1] as const), kind: '04:00 edge' };
  }
  if (roll === 5) {
    const change = pickOf(next, CHANGES);
    return { at: change.at + pickOf(next, [-1, 0, 1, -HOUR, HOUR] as const), kind: 'dst edge' };
  }
  if (roll === 6) return { at: at - (1 + below(next, 30)) * HOUR, kind: 'back' };
  return { at: at + 1 + below(next, 20) * MINUTE, kind: 'minutes' };
};

/** A generated device's disk: each verse's history stamped old (no offset) or in a zone of the pool, beside about half the values the read must skip; the model holds the valid records. */
const seedDevice = (next: () => number, bump: (key: string) => void) => {
  const model = new GardenModel();
  const firstDay = 20_500 + below(next, 300);
  const start = [PASSAGE, otherReference(next, PASSAGE)]
    .filter(() => next() < 0.7)
    .flatMap((reference) => historyOf(next, reference, firstDay + below(next, 3)))
    .map((recall) => inZoneOf(next() < 0.4 ? undefined : pickOf(next, ZONES), recall));
  for (const recall of start) model.records.set(keyOf(recall), recall);
  const junk = skipped(firstDay * DAY - DAY).filter(() => next() < 0.5);
  for (const [kind] of junk) bump(kind);
  const old = start.filter((recall) => recall.offset === undefined).length;
  if (old > 0 && old < start.length) bump('old and new');
  device.launch([
    ...start.map((recall) => [keyOf(recall), JSON.stringify(recall)] as const),
    ...junk.map(([, key, value]) => [key, value] as const),
  ]);
  return {
    model,
    at: Math.max(firstDay * DAY, ...start.map((recall) => recall.startedAt)),
  };
};

/** A new recital after `at` in `zone`, of the passage or a verse held, stamped with the zone's offset at its start; none when its key is taken. */
const newRecital = (next: () => number, model: GardenModel, at: number, zone: string) => {
  const held = model.references();
  const reference =
    next() < 0.5 || held.length === 0 ? PASSAGE : pickOf(next, held as [string, ...string[]]);
  const then = nextStart(next, at, zone);
  const recall = inZoneOf(
    zone,
    recallOf(reference, then.at, pickOf(next, [3, 3, 4, 2] as const), 0),
  );
  if (model.records.has(keyOf(recall))) return undefined;
  return { recall, kind: then.kind };
};

/** The current recital changed by a peek, Again or another grade: the same start and offset. */
const changed = (next: () => number, current: Recall, step: 'peek' | 'grade' | 'again'): Recall => {
  if (step === 'peek')
    return { ...current, peeked: current.peeked + 1, missed: current.missed + 1 };
  return { ...current, grade: step === 'again' ? 1 : pickOf(next, [2, 3, 4] as const) };
};

/** The steps of a launch with a recital under way. */
const STEPS: readonly [Step, ...Step[]] = [
  'new',
  'new',
  'grade',
  'again',
  'again',
  'peek',
  'refused',
  'travel',
];

/** A launch as it goes: the device's zone, the latest start, the recital under way, whether its last write was refused, and whether the device traveled since its press. */
interface Open {
  zone: string;
  at: number;
  current: Recall | undefined;
  pending: boolean;
  traveled: boolean;
}

/** Takes one step into `open`: travel changes the zone and keeps nothing; a new or refused recital starts after the latest; a peek, Again or grade change rewrites the one under way. Answers the recall to keep, none for travel or a taken key. */
const take = (
  next: () => number,
  model: GardenModel,
  open: Open,
  step: Step,
  bump: (key: string) => void,
): Recall | undefined => {
  if (step === 'travel') {
    open.zone = pickOf(next, ZONES);
    travel(open.zone);
    open.traveled = true;
    bump('zone:while open');
    return undefined;
  }
  if (step === 'new' || step === 'refused' || open.current === undefined) {
    const made = newRecital(next, model, open.at, open.zone);
    if (made === undefined) return undefined;
    bump(`time:${made.kind}`);
    open.at = Math.max(open.at, made.recall.startedAt);
    open.current = made.recall;
    open.traveled = false;
    return made.recall;
  }
  if (open.traveled) bump('regrade after travel');
  if (open.pending) bump('refused then landed');
  open.current = changed(next, open.current, step);
  return open.current;
};

/** What the field last showed on the device, which no later field may fall below. */
interface Shown {
  sown: number;
  harvest: number;
}

/** A launch's check: its view read or unread as scripted, and a read field equal to the rule over the model's records and over the disk, never below the last shown. */
const checker =
  (
    garden: Garden['Service'],
    model: GardenModel,
    read: boolean,
    shown: Shown,
    bump: (key: string) => void,
  ) =>
  (where: Readonly<Record<string, string | number>>) =>
    Effect.gen(function* () {
      const view = yield* garden.view;
      expect({ ...where, view: view._tag }).toEqual({ ...where, view: read ? 'Read' : 'Unread' });
      if (view._tag !== 'Read') return;
      const field = fieldOf(view, PASSAGES);
      const want = fieldRule([...model.records.values()], PASSAGES);
      expect({ ...where, field, disk: fieldRule(heldOn(device.disk), PASSAGES) }).toEqual({
        ...where,
        field: want,
        disk: want,
      });
      expect({ ...where, fell: field.sown < shown.sown }).toEqual({ ...where, fell: false });
      if (shown.sown >= 0 && field.sown > shown.sown) bump('sown rose');
      if (shown.harvest >= 0 && field.harvest < shown.harvest) bump('harvest fell');
      shown.sown = field.sown;
      shown.harvest = field.harvest;
    });

describe('days sown over the device', () => {
  it('never fall and always equal the rule’s over the records the device holds, across 80 generated devices of old and new records, skipped records, travel between launches and while open, keeps at 04:00 and daylight-saving edges, months on or set back, Again and grade changes after travel, peeks, refused writes landing at the next keep, relaunches and unread sessions', () =>
    quietly(
      Effect.gen(function* () {
        const cover = new Map<string, number>();
        const bump = (key: string) => cover.set(key, (cover.get(key) ?? 0) + 1);
        for (let seed = 1; seed <= 80; seed += 1) {
          const next = random(seed * 104_729 + 3);
          const seeded = seedDevice(next, bump);
          const { model } = seeded;
          let { at } = seeded;
          let zone: string = pickOf(next, ZONES);
          const shown: Shown = { sown: -1, harvest: -1 };
          for (let l = 0, launches = 1 + below(next, 4); l < launches; l += 1) {
            const read = l === 0 || next() < 0.75;
            if (l > 0 && next() < 0.6) {
              zone = pickOf(next, ZONES);
              bump('zone:between launches');
            }
            travel(zone);
            device.launch(device.disk);
            if (!read) device.script([{ at: 'keys' }, { at: 'keys' }, { at: 'keys' }]);
            bump(read ? 'launch:read' : 'launch:unread');
            yield* Effect.scoped(
              Effect.gen(function* () {
                const { garden, recalls } = yield* launch;
                const check = checker(garden, model, read, shown, bump);
                yield* check({ seed, l, zone });
                const open: Open = {
                  zone,
                  at,
                  current: undefined,
                  pending: false,
                  traveled: false,
                };
                for (let s = 0, steps = 2 + below(next, 7); s < steps; s += 1) {
                  const step: Step = open.current === undefined ? 'new' : pickOf(next, STEPS);
                  bump(`step:${step}${read ? '' : ':unread'}`);
                  const recall = take(next, model, open, step, bump);
                  if (recall === undefined) continue;
                  device.failing.set = step === 'refused' ? 1 : 0;
                  yield* recalls.keep(recall);
                  model.keep(recall, step !== 'refused');
                  open.pending = step === 'refused';
                  yield* check({ seed, l, s, step, zone: open.zone });
                }
                zone = open.zone;
                at = open.at;
              }),
            );
          }
        }
        const floors = {
          'launch:unread': 12,
          'step:again': 40,
          'step:peek': 20,
          'step:refused': 20,
          'step:new:unread': 12,
          'sown rose': 40,
          'harvest fell': 4,
          'old and new': 15,
          'zone:between launches': 25,
          'zone:while open': 20,
          'regrade after travel': 10,
          'refused then landed': 8,
          'time:04:00 edge': 15,
          'time:dst edge': 15,
          'time:months': 15,
          'time:back': 15,
          'bad:string': 20,
          'bad:fraction': 20,
          'bad:null': 20,
          'bad:boolean': 20,
          'bad:numeric text': 20,
          'bad:past east': 20,
          'bad:past west': 20,
          'skip:misfiled': 20,
          'skip:grade 5': 20,
        };
        for (const [key, floor] of Object.entries(floors))
          expect({
            key,
            count: cover.get(key) ?? 0,
            covered: (cover.get(key) ?? 0) >= floor,
          }).toEqual({
            key,
            count: cover.get(key) ?? 0,
            covered: true,
          });
      }),
    ));
});
