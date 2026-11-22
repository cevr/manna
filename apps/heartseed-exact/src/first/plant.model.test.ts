/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noNewPromise, effect/noTernary, effect/noNewError, effect/noThrowStatement, no-await-in-loop -- a model test over the port's sources: each step's call is awaited in turn as Exact asks them, the storage stand-in answers and refuses with promises as Exact's does, the generated events are plain data picked by plain branches, and One's absent start is `null` as its reducer takes it. */

/**
 * The first verse held from Planted as an ordinary single verse (q175),
 * over generated histories: the first minute's inputs (Begin, Skip, Plant,
 * Next, the voice's endings, recitals graded or not), the tour's taps (How
 * Heartseed works, Show the welcome again, See your field, Got it), a
 * relaunch at any step, a write refused then allowed, and the reader's
 * ordinary acts once home shows (Remove the verse, Add it again by the
 * chooser, plant a list that holds it, Move back, say it in Today).
 *
 * The port runs through its own sources composed as `app.ts` composes
 * them (the garden's, then Today's over them, and `firstSources`), over one
 * storage stand-in. Which source each screen's input reaches is a MIRROR
 * of features/first.contract's wiring (`firstKept`, the alone arm, is the
 * only sender of `gardenKeepFirst`, which `held.test.ts` holds to the
 * file's text). One's `step` runs beside it on its own flow and decides
 * the step the flow reaches Planted.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import type { FileStorage } from '@manna/exact-kit/storage';
import {
  begin,
  openingOf,
  step,
  type Flow,
  type Input,
  type Opening,
} from '@manna/heartseed/first/flow';
import type { TourTap } from '@manna/heartseed/first/tour';
import { placeOf } from '@manna/heartseed/lists';
import { verseReference, type Range } from '@manna/heartseed/passages';
import { Effect, Logger, Match, Option } from 'effect';

import { GARDEN_FILE, readGarden } from '../garden/program';
import { gardenSources } from '../garden/sources';
import { homeSources } from '../home/sources';
import { NO_PLAN } from '../home/session';
import type { HomeShown } from '../home/home';
import { makeLive } from '../session/live';
import { storageOf } from '../test/garden-model';
import { seeded, type Random } from '../test/random';
import { todaySources } from '../today/sources';
import { firstSources, screenOf, type FirstScreen, type FirstShown } from './flow';
import { firstReference } from './verse';

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };
const NOW = Date.UTC(2026, 10, 15, 13, 0, 0);
const LATER = NOW + 30 * 86_400_000;
const RUNS = 40;
const STEPS = 36;
const REFERENCE = firstReference();
const NO_HELP = { peeked: [], shownAt: null, cap: 4 };
const STORE = { forget: () => undefined };

const PLACE = Option.getOrThrow(placeOf(REFERENCE));
const RANGE: Range = {
  book: PLACE.book,
  chapter: PLACE.chapter,
  first: PLACE.verse,
  last: PLACE.verse,
};

/** A recall said at `startedAt`, at the grade the recital suggests. */
const recallAt = (startedAt: number, suggested: 1 | 2 | 3) => ({
  startedAt,
  offset: 0,
  grade: suggested,
  suggested,
  words: 37,
  missed: suggested === 3 ? 0 : 20,
  peeked: 0,
  extra: 0,
});

/** A storage stand-in whose writes can be refused, as a full disk or a locked file refuses them. */
const refusableOf = () => {
  const stand = storageOf();
  const refusal = { on: false };
  const storage: FileStorage = {
    fs: {
      readFile: (path) => stand.storage.fs.readFile(path),
      atomicWriteFile: (path, data) => {
        if (refusal.on)
          return Promise.reject(Object.assign(new Error('refused'), { code: 'EACCES' }));
        return stand.storage.fs.atomicWriteFile(path, data);
      },
    },
  };
  return { files: stand.files, storage, refusal };
};

