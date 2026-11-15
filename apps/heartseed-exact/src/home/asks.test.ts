/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noNewPromise, effect/noGlobals, no-await-in-loop -- a model test over the port's sources: each call is awaited in turn as Exact asks them, the storage stand-in answers with promises as Exact's does, the steps are plain data, and a stored garden and an answer's weight are their JSON bytes. */

/**
 * Home's asks, its weight, and its sources over a stored garden (spec A4,
 * A5, and A1's stored one-verse list). The asks: generated sequences of
 * Remove, Yes, No, a tap elsewhere and Back, on lists and single verses,
 * run through `askStep` against the port's own garden, beside a small
 * model: nothing is removed without its Yes, an ask open on one row closes
 * when another opens, and after a removal home equals a fresh launch's read.
 */

import { expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { versesOf } from '@manna/heartseed/kjv';
import { placeOf } from '@manna/heartseed/lists';

import { GARDEN_FILE } from '../garden/program';
import { gardenSources } from '../garden/sources';
import { makeQueue } from '../garden/writes';
import { storageOf } from '../test/garden-model';
import { homeCaseOf } from '../test/home-model';
import { seeded, type Random } from '../test/random';
import { askStep, type AskInput } from './asks';
import { homeOf, type HomeShown } from './home';
import { NO_PLAN } from './session';
import { homeSources } from './sources';

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };
const NOW = Date.UTC(2026, 10, 15, 13, 0, 0);

/** The port's garden and home sources over one storage, as one launch holds them. */
const launch = (stand: ReturnType<typeof storageOf>) => {
  const queue = makeQueue();
  const garden = gardenSources({ host: HOST, quiet: true, queue });
  const home = homeSources({ host: HOST, quiet: true, queue });
  const call = <A>(run: (storage: typeof stand.storage) => Promise<A>) =>
    withDataHost(() => run(stand.storage));
  return {
    plant: (book: number, chapter: number, first: number, last: number) =>
      call((storage) =>
        garden.gardenPlant([book, chapter, first, last, NOW, 0, 1], { forget: () => {} }, storage),
      ),
    remove: (id: string) =>
      call((storage) => garden.gardenRemove([id, NOW, 0, 1], { forget: () => {} }, storage)),
    home: (): Promise<HomeShown> =>
      call((storage) => home.homeRead([0, NO_PLAN, '', NOW, 1], { forget: () => {} }, storage)),
  };
};

/** What a Yes can act on, each id by the name that stays with it (a list's id names its place, which a removal before it moves): each list and each single verse planted alone. */
const removablesOf = (home: HomeShown): ReadonlyMap<string, string> =>
  new Map([
    ...home.rows.map((row) => [row.id, row.title] as const),
    ...home.singles.flatMap((single) =>
      single.removeId === '' ? [] : [[single.removeId, single.reference] as const],
    ),
  ]);

const namesOf = (home: HomeShown) => [...removablesOf(home).values()].sort();

/** The next input: after an ask, Yes as often as all the rest. */
const inputOf = (random: Random, ids: readonly string[], asking: string): AskInput => {
  if (asking !== '' && random.chance(0.5)) return { _tag: 'yes' };
  const roll = random.below(6);
  if (roll <= 1 && ids.length > 0) return { _tag: 'ask', key: random.pick(ids) };
  if (roll === 2) return { _tag: 'yes' };
  if (roll === 3) return { _tag: 'no' };
  if (roll === 4) return { _tag: 'elsewhere' };
  return { _tag: 'back' };
};

it('removes nothing without its Yes, keeps one ask open, and shows a fresh read after a removal', async () => {
  let removed = 0;
  let asked = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const random = seeded(seed);
    const stand = storageOf();
    const port = launch(stand);
    await port.plant(43, 3, 16, 18);
    await port.plant(45, 8, 28, 31);
    for (const verse of [1, 2, 3]) await port.plant(19, 23, verse, verse);
    let asking = '';
    let shown = await port.home();
    let present = new Set(namesOf(shown));
    for (let step = 0; step < 8; step++) {
      const ids = removablesOf(shown);
      const input = inputOf(random, [...ids.keys()], asking);
      const before = ids.get(asking) ?? '';
      const next = askStep(asking, input);
      asking = next.asking;
      if (input._tag === 'ask')
        expect({ seed, step, asking }).toEqual({ seed, step, asking: input.key });
      else expect({ seed, step, asking }).toEqual({ seed, step, asking: '' });
      if (input._tag === 'ask') asked++;
      if (next.acts !== '') {
        removed++;
        await port.remove(next.acts);
      }
      const seen = await port.home();
      const want = new Set(present);
      if (input._tag === 'yes' && before !== '') want.delete(before);
      expect({ seed, step, input, names: namesOf(seen) }).toEqual({
        seed,
        step,
        input,
        names: [...want].sort(),
      });
      present = want;
      shown = seen;
      const fresh = await launch(storageOf(stand.files)).home();
      expect({ seed, step, home: seen }).toEqual({ seed, step, home: fresh });
    }
  }
  expect({ removed: removed >= 5, asked: asked >= 15 }).toEqual({ removed: true, asked: true });
});

it('reads a stored one-verse list from before single verses as a single verse', async () => {
  const stand = storageOf();
  const entries = [
    [
      'heartseed/passages',
      JSON.stringify([
        { book: 43, chapter: 3, first: 16, last: 18 },
        { book: 19, chapter: 23, first: 1, last: 1 },
      ]),
    ],
  ];
  stand.files.set(GARDEN_FILE, new TextEncoder().encode(JSON.stringify(entries)).buffer);
  const home = await launch(stand).home();
  expect(home.rows.map((row) => row.title)).toEqual(['John 3:16-18']);
  expect(home.singles.map((single) => [single.reference, single.removeId])).toEqual([
    ['Psalms 23:1', 'single:Psalms 23:1'],
  ]);
  expect(home.singlesShown).toBe(true);
});

it('draws no Single verses section with no single verse (hsminlist T1)', async () => {
  const port = launch(storageOf());
  await port.plant(43, 3, 16, 18);
  const home = await port.home();
  expect({ singles: home.singles.length, shown: home.singlesShown }).toEqual({
    singles: 0,
    shown: false,
  });
  expect((await launch(storageOf()).home()).singlesShown).toBe(false);
});

it('weighs under 20 KB with 3 lists of 20 and 20 single verses, and holds no verse words', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const each = homeCaseOf(seeded(seed), { lists: 3, singles: 20, longest: 20 });
    const home = homeOf({ held: each.held, wire: NO_PLAN, at: each.at });
    const text = JSON.stringify(home);
    expect(home.rows.map((row) => row.plants.length)).toEqual([20, 20, 20]);
    expect(home.singles.length).toBeGreaterThanOrEqual(20);
    expect(new TextEncoder().encode(text).length).toBeLessThan(20_000);
    const references = [
      ...home.rows.flatMap((row) => row.plants.map((plant) => plant.reference)),
      ...home.singles.map((single) => single.reference),
    ];
    const runs = references.flatMap((reference) => {
      const place = placeOf(reference);
      if (place._tag === 'None') return [];
      const words = (
        versesOf(place.value.book, place.value.chapter)[place.value.verse - 1] ?? ''
      ).split(/\s+/u);
      return words.slice(0, -2).map((_, at) => words.slice(at, at + 3).join(' '));
    });
    expect(runs.length).toBeGreaterThan(100);
    expect(runs.filter((run) => text.includes(run))).toEqual([]);
  }
});
