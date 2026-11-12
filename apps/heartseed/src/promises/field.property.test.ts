/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its cases in plain branches, tallies its kinds in plain maps and names a wrong case by its references. */

/**
 * The field's rows with collections taught (F1), at its seam:
 * `fieldOf` over `fieldPassagesOf` (the app's own row, the passages held,
 * the taught collections), judged against `fieldRule`
 * (`src/test/field-model.ts`) over `fieldPassagesModel`
 * (`src/test/promise-model.ts`) for generated gardens over Fear's verses,
 * the held passages' and others, held passages over Fear's verses or not,
 * unread passages, a passage removed since its verses were said, and taught
 * collections none, Fear, or several in any order.
 *
 * It catches a taught row before the passages or missing, a taught row
 * carrying a range (so a `Remove` on its own page), a verse twice in its row, a Fear verse
 * in a held passage shown once, and a removed passage's Fear verse leaving
 * the Fear row for a row of its own.
 */

import { describe, expect, it } from 'bun:test';

import { fieldOf } from '../field';
import { plantOf, type ReadGarden } from '../garden';
import { type PassagesView } from '../passages';
import { COLLECTIONS, TAUGHT } from '../promises';
import { fieldRule, recallOf, type ModelPassage } from '../test/field-model';
import { below, DAY, pickOf, random } from '../test/garden-model';
import { verseRef, type Held, type Span } from '../test/passages-model';
import { choosableOf } from '../test/passages-rig';
import { fieldPassagesModel, promiseVerses } from '../test/promise-model';
import type { Recall } from '../sayit';
import { collectionsOf, fieldPassagesOf } from './taught';

const OWN: readonly ModelPassage[] = [{ title: 'Isaiah 41:10', verses: ['Isaiah 41:10'] }];

const OVER: readonly [Span, ...Span[]] = [
  { book: 19, chapter: 91, first: 1, last: 16 },
  { book: 19, chapter: 121, first: 1, last: 8 },
  { book: 19, chapter: 56, first: 3, last: 4 },
];

const IDS = COLLECTIONS.map((collection) => collection.id);

const FEAR_VERSES = (COLLECTIONS.find((each) => each.id === 'protection')?.promises ?? []).flatMap(
  promiseVerses,
);

const spanVerses = (span: Span) =>
  Array.from({ length: span.last - span.first + 1 }, (_, k) =>
    verseRef(span.book, span.chapter, span.first + k),
  );

/** The read garden of `recalls`, as the garden folds them. */
const gardenOf = (recalls: readonly Recall[]): ReadGarden => {
  const plants = new Map<string, ReturnType<typeof plantOf>>();
  for (const recall of recalls)
    plants.set(
      recall.reference,
      plantOf([...(plants.get(recall.reference)?.recalls ?? []), recall]),
    );
  return { _tag: 'Read', plants };
};

/** Taught ids: Fear, none, or several in any order. */
const taughtOf = (next: () => number): readonly string[] => {
  const roll = below(next, 10);
  if (roll < 2) return [];
  if (roll < 4) return [...IDS].sort(() => next() - 0.5).slice(0, 2 + below(next, 3));
  return TAUGHT;
};

/** Held passages: 0-3 drawn from `OVER` and any choosable range. */
const passagesOf = (next: () => number): Span[] => {
  const passages: Span[] = [];
  for (let n = below(next, 4); n > 0; n--) {
    if (below(next, 2) === 0) passages.push({ ...pickOf(next, OVER) });
    else passages.push(choosableOf(next, passages)[1]);
  }
  return passages;
};

