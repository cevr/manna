/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the properties draw their cases in plain branches, tally their kinds in plain maps and name a wrong case by its ids as JSON text. */

/**
 * A Handbook list as a list of the field and of the session (hshandbook
 * R7, R8, R11), judged against `test/handbook-model.ts`, which reads
 * `data/handbook.json` itself.
 *
 * - C1: every one of the 131 lists as `plantedListOf` gives it: its id,
 *   its title (` (n)` on a title's n-th use), its verses distinct in
 *   Haskell's order, a `Handbook` source and no range; ids and titles
 *   unique, and no title a collection's or a section's.
 * - C4: generated views of passages and lists sharing verses, every list
 *   held at least once: `listsOf` is `listsModel` (own, passages, lists,
 *   taught), and `piecesOf` is `piecesWithListsModel`, each reference once
 *   at its first place, grouped by that place's title, its text the
 *   corpus's; an unread view gives the own alone.
 * - C5: one plant per verse: over generated gardens of list verses, their
 *   phrases and other references, a verse shows one stage and one ready
 *   mark in every furrow, the same stage as in the field made without the
 *   lists, the days sown and the harvest are that field's, and a planted
 *   verse only a held list names is a loose row again without the list.
 *
 * It catches a list's verses not made distinct, a title's ` (n)` dropped
 * or put on the first use, the lists put after the taught collections or
 * before the passages, the lists left out of the pieces or kept while
 * unread, a list verse grouped by its reference, and a list's plant drawn
 * at a stage of its own.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Option } from 'effect';

import { readPassage } from '../../vite/passage';
import { fieldOf } from '../field';
import { plantOf, type Plant, type ReadGarden } from '../garden';
import { furrowsOf, readyOf, type Furrow } from '../home';
import { listsOf, plantedListOf, type List } from '../lists';
import { sourceWords } from '../matcher/words';
import { collectionPieces, piecesOf, type PassagesView } from '../passages';
import { COLLECTIONS } from '../promises';
import { collectionsOf } from '../promises/taught';
import type { Recall } from '../sayit';
import { HANDBOOK_ORDER, KNOWN_IDS, piecesWithListsModel } from '../test/handbook-model';
import { listsModel, recordsOf, shelvesModel, taughtOf, type ModelList } from '../test/home-model';
import { below, random } from '../test/garden-model';
import type { Held, ModelTextPiece, Span } from '../test/passages-model';
import { CORPUS, choosableOf, countIn } from '../test/passages-rig';
import { verseOfRule, withPhrasesRule } from '../test/phrase-model';

const words = (text: string) => sourceWords(text).length;

const PROMISE_TEXT = readPassage();

/** The promise as the app's own piece. */
const PROMISE: ModelTextPiece = {
  reference: PROMISE_TEXT.reference,
  text: PROMISE_TEXT.text,
  words: words(PROMISE_TEXT.text),
  group: PROMISE_TEXT.reference,
};

const OWN_ROW = [{ title: PROMISE.reference, verses: [PROMISE.reference] }];

/** A list as plain JSON in the model's shape. */
const plainList = (list: List): ModelList => {
  const span = (range: Span): Span => ({
    book: range.book,
    chapter: range.chapter,
    first: range.first,
    last: range.last,
  });
  return {
    id: list.id,
    title: list.title,
    verses: [...list.verses],
    range: list.range === undefined ? undefined : span(list.range),
    source:
      list.source._tag === 'Passage'
        ? { tag: 'Passage', span: span(list.source.range) }
        : list.source._tag === 'Collection'
          ? { tag: 'Collection', id: list.source.id }
          : list.source._tag === 'Handbook'
            ? { tag: 'Handbook', id: list.source.id }
            : { tag: list.source._tag },
  };
};

/** The list `id` as `plantedListOf` gives it, or undefined. */
const planted = (id: string) => Option.getOrUndefined(plantedListOf(id));

/** The ids of the lists of at most 30 verses. */
const SMALL = KNOWN_IDS.filter((id) => (planted(id)?.verses.length ?? 0) <= 30);

/** A span inside the chapter of a verse of the list `id`, over that verse, from `next`. */
const spanOver = (next: () => number, id: string): Span | undefined => {
  const list = HANDBOOK_ORDER.find((each) => each.id === id);
  const place = list?.places[below(next, list.places.length)];
  if (place === undefined) return undefined;
  const [book, chapter, verse] = place;
  const first = Math.max(1, verse - below(next, 3));
  return { book, chapter, first, last: Math.min(countIn(book, chapter), first + below(next, 6)) };
};

/** A view's held lists from `next`, `first` among them: 1-3 distinct known ids, a small one most often. */
const listsDrawn = (next: () => number, first: string): string[] => {
  const ids = [first];
  for (let n = below(next, 3); n > 0; n--) {
    const pool = below(next, 4) === 0 ? KNOWN_IDS : SMALL;
    const id = pool[below(next, pool.length)] ?? first;
    if (!ids.includes(id)) ids.splice(below(next, ids.length + 1), 0, id);
  }
  return ids;
};

