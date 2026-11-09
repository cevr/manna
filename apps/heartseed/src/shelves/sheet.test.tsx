/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTernary, eslint/no-await-in-loop -- a React screen test: it drives the sheet in happy-dom through React's promise-based `act` over the device's disk, one case after another in order, draws its cases in plain branches and tallies them in plain maps. */

/**
 * The Add verses sheet at its seam (hsshelves S2-S4), through its rig
 * (`src/test/shelves-rig.tsx`, whose frames hold the sheet's rule over the
 * whole document) and judged against its model (`src/test/shelves-model.ts`).
 *
 * - Over the offer's whole domain, generated: passages unread or read with
 *   0 to 5 held, fields that hold or miss each pick's verses (inside,
 *   overlapping, outside, the own verse), each case opening a picks shelf, a
 *   collection shelf and the shelf its ranges come from. Each offer shows
 *   `Plant` exactly when the model says `plant`, `In your field` exactly
 *   for `in field`, and nothing for `full` or `unread`; the limit line shows
 *   exactly while 3 or more are read.
 * - `Full` by stale props: the props say 2 held while the disk holds 3, so
 *   `Plant` answers `Full`, which shows the limit line, not the alert, with
 *   the shelf still open and no `onAdded`.
 * - Pending blocks the close: while a held plant has not answered, every
 *   control is disabled and Escape calls no `onDone`; `Plant` then `Done`
 *   in one turn makes one add, and `onAdded` runs once.
 * - No paid tier and no verse's words, on every shelf.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import type { Field } from '../field';
import { versesOf } from '../kjv';
import type { PassagesView } from '../passages';
import { below, random } from '../test/garden-model';
import { offerModel, shelvesModel, type ModelList } from '../test/home-model';
import { device } from '../test/one';
import { KEY, storedText, type Held, type Span } from '../test/passages-model';
import { mountShelves, readSheet } from '../test/shelves-rig';
import { LIMIT_WORDS, opened, sheetWant, tapShelf } from '../test/shelves-model';

const SHELVES = shelvesModel();
const listsOf = (title: string): readonly ModelList[] => {
  const lists = SHELVES.find((shelf) => shelf.title === title)?.lists;
  return lists === undefined || lists === 'chooser' ? [] : lists;
};
const PICK_SHELVES = ['Psalms', 'Proverbs', 'The Gospel of John'];
const COLLECTION_SHELVES = SHELVES.slice(4).map((shelf) => shelf.title);
const ALL_LISTS = SHELVES.slice(1).map((shelf) => shelf.title);

const spanOf = (list: ModelList): Span => list.range ?? { book: 1, chapter: 1, first: 1, last: 1 };

/** A field whose rows hold `rows`, each verse a seed. */
const fieldOf = (rows: readonly (readonly string[])[]): Field => ({
  rows: rows.map((verses, index) => ({
    title: `row ${index}`,
    plants: verses.map((reference) => ({ reference, stage: 'seed' as const })),
  })),
  sown: 0,
  harvest: 0,
});

/** A row over `list`'s verses: all of them, some of them, or none, by `how`. */
const rowOver = (list: ModelList, how: number): readonly string[] => {
  if (how === 0) return list.verses;
  if (how === 1) return list.verses.slice(0, Math.max(1, list.verses.length - 1));
  return [];
};

/** One case: the passages, the field's rows, and the three shelves it opens. */
const caseOf = (next: () => number) => {
  const source = ALL_LISTS[below(next, ALL_LISTS.length)] ?? 'Psalms';
  const sourceLists = listsOf(source);
  const unread = below(next, 5) === 0;
  const count = below(next, 6);
  const held: Span[] = [];
  const rows: (readonly string[])[] = [[passage.reference]];
  for (let at = 0; at < count; at++) {
    const list = sourceLists[below(next, sourceLists.length)];
    if (list === undefined) continue;
    held.push(spanOf(list));
    if (!unread) rows.push(list.verses);
  }
  for (const list of sourceLists) {
    const row = rowOver(list, below(next, 4));
    if (row.length > 0) rows.push(row);
  }
  const heldModel: Held = unread ? { tag: 'Unread' } : { tag: 'Read', passages: held };
  const view: PassagesView = unread ? { _tag: 'Unread' } : { _tag: 'Read', passages: held };
  const shelves = [
    PICK_SHELVES[below(next, PICK_SHELVES.length)] ?? 'Psalms',
    COLLECTION_SHELVES[below(next, COLLECTION_SHELVES.length)] ?? 'Rest',
    source,
  ];
  return { heldModel, view, rows, shelves };
};

const PAID = /\b(pro|premium|paid|unlock|subscri|upgrade|price|trial)\b/i;

const leaves = () =>
  [...(document.querySelector('[aria-modal]')?.querySelectorAll('*') ?? [])]
    .filter((node) => node.children.length === 0)
    .map((node) => (node.textContent ?? '').trim())
    .filter((each) => each !== '');

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

