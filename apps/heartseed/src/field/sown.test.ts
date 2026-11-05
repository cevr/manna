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
 * daylight-saving edge, set back, or at the very start of a record the
 * device holds, old or new, in a read or an unread launch (a clock set
 * back, so the key is reused, mostly from another zone); a grade change,
 * Again or a peek after travel keeps the recital's offset; a write the
 * device refuses adds no day and the same recital lands at its next keep.
 * An unread launch fails at its listing or at its record reads, and each
 * keep's read of its key's stamp fails or not apart from whether its write
 * lands, over fresh keys and keys holding old or new records, in read and
 * unread launches. After each keep the device holds the model's record at
 * its key (`test/garden-model.ts`: a reused key keeps its first stamp, but
 * an unread keep whose stamp read failed writes its press's offset), so a
 * finished recital is never lost to a failed read. After each step a read
 * launch's field is the rule's over the records the device holds
 * (`test/field-model.ts`, by the model and by the disk), and its days sown
 * are never below the last it showed, through a last read launch after
 * each device's own; the one history excused from that is a key held under
 * another stamp whose stamp read failed in an unread launch while its write
 * landed (the spec's decided exception), where the write is asserted to
 * have landed as the press gave it. It catches a count that falls (a
 * streak, days in the device's zone now, days from what one launch kept, a
 * reused key whose day moves), counts a refused write, drops or guesses a
 * keep whose stamp read failed, or misses an unread session's recitals at
 * the next launch; it misses the screen (`screen.test.tsx`) and Say it's
 * press (`press.test.ts`).
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
import {
  below,
  DAY,
  GardenModel,
  keyOf,
  MINUTE,
  pickOf,
  PREFIX,
  random,
} from '../test/garden-model';
import { device, type AttemptFault } from '../test/one';
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

/**
 * A new recital in `zone`, stamped with the zone's offset at its start: of
 * the passage or a verse held, after `at`, or, a `reuse` share of the time,
 * at the very start of a record the device holds (old or new), as a clock
 * set back gives; a start that lands on a held key by chance is kept too.
 */
const newRecital = (
  next: () => number,
  model: GardenModel,
  at: number,
  zone: string,
  reuse: number,
) => {
  const grade = pickOf(next, [3, 3, 4, 2] as const);
  const stored = [...model.records.values()];
  const old = stored.filter((recall) => recall.offset === undefined);
  if (stored.length > 0 && next() < reuse) {
    const from = old.length > 0 && next() < 0.5 ? old : stored;
    const taken = pickOf(next, from as [Recall, ...Recall[]]);
    const recall = inZoneOf(zone, recallOf(taken.reference, taken.startedAt, grade, 0));
    return { recall, kind: 'reuse' };
  }
  const held = model.references();
  const reference =
    next() < 0.5 || held.length === 0 ? PASSAGE : pickOf(next, held as [string, ...string[]]);
  const then = nextStart(next, at, zone);
  const recall = inZoneOf(zone, recallOf(reference, then.at, grade, 0));
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

/** A launch as it goes: whether its read completed, the device's zone, the latest start, the recital under way, whether its last write was refused, and whether the device traveled since its press. */
interface Open {
  read: boolean;
  zone: string;
  at: number;
  current: Recall | undefined;
  pending: boolean;
  traveled: boolean;
}

/** Counts a new recital whose key the device already holds: over an old or a new record, in a read or an unread launch, and from another offset. */
const countReuse = (
  model: GardenModel,
  open: Open,
  recall: Recall,
  bump: (key: string) => void,
) => {
  const stored = model.records.get(keyOf(recall));
  if (stored === undefined) return;
  bump(`reuse:${stored.offset === undefined ? 'old' : 'new'}`);
  bump(`reuse:${open.read ? 'read' : 'unread'}`);
  if (stored.offset !== recall.offset) bump(`reuse:other offset${open.read ? '' : ':unread'}`);
};

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
    const made = newRecital(next, model, open.at, open.zone, open.read ? 0.2 : 0.45);
    bump(`time:${made.kind}`);
    countReuse(model, open, made.recall, bump);
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

/** What the field last showed on the device, which no later field may fall below unless the device's history holds the one excused keep (`excusedBy`). */
interface Shown {
  sown: number;
  harvest: number;
  excused: boolean;
}

/** The key a keep writes: fresh, or holding an old record (no offset) or a new one. */
const heldKind = (held: Recall | undefined) => {
  if (held === undefined) return 'fresh';
  return held.offset === undefined ? 'old' : 'new';
};

/**
 * Whether a keep is the one history the rule lets lower days sown: in an
 * unread launch, a key the device already holds under another stamp, whose
 * read of that stamp failed while its write landed, so the recital is
 * written with its press's offset rather than dropped.
 */
const excusedBy = (
  read: boolean,
  held: Recall | undefined,
  recall: Recall,
  stampFails: boolean,
  refused: boolean,
) => !read && stampFails && !refused && held !== undefined && held.offset !== recall.offset;

/** Scripts the launch's read: none fails for a read launch; an unread one fails each attempt at its listing, or, when the disk holds a recall key, half the time at its first record read. */
const scriptRead = (next: () => number, read: boolean, bump: (key: string) => void) => {
  const listed = [...device.disk.keys()].some((key) => key.startsWith(PREFIX));
  const unreadAt = listed && next() < 0.5 ? 'records' : 'listing';
  bump(read ? 'launch:read' : 'launch:unread');
  if (read) return;
  bump(`launch:unread:${unreadAt}`);
  const fault: AttemptFault = unreadAt === 'records' ? { at: 'get', nth: 1 } : { at: 'keys' };
  device.script([fault, fault, fault]);
};

/** What a launch's keeps share: the seeded draws, the garden's `Recalls`, the model, the launch under way, what the field last showed, and the coverage count. */
interface Keeping {
  readonly next: () => number;
  readonly keeps: Recalls['Service'];
  readonly model: GardenModel;
  readonly open: Open;
  readonly shown: Shown;
  readonly bump: (key: string) => void;
}

/**
 * Keeps `recall` with the read of its key's stamp failing or not (40%) and
 * its write refused or not (a refused step, or 20%), apart from each other,
 * and holds the device to the model's record at its key after it. The one
 * excused history (`excusedBy`) is asserted to have landed as the press gave
 * it, and excuses the device's later fields from never falling.
 */
const keepUnder = (
  { next, keeps, model, open, shown, bump }: Keeping,
  step: Step,
  recall: Recall,
  at: Readonly<Record<string, string | number>>,
) =>
  Effect.gen(function* () {
    const key = keyOf(recall);
    const held = model.records.get(key);
    const stampFails = next() < 0.4;
    const refused = step === 'refused' || next() < 0.2;
    const where = { ...at, stampFails, refused };
    const outcome = `${stampFails ? 'get fails' : 'get ok'}:${refused ? 'refused' : 'lands'}`;
    bump(`keep:${heldKind(held)}:${open.read ? 'read' : 'unread'}:${outcome}`);
    device.failing.get = stampFails ? 1 : 0;
    device.failing.set = refused ? 1 : 0;
    yield* keeps.keep(recall);
    device.failing.get = 0;
    model.keep(recall, !refused, stampFails);
    open.pending = refused;
    const text = device.disk.get(key);
    const stored = text == null ? undefined : JSON.parse(text);
    expect({ ...where, stored }).toEqual({ ...where, stored: model.records.get(key) });
    if (!excusedBy(open.read, held, recall, stampFails, refused)) return;
    shown.excused = true;
    bump(`excused:${heldKind(held)}`);
    expect({ ...where, landed: stored }).toEqual({ ...where, landed: recall });
  });

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
      if (!shown.excused)
        expect({ ...where, fell: field.sown < shown.sown }).toEqual({ ...where, fell: false });
      if (shown.excused && field.sown < shown.sown) bump('excused:fell');
      if (shown.sown >= 0 && field.sown > shown.sown) bump('sown rose');
      if (shown.harvest >= 0 && field.harvest < shown.harvest) bump('harvest fell');
      shown.sown = field.sown;
      shown.harvest = field.harvest;
    });

describe('days sown over the device', () => {
  it('never fall and always equal the rule’s over the records the device holds, across 80 generated devices of old and new records, skipped records, travel between launches and while open, keeps at 04:00 and daylight-saving edges, months on or set back, a stored start reused from another zone, Again and grade changes after travel, peeks, refused writes landing at the next keep, relaunches, unread sessions, and stamp reads that fail apart from writes (a keep then written with its press’s offset, the one history excused from never falling)', () =>
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
          const shown: Shown = { sown: -1, harvest: -1, excused: false };
          for (let l = 0, launches = 1 + below(next, 4); l < launches; l += 1) {
            const read = l === 0 || next() < 0.6;
            if (l > 0 && next() < 0.6) {
              zone = pickOf(next, ZONES);
              bump('zone:between launches');
            }
            travel(zone);
            device.launch(device.disk);
            model.restart(read);
            scriptRead(next, read, bump);
            yield* Effect.scoped(
              Effect.gen(function* () {
                const { garden, recalls } = yield* launch;
                const check = checker(garden, model, read, shown, bump);
                yield* check({ seed, l, zone });
                const open: Open = {
                  read,
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
                  const where = { seed, l, s, step, zone: open.zone };
                  yield* keepUnder(
                    { next, keeps: recalls, model, open, shown, bump },
                    step,
                    recall,
                    where,
                  );
                  yield* check(where);
                }
                zone = open.zone;
                at = open.at;
              }),
            );
          }
          travel(zone);
          device.launch(device.disk);
          model.restart(true);
          yield* Effect.scoped(
            Effect.gen(function* () {
              const { garden } = yield* launch;
              yield* checker(garden, model, true, shown, bump)({ seed, l: 'last', zone });
            }),
          );
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
          'reuse:old': 15,
          'reuse:new': 35,
          'reuse:read': 40,
          'reuse:unread': 12,
          'reuse:other offset': 40,
          'reuse:other offset:unread': 12,
          'launch:unread:listing': 8,
          'launch:unread:records': 10,
          'excused:old': 8,
          'excused:new': 3,
          'excused:fell': 1,
          ...Object.fromEntries(
            ['fresh', 'old', 'new'].flatMap((kind) =>
              ['read', 'unread'].flatMap((launch) =>
                ['get ok', 'get fails'].flatMap((get) =>
                  ['lands', 'refused'].map((write) => [
                    `keep:${kind}:${launch}:${get}:${write}`,
                    4,
                  ]),
                ),
              ),
            ),
          ),
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