/** A generated case: the own rows, the model's view and the app's, and the taught ids, with its kinds. */
const caseOf = (next: () => number, first: string) => {
  const kinds: string[] = [];
  const lists = below(next, 6) === 0 ? [] : listsDrawn(next, first);
  const passages: Span[] = [];
  for (let n = below(next, 3); n > 0; n--) {
    const over = lists.length > 0 && below(next, 2) === 0;
    const span = over ? spanOver(next, lists[below(next, lists.length)] ?? first) : undefined;
    if (span !== undefined) kinds.push('a passage over a list verse');
    passages.push(span ?? choosableOf(next, passages)[1]);
  }
  const unread = below(next, 10) === 0;
  const held: Held = unread ? { tag: 'Unread' } : { tag: 'Read', passages, lists };
  const view: PassagesView = unread ? { _tag: 'Unread' } : { _tag: 'Read', passages, lists };
  const [, taught] = taughtOf(next);
  const own = below(next, 6) === 0 ? [] : [PROMISE];
  if (unread) kinds.push('unread');
  else kinds.push(`lists:${lists.length}`);
  if (!unread && lists.length > 0 && taught.length > 0) kinds.push('lists and taught');
  return { kinds, own, held, view, taught, lists: unread ? [] : lists };
};

describe('a Handbook list', () => {
  it('is each list of the data: its id, its title with ` (n)` past the first use, its verses distinct in Haskell’s order, a Handbook source and no range', () => {
    const got = KNOWN_IDS.map((id) => {
      const list = planted(id);
      return list === undefined ? null : plainList(list);
    });
    const want = HANDBOOK_ORDER.map((list): ModelList => ({
      id: list.id,
      title: list.title,
      verses: [...list.verses],
      range: undefined,
      source: { tag: 'Handbook', id: list.id },
    }));
    expect(got).toEqual(want);
    expect(got.length).toBe(131);
    const titles = want.map((list) => list.title);
    expect(new Set(titles).size).toBe(131);
    expect(new Set(want.map((list) => list.id)).size).toBe(131);
    expect(titles.filter((title) => title.startsWith('Second Chapter of Daniel'))).toEqual([
      'Second Chapter of Daniel',
      'Second Chapter of Daniel (2)',
    ]);
    const others = new Set([
      ...COLLECTIONS.map((collection) => collection.title),
      ...shelvesModel().map((shelf) => shelf.title),
    ]);
    expect(titles.filter((title) => others.has(title))).toEqual([]);
    expect(planted('no-such-list')).toBeUndefined();
  });
});

