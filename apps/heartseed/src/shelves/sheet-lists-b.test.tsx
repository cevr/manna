/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTernary, eslint/no-await-in-loop -- a React screen test: it drives the sheet in happy-dom through React's promise-based `act` over the device's disk, one case after another in order, and writes the lists' stored text as the store holds it, JSON. */

/**
 * The Add verses sheet's Handbook shelves, single cases at its seam
 * (hshandbook R12, C6), through its rig (`src/test/shelves-rig.tsx`); the
 * generated property is `sheet-lists.test.tsx`'s.
 *
 * - `Full` by stale props for a list: the props say 2 held while the disk
 *   holds 2 passages and a list, so `Plant` answers `Full`, which shows the
 *   limit line, not the alert, and nothing is written.
 * - `Held` by stale props: the props say no list held while the disk holds
 *   it, so `Plant` answers `Held`, which shows home once and writes nothing.
 * - A pending list plant holds every control disabled and blocks the close;
 *   `Plant` then `Done` in one turn plants once.
 * - No paid tier and no verse's words on three Handbook shelves.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import type { Field } from '../field';
import { versesOf } from '../kjv';
import { HANDBOOK_ORDER, LISTS, type ModelHandbookList } from '../test/handbook-model';
import { device } from '../test/one';
import { KEY, storedText, type Span } from '../test/passages-model';
import { mountShelves, readSheet } from '../test/shelves-rig';
import { LIMIT_WORDS } from '../test/shelves-model';

/** The passages the disk holds. */
const PASSAGES: readonly Span[] = [
  { book: 19, chapter: 46, first: 1, last: 3 },
  { book: 43, chapter: 15, first: 1, last: 3 },
];

/** The model list titled `title`, which the data holds. */
const listNamed = (title: string) =>
  HANDBOOK_ORDER.find((each) => each.title === title) as ModelHandbookList;

const SMYRNA = listNamed('Smyrna');
const EPHESUS = listNamed('Ephesus');

/** A field whose rows hold `rows`, each verse a seed. */
const fieldOf = (rows: readonly (readonly string[])[]): Field => ({
  rows: rows.map((verses, index) => ({
    title: `row ${index}`,
    plants: verses.map((reference) => ({ reference, stage: 'seed' as const })),
  })),
  sown: 0,
  harvest: 0,
});

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

const PAID = /\b(pro|premium|paid|unlock|subscri|upgrade|price|trial)\b/i;

const leaves = () =>
  [...(document.querySelector('[aria-modal]')?.querySelectorAll('*') ?? [])]
    .filter((node) => node.children.length === 0)
    .map((node) => (node.textContent ?? '').trim())
    .filter((each) => each !== '');

describe('the Add verses sheet’s Handbook shelves', () => {
  it('answers Full by the limit line, not the alert, when the props say 2 held while the disk holds 3 with a list among them', () =>
    onRig(
      new Map([
        [KEY, storedText(PASSAGES)],
        [LISTS, JSON.stringify([EPHESUS.id])],
      ]),
      async (rig) => {
        await rig.show({
          field: fieldOf([[passage.reference]]),
          passages: { _tag: 'Read', passages: PASSAGES, lists: [] },
        });
        expect(await rig.tap('Seven Churches')).toBe(true);
        expect(await rig.tap(`Plant ${SMYRNA.title}`)).toBe(true);
        expect(
          await rig.until(() => document.querySelector('[data-testid="limit"]') !== null),
        ).toBe(true);
        const seen = readSheet();
        expect(seen === 'closed' ? 'closed' : seen.line).toBe(LIMIT_WORDS);
        expect(document.querySelector('[data-testid="plant-alert"]')).toBeNull();
        expect(rig.counts).toEqual({ done: 0, any: 0, added: 0 });
        expect(device.disk.get(LISTS)).toBe(JSON.stringify([EPHESUS.id]));
        expect(device.disk.get(KEY)).toBe(storedText(PASSAGES));
        expect(rig.faults).toEqual([]);
      },
    ));

  it('answers Held as Added when the props say the list is not held while the disk holds it: home once, nothing written', () =>
    onRig(new Map([[LISTS, JSON.stringify([SMYRNA.id])]]), async (rig) => {
      await rig.show({
        field: fieldOf([[passage.reference]]),
        passages: { _tag: 'Read', passages: [], lists: [] },
      });
      expect(await rig.tap('Seven Churches')).toBe(true);
      expect(await rig.tap(`Plant ${SMYRNA.title}`)).toBe(true);
      expect(await rig.until(() => rig.counts.added === 1)).toBe(true);
      expect(rig.counts).toEqual({ done: 0, any: 0, added: 1 });
      expect(document.querySelector('[data-testid="plant-alert"]')).toBeNull();
      expect(device.disk.get(LISTS)).toBe(JSON.stringify([SMYRNA.id]));
      expect(device.disk.has(KEY)).toBe(false);
      expect(rig.faults).toEqual([]);
    }));

  it('holds every control disabled while a list plant is pending, closes on no Escape then, and plants once of Plant then Done in one turn', () =>
    onRig(new Map(), async (rig) => {
      expect(await rig.tap('Seven Churches')).toBe(true);
      const live: string[] = [];
      const came = await rig.plantHeld(`Plant ${SMYRNA.title}`, 'then-Done', async () => {
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
      expect(device.disk.get(LISTS)).toBe(JSON.stringify([SMYRNA.id]));
      expect(readSheet()).toBe('closed');
      expect(rig.faults).toEqual([]);
    }));

  it('names no paid tier and shows no verse words on three Handbook shelves', () =>
    onRig(new Map(), async (rig) => {
      const paid: string[] = [];
      const words: string[] = [];
      let lists = 0;
      for (const title of ['Seven Churches', 'The Conscience', 'Prophecy']) {
        expect(await rig.tap(title)).toBe(true);
        const texts = leaves();
        paid.push(...texts.filter((each) => PAID.test(each) || each.includes('$')));
        for (const list of HANDBOOK_ORDER.filter((each) => each.section === title)) {
          lists += 1;
          for (const [book, chapter, verse] of list.places) {
            const line = versesOf(book, chapter)[verse - 1] ?? '';
            words.push(
              ...texts.filter(
                (each) =>
                  line !== '' && ((line.includes(each) && each.length > 12) || each.includes(line)),
              ),
            );
          }
        }
      }
      expect(lists).toBeGreaterThan(10);
      expect(paid).toEqual([]);
      expect(words).toEqual([]);
      expect(rig.faults).toEqual([]);
    }));
});
