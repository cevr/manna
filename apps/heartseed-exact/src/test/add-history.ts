/* oxlint-disable effect/noAsyncFunction, effect/noTernary, effect/noNewPromise, no-await-in-loop -- a test model: each step is awaited as Exact asks its sources one by one, and the oracle's store is read by `Effect.runPromise`. */

/**
 * One generated history of planting through Add verses (spec A3), on the
 * port's sources and on the current Heartseed's own `Passages` and
 * `Garden` over `KeyValueStore.layerMemory` (`garden-model.ts`), side by
 * side. A step plants a chooser range as the chooser offers it (`Plant`
 * at 3 verses or more: `gardenPlant` on the port, `Passages.add` on the
 * current app; one or two verses, while the single verses have room:
 * `gardenJoin` on the port, `Passages.join` on the current app), plants any shelf row (a pick, a
 * promise, a Handbook list: `addPlant` on the port, and on the current app
 * what its sheet runs for the row: `join` for a pick under 3 verses, else
 * `add`, or `plant` for a Handbook list), removes a list or a single
 * verse, or relaunches. After each step the answers, the garden's views
 * and the stored bytes are the current app's, and the invariants hold: no
 * list the reader makes under 3 verses, at most 3 lists, at most 20
 * single verses, and a refused planting writes nothing.
 */

import { runCall } from '@manna/exact-kit/effect';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { listsOf, type List } from '@manna/heartseed/lists';
import {
  LEAST_VERSES,
  MOST_PASSAGES,
  MOST_SINGLES,
  Passages,
  verseReference,
} from '@manna/heartseed/passages';
import { plantsSingly, SHELVES } from '@manna/heartseed/shelves';
import { expect } from 'bun:test';
import { Effect } from 'effect';
import type * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { slugOf } from '../garden/view';
import { readGarden } from '../garden/program';
import { chooserShown, chooserStep, type ChooserRange } from '../chooser/chooser';
import { entriesIn, makeOracle, makePort, plainOf } from './garden-model';
import { seeded, type Random } from './random';

/** Every shelf row, in Add verses' order. */
export const ROWS: readonly List[] = SHELVES.flatMap((shelf) =>
  shelf.source._tag === 'Lists' ? shelf.source.lists : [],
);

const SHORT_ROWS = ROWS.filter(plantsSingly);
const HANDBOOK_ROWS = ROWS.filter((row) => row.source._tag === 'Handbook');

/** The chapters a history chooses from: book, chapter, verse count. */
const CHAPTERS: ReadonlyArray<readonly [number, number, number]> = [
  [43, 3, 36],
  [19, 23, 6],
  [19, 119, 176],
  [57, 1, 25],
  [1, 1, 31],
];

type Step =
  | {
      readonly _tag: 'choose';
      readonly book: number;
      readonly chapter: number;
      readonly range: ChooserRange;
    }
  | { readonly _tag: 'shelf'; readonly row: List }
  | { readonly _tag: 'remove'; readonly id: string }
  | { readonly _tag: 'relaunch' };

const START = Date.UTC(2026, 10, 15, 13, 0, 0);
const HOST = { turn: withDataHost, wait: () => Promise.resolve() };

/** A range the reader taps out: two or three taps on the chapter, some past it. */
const tappedIn = (random: Random, count: number): ChooserRange => {
  let range: ChooserRange = { first: 0, last: 0 };
  for (let n = 1 + random.below(3); n > 0; n--)
    range = chooserStep(
      range,
      random.pick([1 + random.below(count), 1 + random.below(count), count + 2, 0]),
      count,
    );
  return range;
};

const stepOf = (random: Random, ids: readonly string[]): Step => {
  const roll = random.below(100);
  if (roll < 30) {
    const [book, chapter, count] = random.pick(CHAPTERS);
    return { _tag: 'choose', book, chapter, range: tappedIn(random, count) };
  }
  if (roll < 50) return { _tag: 'shelf', row: random.pick(SHORT_ROWS) };
  if (roll < 62) return { _tag: 'shelf', row: random.pick(HANDBOOK_ROWS) };
  if (roll < 80) return { _tag: 'shelf', row: random.pick(ROWS) };
  if (roll < 94)
    return { _tag: 'remove', id: ids.length > 0 ? random.pick(ids) : 'single:John 3:16' };
  return { _tag: 'relaunch' };
};

/** A join, add or plant's answer in the port's words. */
const planted = (answer: string) => {
  if (answer === 'Added') return 'Planted';
  if (answer === 'Held') return 'Already';
  return answer;
};

/** What the current app's sheet runs for `row`. */
const appShelf = (row: List) =>
  Effect.flatMap(Passages, (passages) => {
    const source = row.source;
    if (source._tag === 'Passage' && plantsSingly(row)) return passages.join(source.range);
    if (source._tag === 'Passage') return passages.add(source.range);
    if (source._tag === 'Handbook') return passages.plant(source.id);
    return Effect.succeed('Invalid');
  });