/** The sources of one launch, composed as `app.ts` composes them: Today's over the garden's, and the first minute's. */
const launchOf = () => {
  const garden = gardenSources({ host: HOST, quiet: true });
  const today = todaySources(garden, makeLive({ host: HOST, quiet: true }));
  return {
    sources: { ...garden, ...today },
    first: firstSources(REFERENCE, { host: HOST, quiet: true }),
    home: homeSources({ host: HOST, quiet: true }),
  };
};

type Launch = ReturnType<typeof launchOf>;
type Calls = Launch['sources'];

/** Calls the source `name` as Exact calls it, inside the data host. */
const callOf =
  (storage: FileStorage) =>
  <A>(launch: Launch, name: keyof Calls, args: readonly unknown[]): Promise<A> =>
    withDataHost(() =>
      Reflect.apply(launch.sources[name], undefined, [args, STORE, storage]),
    ) as Promise<A>;

/** What the file holds now: the garden and the single verses. */
const heldOf = (storage: FileStorage) =>
  Effect.runPromise(readGarden(storage).pipe(Effect.provide(Logger.layer([]))));

/** How many of the single verses held are the first verse. */
const timesHeld = async (storage: FileStorage) => {
  const held = await heldOf(storage);
  return Option.getOrElse(held.singles, () => []).filter(
    (range) => verseReference(range.book, range.chapter, range.first) === REFERENCE,
  ).length;
};

const plantedNow = async (storage: FileStorage) => {
  const held = await heldOf(storage);
  return held.garden._tag === 'Read' && held.garden.plants.has(REFERENCE);
};

const openingNow = async (storage: FileStorage): Promise<Opening> =>
  openingOf(Option.some((await heldOf(storage)).garden));

/** An Exact utterance's end, and the ending One names for it. */
const ENDS = [
  [['ended', 'end', ''], 'finished'],
  [['ended', 'error', 'canceled'], 'stopped'],
  [['ended', 'error', 'interrupted'], 'interrupted'],
  [['speaking', '', ''], null],
] as const;

type Event =
  | { readonly _tag: 'tap'; readonly tap: 'Begin' | 'Skip' | 'Plant' | 'Next' }
  | { readonly _tag: 'tour'; readonly tap: TourTap }
  | { readonly _tag: 'voice'; readonly end: (typeof ENDS)[number] }
  | { readonly _tag: 'recital'; readonly graded: boolean; readonly suggested: 1 | 2 | 3 }
  | { readonly _tag: 'keptThenRelaunch' }
  | { readonly _tag: 'relaunch' }
  | { readonly _tag: 'refuse' }
  | { readonly _tag: 'allow' }
  | { readonly _tag: 'remove' }
  | { readonly _tag: 'add' }
  | { readonly _tag: 'list' }
  | { readonly _tag: 'back' }
  | { readonly _tag: 'say' };

/** The inputs the screen `shown` offers, as the port's screens send them. */
const eventsOn = (random: Random, shown: FirstScreen): readonly Event[] => {
  const suggested = random.pick<1 | 2 | 3>([1, 2, 3]);
  if (shown === 'welcome')
    return [
      { _tag: 'tap', tap: 'Begin' },
      { _tag: 'tap', tap: 'Skip' },
    ];
  if (shown === 'grows') return [{ _tag: 'tap', tap: 'Plant' }];
  if (shown === 'hear')
    return [
      { _tag: 'tap', tap: 'Next' },
      { _tag: 'voice', end: random.pick(ENDS) },
    ];
  if (shown === 'letters' || shown === 'alone')
    return [
      { _tag: 'recital', graded: random.chance(0.7), suggested },
      { _tag: 'recital', graded: true, suggested },
      ...(shown === 'alone' ? [{ _tag: 'keptThenRelaunch' } as const] : []),
    ];
  if (shown === 'planted') return [{ _tag: 'tour', tap: 'Continue' }];
  if (shown === 'replay-welcome')
    return [
      { _tag: 'tour', tap: 'Begin' },
      { _tag: 'tour', tap: 'Skip' },
    ];
  if (shown === 'replay-grows') return [{ _tag: 'tour', tap: 'See' }];
  const acts: readonly Event[] = [
    { _tag: 'remove' },
    { _tag: 'add' },
    { _tag: 'list' },
    { _tag: 'back' },
    { _tag: 'say' },
    { _tag: 'tour', tap: 'How' },
    { _tag: 'tour', tap: 'Leave' },
  ];
  if (shown === 'home-tips') return [...acts, { _tag: 'tour', tap: 'GotIt' }];
  return acts;
};