/** One case: the taught ids, the passages held (or unread), a passage removed since its verses were said, and the recalls over the promise, Fear's verses, the passages' and one no row names. */
const caseOf = (next: () => number) => {
  const taught = taughtOf(next);
  const passages = passagesOf(next);
  const removed = below(next, 4) === 0 ? pickOf(next, OVER) : undefined;
  let held: Held = { tag: 'Read', passages };
  let view: PassagesView = { _tag: 'Read', passages, lists: [] };
  if (below(next, 8) === 0) {
    held = { tag: 'Unread' };
    view = { _tag: 'Unread' };
  }
  const candidates = [
    'Isaiah 41:10',
    ...FEAR_VERSES,
    ...passages.flatMap(spanVerses),
    ...(removed === undefined ? [] : spanVerses(removed)),
    'Genesis 1:1',
  ];
  const recalls = candidates
    .filter(() => next() < 0.4)
    .map((reference, k) =>
      recallOf(reference, Date.UTC(2026, 0, 1) + below(next, 90) * DAY + k, 3, 0),
    );
  return { taught, passages, removed, held, view, recalls };
};

describe('the field with collections taught', () => {
  it('shows the app’s row, the passages held, then each taught collection’s verses as one row with no range, every other plant after, as the rule makes it', () => {
    const next = random(44_1);
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const wrong: string[] = [];
    for (let run = 0; run < 600; run++) {
      const { taught, passages, removed, held, view, recalls } = caseOf(next);
      bump(`taught:${taught.length}`);
      const shown = fieldPassagesOf(OWN, view, collectionsOf(taught));
      const got = fieldOf(gardenOf(recalls), shown);
      const want = fieldRule(recalls, fieldPassagesModel(OWN, held, taught));
      const plain = {
        rows: got.rows.map((row) => ({
          title: row.title,
          plants: row.plants.map((plant) => ({ reference: plant.reference, stage: plant.stage })),
        })),
        sown: got.sown,
        harvest: got.harvest,
      };
      const titles = new Set(collectionsOf(taught).map((each) => each.title));
      const ranged = shown.filter((each) => titles.has(each.title) && each.range !== undefined);
      if (JSON.stringify(plain) !== JSON.stringify(want) || ranged.length > 0)
        wrong.push(`${JSON.stringify(taught)} ${JSON.stringify(held)}`);
      const said = new Set(recalls.map((recall) => recall.reference));
      if (held.tag === 'Unread') bump('unread');
      else if (
        taught.includes('protection') &&
        passages.flatMap(spanVerses).some((ref) => FEAR_VERSES.includes(ref) && said.has(ref))
      )
        bump('fear-verse-in-passage');
      if (
        removed !== undefined &&
        taught.includes('protection') &&
        spanVerses(removed).some((ref) => FEAR_VERSES.includes(ref) && said.has(ref))
      )
        bump('removed-fear-verse');
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const kind of [
      'taught:0',
      'taught:1',
      'unread',
      'fear-verse-in-passage',
      'removed-fear-verse',
    ])
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(10);
    expect((tally.get('taught:2') ?? 0) + (tally.get('taught:3') ?? 0)).toBeGreaterThanOrEqual(10);
  });

  it('give the Fear row its 14 verses in order, Psalms 91:1-2 once each, and Psalms 91:1 in both rows over Psalms 91:1-16', () => {
    const shown = fieldPassagesOf(
      OWN,
      { _tag: 'Read', passages: [{ book: 19, chapter: 91, first: 1, last: 16 }], lists: [] },
      collectionsOf(TAUGHT),
    );
    const fear = shown.at(-1);
    expect([shown.length, fear?.title, fear?.verses.length, fear?.range]).toEqual([
      3,
      'Protection & Fear',
      14,
      undefined,
    ]);
    expect(fear?.verses.slice(0, 2)).toEqual(['Psalms 91:1', 'Psalms 91:2']);
    const field = fieldOf(gardenOf([recallOf('Psalms 91:1', Date.UTC(2026, 0, 2), 3, 0)]), shown);
    expect(
      field.rows.map((row) => row.plants.filter((p) => p.reference === 'Psalms 91:1').length),
    ).toEqual([0, 1, 1]);
  });
});