describe('the Add verses sheet', () => {
  it("shows each offer's state as the model says, over generated passages and fields, and the limit line exactly while 3 or more are read", () =>
    onRig(new Map(), async (rig) => {
      const next = random(0x5e1f);
      const tally = new Map<string, number>();
      const add = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);
      const wrong: string[] = [];
      let model = opened({ tag: 'Read', passages: [] });
      for (let at = 0; at < 16 && wrong.length === 0; at++) {
        const { heldModel, view, rows, shelves } = caseOf(next);
        await rig.show({ field: fieldOf(rows), passages: view });
        model = { ...model, held: heldModel };
        if (heldModel.tag === 'Read' && heldModel.passages.length >= 3) add('limit');
        for (const title of shelves) {
          if (model.shelf !== title) {
            expect(await rig.tap(title)).toBe(true);
            model = tapShelf(model, title);
          }
          const want = sheetWant(model, rows);
          const seen = await rig.settle(want);
          if (seen !== undefined) {
            wrong.push(`case ${at} ${title}: ${JSON.stringify(seen)}`);
            break;
          }
          for (const list of listsOf(title)) add(offerModel(spanOf(list), heldModel, rows));
        }
      }
      expect(wrong.slice(0, 2)).toEqual([]);
      expect(rig.faults).toEqual([]);
      expect(rig.counts).toEqual({ done: 0, any: 0, added: 0 });
      expect({
        plant: (tally.get('plant') ?? 0) >= 10,
        'in field': (tally.get('in field') ?? 0) >= 10,
        full: (tally.get('full') ?? 0) >= 10,
        unread: (tally.get('unread') ?? 0) >= 10,
        limit: (tally.get('limit') ?? 0) >= 5,
      }).toEqual({ plant: true, 'in field': true, full: true, unread: true, limit: true });
    }));

  const three: Span[] = [
    { book: 19, chapter: 1, first: 1, last: 3 },
    { book: 20, chapter: 15, first: 1, last: 1 },
    { book: 43, chapter: 1, first: 1, last: 5 },
  ];

  it('answers Full by the limit line, not the alert, when the props say 2 held while the disk holds 3; the shelf stays open and home is not shown', () =>
    onRig(new Map([[KEY, storedText(three)]]), async (rig) => {
      const rows = [[passage.reference]];
      await rig.show({
        field: fieldOf(rows),
        passages: { _tag: 'Read', passages: three.slice(0, 2) },
      });
      expect(await rig.tap('Psalms')).toBe(true);
      expect(await rig.tap('Plant Psalms 46:1-3')).toBe(true);
      expect(await rig.until(() => document.querySelector('[data-testid="limit"]') !== null)).toBe(
        true,
      );
      const seen = readSheet();
      expect(seen === 'closed' ? 'closed' : { line: seen.line, open: seen.shelves[1] }).toEqual({
        line: LIMIT_WORDS,
        open: ['Psalms', 'true'],
      });
      expect(document.querySelector('[data-testid="plant-alert"]')).toBeNull();
      expect(rig.counts).toEqual({ done: 0, any: 0, added: 0 });
      expect(device.disk.get(KEY)).toBe(storedText(three));
      expect(rig.faults).toEqual([]);
    }));

  it('holds every control disabled while a plant is pending, closes on no Escape then, and makes one add of Plant then Done in one turn', () =>
    onRig(new Map(), async (rig) => {
      expect(await rig.tap('Proverbs')).toBe(true);
      const live: string[] = [];
      const came = await rig.plantHeld('Plant Proverbs 4:23', 'then-Done', async () => {
        for (const node of document
          .querySelector('[aria-modal]')
          ?.querySelectorAll('[role="button"]') ?? [])
          if (node.getAttribute('aria-disabled') !== 'true')
            live.push(node.getAttribute('aria-label') ?? '');
        await rig.escape();
        expect(rig.counts).toEqual({ done: 0, any: 0, added: 0 });
        expect(readSheet()).not.toBe('closed');
      });
      expect(came).toBe(true);
      expect(live).toEqual([]);
      expect(await rig.until(() => rig.counts.added === 1)).toBe(true);
      expect(rig.counts).toEqual({ done: 0, any: 0, added: 1 });
      expect(device.disk.get(KEY)).toBe(
        storedText([{ book: 20, chapter: 4, first: 23, last: 23 }]),
      );
      expect(readSheet()).toBe('closed');
      expect(rig.faults).toEqual([]);
    }));

  it('names no paid tier and shows no verse words on any shelf', () =>
    onRig(new Map(), async (rig) => {
      const paid: string[] = [];
      const words: string[] = [];
      for (const title of ALL_LISTS) {
        expect(await rig.tap(title)).toBe(true);
        const texts = leaves();
        paid.push(...texts.filter((each) => PAID.test(each) || each.includes('$')));
        for (const list of listsOf(title)) {
          const span = spanOf(list);
          const chapter = versesOf(span.book, span.chapter);
          for (let verse = span.first; verse <= span.last; verse++) {
            const line = chapter[verse - 1] ?? '';
            words.push(
              ...texts.filter(
                (each) =>
                  line !== '' && ((line.includes(each) && each.length > 12) || each.includes(line)),
              ),
            );
          }
        }
      }
      expect(paid).toEqual([]);
      expect(words).toEqual([]);
      expect(rig.faults).toEqual([]);
    }));
});