describe('the field and the session over held lists', () => {
  it('give the own rows, the passages, the lists in stored order, then the taught collections, and the pieces in that order, each reference once at its first place', () => {
    const next = random(21_76);
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const covered = new Set<string>();
    const wrong: string[] = [];
    for (let run = 0; run < 2 * KNOWN_IDS.length; run++) {
      const first = KNOWN_IDS[run % KNOWN_IDS.length] ?? '';
      const drawn = caseOf(next, first);
      for (const kind of drawn.kinds) bump(kind);
      for (const id of drawn.lists) covered.add(id);
      const collections = collectionsOf(drawn.taught);
      const ownRows = drawn.own.length === 0 ? [] : OWN_ROW;
      const gotLists = listsOf(ownRows, drawn.view, collections).map(plainList);
      const wantLists = listsModel(ownRows, drawn.held, drawn.taught);
      if (JSON.stringify(gotLists) !== JSON.stringify(wantLists))
        wrong.push(`lists ${JSON.stringify(drawn.held)} ${JSON.stringify(drawn.taught)}`);
      const got = piecesOf(drawn.own, drawn.view, collectionPieces(collections));
      const want = piecesWithListsModel(
        CORPUS,
        drawn.own,
        drawn.held,
        drawn.taught,
        words,
        withPhrasesRule,
      );
      if (JSON.stringify(got) !== JSON.stringify(want))
        wrong.push(`pieces ${JSON.stringify(drawn.held)} ${JSON.stringify(drawn.taught)}`);
      const listed = drawn.lists.flatMap((id) => planted(id)?.verses ?? []);
      if (new Set(listed).size < listed.length) bump('two lists share a verse');
      const titles = new Set(drawn.lists.map((id) => planted(id)?.title));
      const groups = new Map(want.map((piece) => [piece.reference, piece.group]));
      if (listed.some((verse) => !titles.has(groups.get(verse))))
        bump('a list verse kept at an earlier place');
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    expect(covered.size).toBe(131);
    for (const [kind, floor] of [
      ['unread', 10],
      ['lists:1', 30],
      ['lists:3', 30],
      ['a passage over a list verse', 30],
      ['two lists share a verse', 5],
      ['a list verse kept at an earlier place', 30],
      ['lists and taught', 30],
    ] as const)
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(floor);
  });

  it('give the own alone, and no list, while the view is unread', () => {
    const view: PassagesView = { _tag: 'Unread' };
    expect(listsOf(OWN_ROW, view, []).map((list) => list.id)).toEqual([`own:${PROMISE.reference}`]);
    expect(piecesOf([PROMISE], view, [])).toEqual([PROMISE]);
  });
});

/** A read garden of `records`, each reference's plant folded by the garden. */
const gardenOf = (records: readonly Recall[]): ReadGarden => {
  const byReference = new Map<string, Recall[]>();
  for (const recall of records)
    byReference.set(recall.reference, [...(byReference.get(recall.reference) ?? []), recall]);
  const plants = new Map<string, Plant>();
  for (const [reference, recalls] of byReference)
    if (Arr.isReadonlyArrayNonEmpty(recalls)) plants.set(reference, plantOf(recalls));
  return { _tag: 'Read', plants };
};

/** Each verse's `<stage> <ready>` over `furrows`; a verse shown two ways goes to `wrong`. */
const marksOf = (furrows: readonly Furrow[], wrong: string[]) => {
  const shown = new Map<string, string>();
  for (const plant of furrows.flatMap((furrow) => furrow.plants)) {
    const mark = `${plant.stage} ${plant.ready}`;
    const before = shown.get(plant.reference) ?? mark;
    if (before !== mark) wrong.push(`${plant.reference} shows ${mark} and ${before}`);
    shown.set(plant.reference, mark);
  }
  return shown;
};

/** Each verse of `furrows` shown one way, and each verse of `bare` (the field without the lists) shown in `furrows` the same way. */
const sameStages = (furrows: readonly Furrow[], bare: readonly Furrow[], wrong: string[]) => {
  const shown = marksOf(furrows, wrong);
  for (const [verse, mark] of marksOf(bare, wrong))
    if (shown.get(verse) !== mark) wrong.push(`${verse} ${shown.get(verse)} ≠ ${mark}`);
};

/** How many planted verses only a held list names; each must be a loose row of the field without the lists (`rows`, past `without`'s). */
const looseAgain = (
  records: readonly Recall[],
  lists: readonly List[],
  without: readonly List[],
  rows: readonly { readonly title: string }[],
  wrong: string[],
) => {
  const named = new Set(without.flatMap((list) => list.verses));
  const listed = new Set(lists.flatMap((list) => list.verses));
  const looseRows = new Set(rows.slice(without.length).map((row) => row.title));
  let count = 0;
  for (const verse of new Set(records.map((recall) => verseOfRule(recall.reference)))) {
    if (!listed.has(verse) || named.has(verse)) continue;
    count += 1;
    if (!looseRows.has(verse)) wrong.push(`${verse} not loose without its list`);
  }
  return count;
};

describe('one plant per verse', () => {
  it('shows a list verse at the stage the field gives it without the lists, with the same days sown and harvest, and a verse only a list names loose again without it', () => {
    const next = random(21_77);
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const wrong: string[] = [];
    for (let run = 0; run < 160 && wrong.length < 3; run++) {
      const drawn = caseOf(next, SMALL[run % SMALL.length] ?? '');
      if (drawn.view._tag === 'Unread') continue;
      const collections = collectionsOf(drawn.taught);
      const lists = listsOf(OWN_ROW, drawn.view, collections);
      const without = listsOf(OWN_ROW, { ...drawn.view, lists: [] }, collections);
      const records = recordsOf(
        next,
        listsModel(OWN_ROW, drawn.held, drawn.taught),
        PROMISE.reference,
      );
      const garden = gardenOf(records);
      const items = [...new Set(records.map((recall) => recall.reference))]
        .filter(() => below(next, 2) === 0)
        .map((reference) => ({ reference, fresh: false, recalls: 0, seconds: 12 }));
      const ready = readyOf(Option.some({ items }), garden);
      sameStages(furrowsOf(garden, lists, ready), furrowsOf(garden, without, ready), wrong);
      const field = fieldOf(garden, lists);
      const bareField = fieldOf(garden, without);
      if (field.sown !== bareField.sown || field.harvest !== bareField.harvest)
        wrong.push(`sown or harvest ${JSON.stringify(drawn.lists)}`);
      const loose = looseAgain(records, lists, without, bareField.rows, wrong);
      for (let n = loose; n > 0; n--) bump('a verse only a list names, loose again');
      const listed = lists.flatMap((list) => list.verses);
      if (new Set(listed).size < listed.length) bump('a verse in two furrows');
      if (records.some((recall) => verseOfRule(recall.reference) !== recall.reference))
        bump('phrase plants');
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const [kind, floor] of [
      ['a verse only a list names, loose again', 30],
      ['a verse in two furrows', 30],
      ['phrase plants', 30],
    ] as const)
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(floor);
  });
});
