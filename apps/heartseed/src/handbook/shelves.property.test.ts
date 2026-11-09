/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the properties draw their cases in plain branches, tally their kinds in plain maps and name a wrong case by its ids as JSON text. */

/**
 * The Handbook's sections as shelves of Add verses, and what their offers
 * say (hshandbook R9, R10), judged against `test/handbook-model.ts` and
 * `test/home-model.ts`, which read `data/handbook.json` itself.
 *
 * - C2: `SHELVES` is the 17 shelves of hsshelves unchanged, then one shelf
 *   per section in the book's order: its title, the scroll, the note
 *   `S. N. Haskell, Bible Handbook (1919)`, and its lists' ids in order; no
 *   title or note names a doctrine.
 * - C3: over generated views (unread, or read with 0-4 passages and 0-4
 *   lists held) and fields that hold all, some or none of a list's verses
 *   (through the list's own row, a passage, the own row or loose rows),
 *   every one of the 131 lists judged at least once: `offerStateOf` is
 *   `offerModel`.
 *
 * It catches a section dropped, moved or renamed, a list off its shelf, a
 * Handbook offer never `in field`, and `full` counting the passages alone.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import type { Field } from '../field';
import { plantedListOf } from '../lists';
import type { PassagesView } from '../passages';
import { offerStateOf, SHELVES } from '../shelves';
import { below, random } from '../test/garden-model';
import {
  HANDBOOK_MODEL,
  HANDBOOK_NOTE,
  HANDBOOK_SECTIONS,
  KNOWN_IDS,
} from '../test/handbook-model';
import { BASE_SHELVES, offerModel, shelvesModel } from '../test/home-model';
import { verseRef, type Held, type Span } from '../test/passages-model';
import { choosableOf } from '../test/passages-rig';

/** A shelf by the fields C2 judges: its id, title, icon, note and list ids. */
interface ShelfSeen {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly note: string;
  readonly ids: readonly string[] | 'chooser';
}

describe('the Handbook shelves', () => {
  it('follow the 17 shelves unchanged, one per section in the book’s order, each with its title, the scroll, the book as its note and its lists in order', () => {
    const got = SHELVES.map((shelf): ShelfSeen => ({
      id: shelf.id,
      title: shelf.title,
      icon: shelf.icon,
      note: shelf.note,
      ids: shelf.source._tag === 'Bible' ? 'chooser' : shelf.source.lists.map((list) => list.id),
    }));
    const base = shelvesModel()
      .slice(0, BASE_SHELVES)
      .map((shelf): ShelfSeen => ({
        id: shelf.id,
        title: shelf.title,
        icon: shelf.icon,
        note: shelf.note,
        ids: shelf.lists === 'chooser' ? 'chooser' : shelf.lists.map((list) => list.id),
      }));
    const handbook = HANDBOOK_SECTIONS.map((section): ShelfSeen => ({
      id: `handbook:${section.id}`,
      title: section.title,
      icon: 'scroll',
      note: HANDBOOK_NOTE,
      ids: section.ids,
    }));
    expect(got).toEqual([...base, ...handbook]);
    expect(got).toHaveLength(42);
    expect(HANDBOOK_NOTE).toBe('S. N. Haskell, Bible Handbook (1919)');
    expect(
      SHELVES.flatMap((shelf) => [shelf.title, shelf.note]).filter((text) =>
        /doctrine/iu.test(text),
      ),
    ).toEqual([]);
  });
});

const OWN = verseRef(23, 41, 10);

/** The verses of `span`, by reference. */
const versesOfSpan = (span: Span) =>
  Array.from({ length: span.last - span.first + 1 }, (_, index) =>
    verseRef(span.book, span.chapter, span.first + index),
  );

/** A field whose rows hold `rows`, each plant a seed. */
const fieldOf = (rows: readonly (readonly string[])[]): Field => ({
  rows: rows.map((references, index) => ({
    title: `row ${index}`,
    plants: references.map((reference) => ({ reference, stage: 'seed' as const })),
  })),
  sown: 0,
  harvest: 0,
});