const eventOf = (random: Random, shown: FirstScreen): Event => {
  const roll = random.below(100);
  if (roll < 5) return { _tag: 'relaunch' };
  if (roll < 9) return { _tag: 'refuse' };
  if (roll < 16) return { _tag: 'allow' };
  return random.pick(eventsOn(random, shown));
};

/** Where one history stands: the storage, the launch, what the port and One show, and what the oracle expects held. */
interface World {
  readonly stand: ReturnType<typeof refusableOf>;
  launch: Launch;
  opening: Opening;
  shown: FirstShown;
  one: Flow;
  expected: boolean;
  removed: boolean;
  clock: number;
}

const worldOf = async (): Promise<World> => {
  const stand = refusableOf();
  const launch = launchOf();
  return {
    stand,
    launch,
    opening: await openingNow(stand.storage),
    shown: launch.first.firstBoot(),
    one: begin(null),
    expected: false,
    removed: false,
    clock: NOW,
  };
};

const callIn = <A>(world: World, name: keyof Calls, args: readonly unknown[]) =>
  callOf(world.stand.storage)<A>(world.launch, name, args);

/** A relaunch: a new launch of the data module over the same file. */
const relaunch = async (world: World) => {
  world.launch = launchOf();
  world.opening = await openingNow(world.stand.storage);
  world.shown = world.launch.first.firstBoot();
  world.one = begin(null);
};

/** What the screen sees, sent to the port (`firstSee`), as the contract's `firstSaw` sends it. */
const see = async (
  world: World,
  ended: readonly [string, string, string],
  startedAt: number,
  graded: boolean,
) => {
  world.shown = await withDataHost(() =>
    world.launch.first.firstSee(
      [...ended, startedAt, graded, world.clock, 1],
      STORE,
      world.stand.storage,
    ),
  );
};

/** The contract's `firstKept` (alone's graded try, and only it) sends the keep; its answer. */
const keep = async (world: World, suggested: 1 | 2 | 3) =>
  callIn<{ answer: string }>(world, 'gardenKeepFirst', [
    REFERENCE,
    recallAt(world.clock, suggested),
    NO_HELP,
    world.clock,
    0,
    1,
  ]);

/** A recital ended in letters or alone: kept there when graded in alone, then seen by the port and by One. */
const recital = async (
  world: World,
  screen: FirstScreen,
  graded: boolean,
  suggested: 1 | 2 | 3,
) => {
  if (screen === 'alone' && graded) await keep(world, suggested);
  await see(world, ['', '', ''], world.clock, graded);
  const inputs: readonly Input[] = [
    { _tag: 'Voice', ended: null },
    { _tag: 'Recital', startedAt: graded ? world.clock : null, finished: graded },
    { _tag: 'Garden', planted: await plantedNow(world.stand.storage) },
  ];
  world.one = inputs.reduce(step, world.one);
};

/** Alone's graded try kept, then a relaunch before the screen sees it: the oracle expects the verse held exactly when the keep landed. */
const keptThenRelaunch = async (world: World) => {
  const kept = await keep(world, 3);
  if (kept.answer === 'Kept') world.expected = true;
  await relaunch(world);
};

const remove = async (world: World) => {
  const removed = await callIn<{ answer: string }>(world, 'gardenRemove', [
    `single:${REFERENCE}`,
    world.clock,
    0,
    1,
  ]);
  if (removed.answer !== 'Removed') return;
  world.expected = false;
  world.removed = true;
};

/** The chooser's Add to single verses of the first verse. */
const add = async (world: World) => {
  const added = await callIn<{ answer: string }>(world, 'gardenJoin', [
    RANGE.book,
    RANGE.chapter,
    RANGE.first,
    RANGE.last,
    world.clock,
    0,
    1,
  ]);
  if (added.answer !== 'Planted') return;
  world.expected = true;
  world.removed = false;
};

