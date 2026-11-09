/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTernary, eslint/no-await-in-loop -- a React screen test: it drives the sheet in happy-dom through React's promise-based `act` over the device's disk, one case after another in order, draws its cases in plain branches and tallies them in plain maps. */

/**
 * The Add verses sheet's Handbook shelves at its seam (hshandbook R9, R12,
 * C6), through its rig (`src/test/shelves-rig.tsx`) and judged against its
 * model (`src/test/shelves-model.ts`).
 *
 * - Over generated cases, each opening one of `Seven Churches`, `The
 *   Conscience`, `The Bible Sabbath` and `Prophecy` over passages unread or
 *   read with 0-3 passages and 0-3 lists held, and a field holding all, some
 *   or none of each list's verses: each offer shows `Plant <title>`, `In
 *   your field` or nothing exactly as `offerModel` says, and the limit line
 *   shows exactly while 3 or more are held together.
 *
 * Its single cases (`Full` and `Held` by stale props, a pending list plant,
 * no paid tier and no verse's words) are `sheet-lists-b.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import type { Field } from '../field';
import type { PassagesView } from '../passages';
import { below, random } from '../test/garden-model';
import { HANDBOOK_ORDER } from '../test/handbook-model';
import { offerModel, shelvesModel, type ModelList } from '../test/home-model';
import { device } from '../test/one';
import { verseRef, type Held, type Span } from '../test/passages-model';
import { mountShelves } from '../test/shelves-rig';
import { opened, sheetWant, tapShelf } from '../test/shelves-model';

const SHELVES = shelvesModel();
const listsOf = (title: string): readonly ModelList[] => {
  const lists = SHELVES.find((shelf) => shelf.title === title)?.lists;
  return lists === undefined || lists === 'chooser' ? [] : lists;
};

/** The Handbook shelves the cases open. */
const DRAWN = ['Seven Churches', 'The Conscience', 'The Bible Sabbath', 'Prophecy'];

/** The passages a case may hold. */
const PASSAGES: readonly Span[] = [
  { book: 19, chapter: 46, first: 1, last: 3 },
  { book: 43, chapter: 15, first: 1, last: 3 },
  { book: 20, chapter: 3, first: 5, last: 6 },
];

/** A field whose rows hold `rows`, each verse a seed. */
const fieldOf = (rows: readonly (readonly string[])[]): Field => ({
  rows: rows.map((verses, index) => ({
    title: `row ${index}`,
    plants: verses.map((reference) => ({ reference, stage: 'seed' as const })),
  })),
  sown: 0,
  harvest: 0,
});

/** The verses of `span`, by reference. */
const spanVerses = (span: Span) =>
  Array.from({ length: span.last - span.first + 1 }, (_, index) =>
    verseRef(span.book, span.chapter, span.first + index),
  );

/** A row over `list`'s verses: all of them, some of them, or none, by `how`. */
const rowOver = (list: ModelList, how: number): readonly string[] => {
  if (how === 0) return list.verses;
  if (how === 1) return list.verses.slice(0, Math.max(1, list.verses.length - 1));
  return [];
};

/** One case: the shelf it opens, the passages and lists held, and the field's rows. */
const caseOf = (next: () => number) => {
  const title = DRAWN[below(next, DRAWN.length)] ?? 'Seven Churches';
  const shelfLists = listsOf(title);
  const unread = below(next, 5) === 0;
  const passages = PASSAGES.slice(0, below(next, 4));
  const lists: string[] = [];
  for (let n = below(next, 4); n > 0; n--) {
    const from = below(next, 2) === 0 ? shelfLists : HANDBOOK_ORDER;
    const id = from[below(next, from.length)]?.id;
    if (id !== undefined && !lists.includes(id)) lists.push(id);
  }
  const rows: (readonly string[])[] = [[passage.reference]];
  if (!unread) {
    for (const span of passages) rows.push(spanVerses(span));
    for (const id of lists) rows.push(HANDBOOK_ORDER.find((each) => each.id === id)?.verses ?? []);
  }
  for (const list of shelfLists) {
    const row = rowOver(list, below(next, 4));
    if (row.length > 0) rows.push(row);
  }
  const held: Held = unread ? { tag: 'Unread' } : { tag: 'Read', passages, lists };
  const view: PassagesView = unread ? { _tag: 'Unread' } : { _tag: 'Read', passages, lists };
  return { title, held, view, rows, lists };
};

type Rig = Awaited<ReturnType<typeof mountShelves>>;

/** Runs `body` over the sheet mounted over `disk` and made active, and leaves it whatever `body` throws, so one red case leaves no modal to the next. */
const onRig = async (disk: ReadonlyMap<string, string>, body: (rig: Rig) => Promise<void>) => {
  device.launch(disk);
  const rig = await mountShelves();
  const run = async () => {
    expect(await rig.activate()).toBe(true);
    await body(rig);
  };
  await run().finally(rig.leave);
};

describe('the Add verses sheet’s Handbook shelves', () => {
  it("show each offer's state as the model says, over generated passages, lists and fields, and the limit line exactly while 3 or more are held together", () =>
    onRig(new Map(), async (rig) => {
      const next = random(0x2176);
      const tally = new Map<string, number>();
      const add = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);
      const wrong: string[] = [];
      let model = opened({ tag: 'Read', passages: [] });
      for (let at = 0; at < 20 && wrong.length === 0; at++) {
        const { title, held, view, rows, lists } = caseOf(next);
        await rig.show({ field: fieldOf(rows), passages: view });
        model = { ...model, held };
        if (held.tag === 'Read' && held.passages.length + lists.length >= 3) {
          add('limit');
          if (lists.length > 0) add('limit with a list');
        }
        if (model.shelf !== title) {
          expect(await rig.tap(title)).toBe(true);
          model = tapShelf(model, title);
        }
        const want = sheetWant(model, rows);
        const seen = await rig.settle(want);
        if (seen !== undefined) wrong.push(`case ${at} ${title}: ${JSON.stringify(seen)}`);
        for (const list of listsOf(title)) add(offerModel(list.verses, held, rows));
      }
      expect(wrong.slice(0, 2)).toEqual([]);
      expect(rig.faults).toEqual([]);
      expect(rig.counts).toEqual({ done: 0, any: 0, added: 0 });
      const floors: readonly (readonly [string, number])[] = [
        ['plant', 8],
        ['in field', 8],
        ['full', 8],
        ['unread', 8],
        ['limit', 5],
        ['limit with a list', 3],
      ];
      expect(floors.filter(([kind, least]) => (tally.get(kind) ?? 0) < least)).toEqual([]);
    }));
});