/** 0-4 distinct known ids from `next`, holding `target` when `own` says so. */
const heldIds = (next: () => number, target: string, own: boolean): string[] => {
  const ids: string[] = own ? [target] : [];
  for (let n = below(next, 5) - ids.length; n > 0; n--) {
    const id = KNOWN_IDS[below(next, KNOWN_IDS.length)] ?? target;
    if (!ids.includes(id) && id !== target) ids.splice(below(next, ids.length + 1), 0, id);
  }
  return ids;
};

/** Rows over the target's `verses` that are not its own row, by `how`: all in one passage-like row, all as loose rows, all but one, or none. */
const coverOf = (next: () => number, verses: readonly string[]): readonly [string, string[][]] => {
  const roll = below(next, 4);
  if (roll === 0) return ['all in a row', [[...verses]]];
  if (roll === 1) return ['all loose', verses.map((verse) => [verse])];
  if (roll === 2 && verses.length > 1) {
    const dropped = below(next, verses.length);
    return ['some', [verses.filter((_, index) => index !== dropped)]];
  }
  return ['none', []];
};

/** One case over the list `target` of `verses`: the view unread or read with 0-4 passages and 0-4 lists (the target among them one time in five), and a field of the own row, the held rows and a cover of the target, with the cover's kind. */
const caseOf = (next: () => number, target: string, verses: readonly string[]) => {
  const unread = below(next, 8) === 0;
  const own = below(next, 5) === 0;
  const lists = heldIds(next, target, own);
  const passages: Span[] = [];
  for (let n = below(next, 5); n > 0; n--) passages.push(choosableOf(next, passages)[1]);
  const rows: string[][] = [[OWN]];
  if (!unread) {
    for (const span of passages) rows.push(versesOfSpan(span));
    for (const id of lists) rows.push([...(HANDBOOK_MODEL.get(id)?.verses ?? [])]);
  }
  const [cover, extra] = own ? ['own row', []] : coverOf(next, verses);
  rows.push(...extra);
  const held: Held = unread ? { tag: 'Unread' } : { tag: 'Read', passages, lists };
  const view: PassagesView = unread ? { _tag: 'Unread' } : { _tag: 'Read', passages, lists };
  return { cover, held, view, rows, lists };
};

describe('a Handbook offer', () => {
  it('is unread while the passages are, in field when the field shows every verse of the list, full at 3 passages and lists held together, else plant', () => {
    const next = random(0x0bb1);
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const covered = new Set<string>();
    const wrong: string[] = [];
    for (let run = 0; run < 4 * KNOWN_IDS.length && wrong.length < 3; run++) {
      const target = KNOWN_IDS[run % KNOWN_IDS.length] ?? '';
      const list = Option.getOrUndefined(plantedListOf(target));
      const model = HANDBOOK_MODEL.get(target);
      if (list === undefined || model === undefined) {
        wrong.push(`${target} missing`);
        continue;
      }
      covered.add(target);
      const { cover, held, view, rows, lists } = caseOf(next, target, model.verses);
      const got = offerStateOf(list, view, fieldOf(rows));
      const want = offerModel(model.verses, held, rows);
      if (got !== want) wrong.push(`${target} ${JSON.stringify(held)} ${cover} ${got} ${want}`);
      bump(want);
      bump(`cover:${cover}`);
      if (want === 'full' && lists.length > 0) bump('full with a list held');
      if (want === 'in field' && !lists.includes(target)) bump('in field by other rows');
    }
    expect(wrong).toEqual([]);
    expect(covered.size).toBe(131);
    const floors: readonly (readonly [string, number])[] = [
      ['unread', 30],
      ['in field', 30],
      ['full', 30],
      ['plant', 30],
      ['full with a list held', 10],
      ['in field by other rows', 5],
    ];
    expect(floors.filter(([kind, least]) => (tally.get(kind) ?? 0) < least)).toEqual([]);
  });
});