/** Each event as the port's screens and the reader's acts send it. */
const apply = (world: World, event: Event, screen: FirstScreen): Promise<unknown> =>
  Match.value(event).pipe(
    Match.tagsExhaustive({
      relaunch: () => relaunch(world),
      refuse: async () => {
        world.stand.refusal.on = true;
      },
      allow: async () => {
        world.stand.refusal.on = false;
      },
      tap: async ({ tap }) => {
        world.shown = world.launch.first.firstTap([tap]);
        world.one = step(world.one, { _tag: tap });
      },
      tour: async ({ tap }) => {
        world.shown = world.launch.first.firstTour([tap]);
        if (tap === 'Continue') world.opening = 'home';
      },
      voice: async ({ end }) => {
        await see(world, end[0], 0, false);
        world.one = step(world.one, { _tag: 'Voice', ended: end[1] });
      },
      recital: ({ graded, suggested }) => recital(world, screen, graded, suggested),
      keptThenRelaunch: () => keptThenRelaunch(world),
      remove: () => remove(world),
      add: () => add(world),
      list: () =>
        callIn(world, 'gardenPlant', [
          RANGE.book,
          RANGE.chapter,
          RANGE.first - 1,
          RANGE.last + 1,
          world.clock,
          0,
          1,
        ]),
      back: () => callIn(world, 'gardenBack', [REFERENCE, world.clock, 0, 1]),
      say: () =>
        callIn(world, 'gardenRecall', [
          REFERENCE,
          recallAt(world.clock, 3),
          NO_HELP,
          world.clock,
          0,
          1,
        ]),
    }),
  );

/**
 * After a step: the verse held at most once; held exactly as the oracle
 * expects (from the step One's `step` reaches Planted, or the keep's write
 * a relaunch cut off from its sight, until the reader's Remove; again only
 * by the reader's Add); newly held only by those; never back once removed
 * but by Add; and never the plant without its hold unless removed.
 */
const check = async (
  world: World,
  where: { readonly seed: number; readonly at: number; readonly seen: readonly string[] },
  event: Event,
  held: { before: number; reached: boolean },
) => {
  const times = await timesHeld(world.stand.storage);
  expect({ ...where, once: times <= 1 }).toEqual({ ...where, once: true });
  expect({ ...where, held: times === 1 }).toEqual({ ...where, held: world.expected });
  const by = ['add', 'keptThenRelaunch'].includes(event._tag) || held.reached;
  if (times > held.before) expect({ ...where, by }).toEqual({ ...where, by: true });
  if (world.removed) expect({ ...where, back: times }).toEqual({ ...where, back: 0 });
  if (!world.removed && (await plantedNow(world.stand.storage)))
    expect({ ...where, stranded: times }).toEqual({ ...where, stranded: 1 });
};

/** One generated history: after every step the invariants of q175 hold. */
const history = async (seed: number) => {
  const random = seeded(seed);
  const world = await worldOf();
  const seen: string[] = [];
  for (let at = 0; at < STEPS; at++) {
    world.clock += 60_000;
    const screen = screenOf(world.shown, world.opening);
    const event = eventOf(random, screen);
    const before = await timesHeld(world.stand.storage);
    const wasPlanted = world.one.phase === 'planted';
    await apply(world, event, screen);
    const reached = !wasPlanted && world.one.phase === 'planted';
    if (reached) world.expected = true;
    seen.push(`${event._tag}:${screen}`);
    await check(world, { seed, at, seen }, event, { before, reached });
  }
  return seen;
};