/** Every entry of `store`, sorted by key. */
const dumpOf = (store: KeyValueStore.KeyValueStore) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const keys = yield* store.keys;
      const entries = yield* Effect.forEach(keys, (key) =>
        Effect.map(store.get(key), (value): readonly [string, string] => [key, value ?? '']),
      );
      return [...entries].sort(([a], [b]) => a.localeCompare(b));
    }).pipe(Effect.orDie),
  );

const LANDED = new Set(['Planted', 'Removed']);

/** A chooser step: what the chooser offers for its range, sent to the port and run on the current app; the port's answer and the app's, both empty when nothing is offered. */
const chosen = async (
  port: ReturnType<typeof makePort>,
  oracle: Awaited<ReturnType<typeof makeOracle>>,
  step: Extract<Step, { _tag: 'choose' }>,
  held: number,
  now: number,
  seed: number,
): Promise<readonly [string, string]> => {
  const shown = chooserShown(`${step.book}`, `${step.chapter}`, step.range, '', held);
  const range = { book: step.book, chapter: step.chapter, first: shown.first, last: shown.last };
  if (!shown.singles && !shown.plant) return ['', ''];
  const source = shown.singles ? 'gardenJoin' : 'gardenPlant';
  const answer = (
    await port.call<{ answer: string }>(source, [
      range.book,
      range.chapter,
      range.first,
      range.last,
      now,
      0,
      seed,
    ])
  ).answer;
  const own = await oracle.exec(
    Effect.flatMap(Passages, (passages) =>
      shown.singles ? passages.join(range) : passages.add(range),
    ),
    now,
  );
  return [answer, planted(own)];
};

/** Runs the history of `seed`; a broken step fails with its seed and step. */
export const runAddHistory = async (seed: number, steps: number) => {
  const random = seeded(seed);
  const port = makePort();
  const oracle = await makeOracle();
  let now = START + random.below(86_400_000);
  for (let n = 0; n < steps; n++) {
    const known = await oracle.held(now);
    const ids =
      known.passages._tag === 'Read'
        ? [
            ...listsOf([], known.passages, []).map((list) => list.id),
            ...known.passages.singles.map(
              (range) => `single:${verseReference(range.book, range.chapter, range.first)}`,
            ),
          ]
        : [];
    const step = stepOf(random, ids);
    const writes = port.counts.writes;
    let answer = '';
    let expected = '';
    if (step._tag === 'choose') {
      const held = known.passages._tag === 'Read' ? known.passages.singles.length : 0;
      [answer, expected] = await chosen(port, oracle, step, held, now, seed);
    } else if (step._tag === 'shelf') {
      answer = (
        await port.call<{ answer: string }>('addPlant', [slugOf(step.row.id), now, 0, seed])
      ).answer;
      expected = planted(await oracle.exec(appShelf(step.row), now));
    } else if (step._tag === 'remove') {
      answer = (await port.call<{ answer: string }>('gardenRemove', [step.id, now, 0, seed]))
        .answer;
      expected = String(await oracle.run({ _tag: 'remove', id: step.id }, now));
    } else {
      port.relaunch();
      await oracle.run({ _tag: 'relaunch' }, now);
    }
    const where = { seed, n, step: step._tag, id: step._tag === 'shelf' ? step.row.id : '' };
    expect({ ...where, answer }).toEqual({ ...where, answer: expected });
    if (!LANDED.has(answer))
      expect({ ...where, writes: port.counts.writes }).toEqual({ ...where, writes });
    const after = await runCall(readGarden(port.storage), { now, seed }, HOST);
    const ownAfter = await oracle.held(now);
    expect({ ...where, held: plainOf(after) }).toEqual({ ...where, held: plainOf(ownAfter) });
    const written = [...entriesIn(port.files)].sort(([a], [b]) => a.localeCompare(b));
    expect({ ...where, entries: written }).toEqual({
      ...where,
      entries: await dumpOf(oracle.store),
    });
    if (after.passages._tag === 'Read') {
      const lists = listsOf([], after.passages, []);
      expect({ ...where, most: lists.length <= MOST_PASSAGES }).toEqual({ ...where, most: true });
      const made = lists.filter((list) => list.source._tag === 'Passage');
      expect({ ...where, least: made.every((list) => list.verses.length >= LEAST_VERSES) }).toEqual(
        {
          ...where,
          least: true,
        },
      );
      const singles = after.passages.singles.map((range) =>
        verseReference(range.book, range.chapter, range.first),
      );
      expect({ ...where, singles: singles.length <= MOST_SINGLES }).toEqual({
        ...where,
        singles: true,
      });
    }
    now += 60_000 + random.below(3_600_000);
  }
};