describe('the first verse is held from Planted as an ordinary single verse (q175)', () => {
  it(`holds it once, from Planted until the reader removes it, over ${RUNS} generated histories`, async () => {
    const reached = new Set<string>();
    for (let seed = 1; seed <= RUNS; seed++)
      for (const each of await history(seed)) reached.add(each);
    for (const want of [
      'recital:alone',
      'keptThenRelaunch:alone',
      'tour:planted',
      'tour:replay-grows',
      'remove:home',
      'add:home',
      'say:home',
      'refuse:alone',
    ])
      expect([...reached].some((each) => each === want || each.startsWith(`${want}`))).toBe(true);
  });

  it("holds what the chooser's Add to single verses holds: the file byte for byte", async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const random = seeded(seed);
      const first = storageOf();
      const hand = storageOf();
      const launches = [launchOf(), launchOf()] as const;
      const lists = random.below(3);
      for (let index = 0; index < lists; index++)
        for (const [stand, launch] of [
          [first, launches[0]],
          [hand, launches[1]],
        ] as const)
          await callOf(stand.storage)(launch, 'gardenPlant', [
            43,
            3,
            1 + 3 * index,
            3 + 3 * index,
            NOW,
            0,
            1,
          ]);
      const recall = recallAt(NOW + seed, random.pick<1 | 2 | 3>([1, 2, 3]));
      await callOf(first.storage)(launches[0], 'gardenKeepFirst', [
        REFERENCE,
        recall,
        NO_HELP,
        NOW,
        0,
        1,
      ]);
      await callOf(hand.storage)(launches[1], 'gardenRecall', [
        REFERENCE,
        recall,
        NO_HELP,
        NOW,
        0,
        1,
      ]);
      await callOf(hand.storage)(launches[1], 'gardenJoin', [
        RANGE.book,
        RANGE.chapter,
        RANGE.first,
        RANGE.last,
        NOW,
        0,
        1,
      ]);
      const bytes = (files: ReadonlyMap<string, ArrayBuffer>) =>
        new TextDecoder().decode(files.get(GARDEN_FILE));
      expect(bytes(first.files)).toBe(bytes(hand.files));
      expect(await timesHeld(first.storage)).toBe(1);
      const opened = (launch: Launch, storage: FileStorage) =>
        callOf(storage)<{ session: { wire: { items: readonly { reference: string }[] } } }>(
          launch,
          'todayOpen',
          ['home', '', '', '5', 'her', LATER, 7],
        );
      const items = (await opened(launches[0], first.storage)).session.wire.items;
      expect(items).toEqual((await opened(launches[1], hand.storage)).session.wire.items);
      expect(items.map((item) => item.reference)).toContain(REFERENCE);
    }
  });

  it('with 20 single verses held already, keeps the recall and holds no 21st, as the chooser would refuse it, and home shows its plant as after any Remove', async () => {
    const stand = storageOf();
    const launch = launchOf();
    const call = callOf(stand.storage);
    for (let verse = 1; verse <= 20; verse++)
      await call(launch, 'gardenJoin', [19, 119, verse, verse, NOW, 0, 1]);
    const kept = await call<{ answer: string }>(launch, 'gardenKeepFirst', [
      REFERENCE,
      recallAt(NOW, 3),
      NO_HELP,
      NOW,
      0,
      1,
    ]);
    expect(kept.answer).toBe('Kept');
    expect(await timesHeld(stand.storage)).toBe(0);
    expect(await plantedNow(stand.storage)).toBe(true);
    const chooser = await call<{ answer: string }>(launch, 'gardenJoin', [
      RANGE.book,
      RANGE.chapter,
      RANGE.first,
      RANGE.last,
      NOW,
      0,
      1,
    ]);
    expect(chooser.answer).toBe('Full');
    const home: HomeShown = await withDataHost(() =>
      launch.home.homeRead([0, NO_PLAN, '', NOW, 1], STORE, stand.storage),
    );
    expect(
      home.singles
        .filter((single) => single.reference === REFERENCE)
        .map((single) => single.removeId),
    ).toEqual(['']);
    const items = (
      await call<{ session: { wire: { items: readonly { reference: string }[] } } }>(
        launch,
        'todayOpen',
        ['home', '', '', '5', 'her', LATER, 7],
      )
    ).session.wire.items;
    expect(items.map((item) => item.reference)).not.toContain(REFERENCE);
  });
});
